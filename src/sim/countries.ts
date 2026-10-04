// Real countries as starting points. Every setting comes from researched data (countryData.ts),
// either directly ("measured"), through a stated formula ("derived"), by calibration so the
// simulation reproduces an observed outcome ("fitted", see countryFit.ts), or, where no comparable
// figure exists, as a clearly marked estimate or the model's neutral default.
// The user cannot change these settings; only the number of simulated people (a sample) and
// whether random events happen.

import { defaultScenario, type FaithGroup, type Ideology, type ScenarioConfig } from './config';
import { COUNTRIES, COUNTRY_DATA_DATE, type CountryRaw } from './countryData';
import { COUNTRY_FIT, type CountryFit } from './countryFit';
import { FAITH_PROFILE_BY_ID, profileFields } from './faiths';

export type DataKind = 'measured' | 'derived' | 'fitted' | 'estimate' | 'default';

export interface SheetRow {
  section: string;
  label: string;
  /** The real-world figure as published. */
  value: string;
  /** The model setting it becomes (when it is not the same number). */
  setting?: string;
  source: string;
  kind: DataKind;
}

/** Observed outcomes the simulation is calibrated to reproduce at the start. */
export interface CountryTargets {
  tfr: number;
  lifeExp: number;
  medianAge: number;
  meanSchooling: number;
  urban: number;
  gdpGrowthPerPerson: number;
  netMigration: number;
}

export const REAL_DATA_DATE = COUNTRY_DATA_DATE;

export function realCountries(): { id: string; name: string; population: number }[] {
  return COUNTRIES.map((c) => ({ id: c.id, name: c.name, population: c.population }));
}

const WPP = 'UN World Population Prospects 2024 (medium variant, 2026)';
const VDEM = 'V-Dem v16 (2026 release), 2025 data';
const VPARTY = 'V-Party (V-Dem), party positions';
/** Productivity growth at the frontier, % a year (same for every country). */
const LONG_RUN_GROWTH = 1.5;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const pct = (v: number, d = 0) => `${v.toFixed(d)}%`;
/** Standard normal CDF: turns V-Dem's latent scales into 0–1. */
function phi(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

export function countryTargets(c: CountryRaw): CountryTargets {
  return {
    tfr: c.tfr.v,
    lifeExp: c.lifeExp,
    medianAge: c.medianAge,
    meanSchooling: c.meanSchooling,
    urban: c.urban / 100,
    gdpGrowthPerPerson: c.growth - c.popGrowth,
    netMigration: c.netMigration,
  };
}

/** Starting values for the fitted settings before calibration has been run. */
function defaultFit(c: CountryRaw): CountryFit {
  return {
    fertilityNorm: 0, healthSpend: 0.5, education: c.meanSchooling + 2, growthMomentum: c.growth - c.popGrowth - 1,
    immigration: c.netMigration > 0 ? 0.3 : 0.05, emigrationScale: 1, startHealth: 0.75, achieved: null,
  };
}

/**
 * Give each group religiosity from its tradition's profile, scaled so the country's average matches
 * the measured share who say religion is very important (relative differences between groups stay).
 */
function scaleReligiosity(faiths: FaithGroup[], target: number) {
  const religious = faiths.filter((f) => !f.secular);
  let s = 1;
  for (let it = 0; it < 30; it++) {
    let mean = 0, tot = 0;
    for (const f of faiths) {
      const r = f.secular ? 0.05 : Math.min(0.97, (FAITH_PROFILE_BY_ID[f.profile ?? '']?.religiosity ?? f.religiosity) * s);
      mean += r * f.share; tot += f.share;
    }
    mean /= tot || 1;
    if (Math.abs(mean - target) < 0.002) break;
    s *= target / Math.max(0.01, mean);
  }
  for (const f of religious) f.religiosity = Math.min(0.97, (FAITH_PROFILE_BY_ID[f.profile ?? '']?.religiosity ?? f.religiosity) * s);
}

/** Build the locked scenario for a real country, with a data sheet saying where every setting comes from. */
export function countryScenario(id: string, size: number): { scenario: ScenarioConfig; sheet: SheetRow[]; targets: CountryTargets; country: CountryRaw } {
  const c = COUNTRIES.find((x) => x.id === id);
  if (!c) throw new Error('Unknown country ' + id);
  const fit = COUNTRY_FIT[c.id] ?? defaultFit(c);
  const sc = defaultScenario();
  const P = sc.population, S = sc.society;
  const sheet: SheetRow[] = [];
  const row = (section: string, label: string, value: string, source: string, kind: DataKind, setting?: string) => sheet.push({ section, label, value, setting, source, kind });
  const f2 = (v: number) => v.toFixed(2);

  // ---------------- people ----------------
  P.size = size;
  P.realPopulation = c.population;
  row('People', 'Population', `${(c.population / 1e6).toFixed(c.population > 1e8 ? 0 : 1)} million`, WPP, 'measured', `${size.toLocaleString('en-US')} simulated people, each standing for ${Math.round(c.population / size).toLocaleString('en-US')}`);
  P.ageBands = c.ageBands;
  P.ageStructure = 0.5;
  row('People', 'Age structure', `median age ${c.medianAge.toFixed(1)}`, `${WPP}: population by 5-year age group`, 'measured', 'the real age pyramid');
  P.urbanShare = c.urban / 100;
  row('People', 'Living in cities', pct(c.urban, 1), 'World Bank WDI, urban population share, 2024', 'measured');
  P.cities = Math.max(4, Math.min(16, Math.round(2 + Math.log2(c.population / 5e6))));
  row('People', 'Number of cities on the map', String(P.cities), 'Scales with population (2 + log₂ of population in units of 5 million)', 'derived');
  P.education = fit.education;
  row('People', 'Schooling of adults (25+)', `${c.meanSchooling.toFixed(1)} years`, 'UNDP Human Development Report 2025 (2023 data)', 'fitted', `young adults' schooling ${fit.education.toFixed(1)} years, calibrated so adults 25+ average ${c.meanSchooling.toFixed(1)}`);
  P.health = fit.startHealth;
  row('People', 'Physical health', `life expectancy ${c.lifeExp.toFixed(1)}`, WPP, 'fitted', `${f2(P.health)}, the level the simulated living conditions sustain (so there is no start-up jump in deaths)`);
  P.wealthInequality = c.wealthGini.v / 100;
  row('Economy', 'Wealth inequality (Gini)', f2(c.wealthGini.v / 100), c.wealthGini.src, c.wealthGini.src.startsWith('No UBS') ? 'estimate' : 'measured');

  // ---------------- faith ----------------
  P.faiths = c.faiths.map((g) => {
    const pf = profileFields(g.profile);
    if (!pf) throw new Error('Unknown faith profile ' + g.profile);
    return { ...pf, share: g.share / 100, ...(g.name ? { name: g.name } : {}) } as FaithGroup;
  });
  const relTarget = 0.1 + 0.85 * (c.religionImportant.v / 100);
  scaleReligiosity(P.faiths, relTarget);
  for (const g of c.faiths) {
    const f = P.faiths.find((x) => x.profile === g.profile)!;
    row('Faith', f.name, pct(g.share, g.share < 1 ? 2 : 1), c.faithSource, 'measured', `profile: ${FAITH_PROFILE_BY_ID[g.profile].tradition}, ${FAITH_PROFILE_BY_ID[g.profile].context}; devotion ${f2(f.religiosity)}`);
  }
  row('Faith', 'Religion "very important"', pct(c.religionImportant.v), c.religionImportant.src, c.religionImportant.src.startsWith('Derived') ? 'derived' : 'measured',
    `average devotion ${f2(relTarget)} (0.1 + 0.85 × share); each group keeps its tradition's relative devotion`);
  const fav = Math.max(0, P.faiths.findIndex((f) => !f.secular));
  S.religiousPolicy = c.religiousPolicy.v;
  S.favoredFaith = fav;
  row('Faith', 'State and religion', c.religiousPolicy.v === 'favor' ? `favours ${P.faiths[fav].name}` : c.religiousPolicy.v, c.religiousPolicy.src, 'measured');

  // ---------------- economy ----------------
  S.startYear = 2026;
  S.gdpPerCapita = c.gdpPPP;
  row('Economy', 'GDP per person (PPP)', `$${c.gdpPPP.toLocaleString('en-US')}`, 'IMF World Economic Outlook, April 2026 (2026 estimate, current international $)', 'measured');
  S.techGrowth = LONG_RUN_GROWTH;
  S.growthMomentum = fit.growthMomentum;
  row('Economy', 'Growth per person', pct(c.growth - c.popGrowth, 1), `IMF April 2026 real GDP growth ${pct(c.growth, 1)} minus population growth ${pct(c.popGrowth, 2)} (${WPP})`, 'fitted',
    `${fit.growthMomentum >= 0 ? '+' : ''}${fit.growthMomentum.toFixed(2)} points of growth above the model's own, halving every 10 years (growth regresses to the mean: Pritchett & Summers 2014)`);
  row('Economy', 'Long-run productivity growth', '—', 'Same for every country; long-run growth then differs through institutions, schooling and catch-up', 'default', pct(LONG_RUN_GROWTH, 1) + ' a year');
  S.marketFreedom = clamp01((phi(c.vdem.stateOwnership) + c.vdem.propertyRights) / 2);
  row('Economy', 'Market freedom', f2(S.marketFreedom), `${VDEM}: mean of (low) state ownership of the economy and property rights`, 'derived');
  S.taxRate = Math.min(0.6, c.taxRevenue.v / 100);
  row('Economy', 'Tax take', pct(c.taxRevenue.v, 1) + ' of GDP', c.taxRevenue.src, 'measured');
  S.progressivity = clamp01(c.topTaxRate.v / 50);
  row('Economy', 'Tax progressivity', `top rate ${pct(c.topTaxRate.v, 1)}`, c.topTaxRate.src, 'derived', `${f2(S.progressivity)} (top rate ÷ 50%)`);
  S.welfare = clamp01(c.socialSpending.v / 35);
  row('Economy', 'Welfare', pct(c.socialSpending.v, 1) + ' of GDP', c.socialSpending.src, 'derived', `${f2(S.welfare)} (spending ÷ 35% of GDP)`);
  S.eduAccess = clamp01((c.expectedSchooling - 4) / 13);
  row('Economy', 'Access to schooling', `${c.expectedSchooling.toFixed(1)} expected years`, 'UNDP Human Development Report 2025: expected years of schooling', 'derived', `${f2(S.eduAccess)} ((years − 4) ÷ 13)`);
  S.healthSpend = fit.healthSpend;
  S.diseaseBurden = fit.diseaseBurden ?? 0;
  row('Economy', 'Healthcare', `life expectancy ${c.lifeExp.toFixed(1)}`, WPP, 'fitted',
    `health investment ${f2(fit.healthSpend)}${S.diseaseBurden ? `, disease burden ${f2(S.diseaseBurden)}` : ''}, calibrated to the life expectancy`);
  S.socialMedia = clamp01(c.socialMedia.v / 100);
  row('Culture', 'On social media', pct(c.socialMedia.v, 1), c.socialMedia.src, c.socialMedia.src.includes('estimate') ? 'estimate' : 'measured');

  // ---------------- government ----------------
  S.democracy = clamp01((c.vdem.polyarchy + c.freedomHouse / 100) / 2);
  row('Government', 'Democracy', `V-Dem ${f2(c.vdem.polyarchy)}, Freedom House ${c.freedomHouse}/100`, `${VDEM} (electoral democracy index); Freedom House, Freedom in the World 2026`, 'derived', `${f2(S.democracy)} (average of the two)`);
  S.ruleOfLaw = c.vdem.rule;
  row('Government', 'Rule of law', f2(c.vdem.rule), `${VDEM}: rule of law index`, 'measured');
  S.pressFreedom = c.vdem.freexp;
  row('Government', 'Free press and speech', f2(c.vdem.freexp), `${VDEM}: freedom of expression and alternative sources of information`, 'measured');
  S.repression = clamp01(1 - (c.vdem.clphy + c.vdem.clpol) / 2);
  row('Government', 'Repression', f2(S.repression), `${VDEM}: 1 − average of physical-integrity and political civil-liberties indices`, 'derived');
  const sinceCoup = c.lastCoup ? 2026 - c.lastCoup : 999;
  S.securityLoyalty = clamp01(0.9 - 0.3 * Math.exp(-sinceCoup / 15));
  row('Government', 'Army & police loyalty', c.lastCoup ? `last coup ${c.lastCoup}` : 'no coup in living memory', 'Powell & Thyne coup dataset (via V-Dem); loyalty recovers with time since the last coup', 'derived', f2(S.securityLoyalty));
  S.genderEquality = c.vdem.gender;
  row('Government', "Women's status", f2(c.vdem.gender), `${VDEM}: women's political empowerment index`, 'measured');
  S.minorityBias = clamp01(0.6 * c.vdem.exclusion);
  row('Government', 'Discrimination against minorities', f2(c.vdem.exclusion), 'V-Dem v16: exclusion by social group index (2023, latest)', 'derived', `${f2(S.minorityBias)} (0.6 × index)`);
  S.military = clamp01(c.militarySpending / 6);
  row('Government', 'Military', pct(c.militarySpending, 1) + ' of GDP', 'SIPRI Military Expenditure Database (2024)', 'derived', `${f2(S.military)} (share ÷ 6%)`);
  S.policing = clamp01(0.3 + 0.4 * c.vdem.rule);
  row('Government', 'Policing', '—', 'No comparable cross-national measure; set from the rule of law (0.3 + 0.4 × index)', 'estimate', f2(S.policing));
  S.familyPlanning = c.familyPlanning.v;
  row('Government', 'Family-planning programmes', c.familyPlanning.v > 0 ? 'yes' : 'no', c.familyPlanning.src, 'derived', f2(c.familyPlanning.v));
  S.electionYears = c.electionYears;
  row('Government', 'Years between elections', String(c.electionYears), 'Constitution (term of parliament or president)', 'measured');
  const gov = c.government;
  S.ruling = { social: gov.social, econ: gov.econ, auth: gov.auth, relig: gov.relig, patriot: gov.patriot } as Ideology;
  row('Government', 'Who governs', gov.label, `${VPARTY} for ${gov.party} as coded for ${gov.year}`, 'measured',
    `social ${f2(gov.social)} · economy ${f2(gov.econ)} · authority ${f2(gov.auth)} · religion ${f2(gov.relig)} · nation ${f2(gov.patriot)}`);
  S.politicsEndogenous = true;
  S.anchorPolicies = true;
  row('Government', 'How policy changes', 'elections, coups, revolutions', 'Model rule', 'default',
    "governments move policies from today's measured levels by as much as their platform differs from the current government's");

  // ---------------- migration & fertility (calibrated) ----------------
  S.immigration = fit.immigration;
  S.emigrationScale = fit.emigrationScale;
  row('People', 'Net migration', `${c.netMigration > 0 ? '+' : ''}${c.netMigration.toFixed(1)} per 1,000`, WPP, 'fitted', `openness to immigrants ${f2(fit.immigration)}, emigration ×${fit.emigrationScale.toFixed(2)}`);
  S.fertilityNorm = fit.fertilityNorm;
  S.contraceptionShift = fit.contraceptionShift ?? 0;
  row('People', 'Children per woman', c.tfr.v.toFixed(2), c.tfr.src, 'fitted',
    `family-size norm ${fit.fertilityNorm >= 0 ? '+' : ''}${fit.fertilityNorm.toFixed(2)} children${S.contraceptionShift ? `, birth control ${S.contraceptionShift > 0 ? '+' : ''}${f2(S.contraceptionShift)} vs. what income predicts` : ''}`);

  // ---------------- culture & values ----------------
  S.collectivism = clamp01(0.15 + 0.75 * (1 - c.individualism / 100));
  row('Culture', 'Collectivism', `individualism ${c.individualism}/100`, 'Hofstede, Hofstede & Minkov (2010), Cultures and Organizations', 'derived', `${f2(S.collectivism)} (0.15 + 0.75 × (1 − score/100))`);
  P.socialValues = clamp01(0.2 + 0.55 * c.acceptHomosexuality.v / 100);
  row('Culture', 'Social values', `${pct(c.acceptHomosexuality.v)} say homosexuality should be accepted`, c.acceptHomosexuality.src, c.acceptHomosexuality.src.includes('estimate') ? 'estimate' : 'derived', `${f2(P.socialValues)} (0.2 + 0.55 × share)`);
  P.valueSpread = clamp01(0.35 + 0.5 * phi(c.vdem.polarization / 1.5));
  row('Culture', 'Polarization', f2(c.vdem.polarization), `${VDEM}: polarization of society (latent scale)`, 'derived', f2(P.valueSpread));
  P.economicValues = c.electorate.econ;
  row('Culture', 'Economic views', f2(c.electorate.econ), `${VPARTY}: vote-weighted economic left–right of parties (${c.electorate.year} election)`, 'derived');
  P.authoritarianism = clamp01(0.3 + 0.5 * c.electorate.auth);
  row('Culture', 'Desire for a strong leader', f2(c.electorate.auth), `${VPARTY}: vote-weighted anti-pluralism (${c.electorate.year} election)`, 'derived', `${f2(P.authoritarianism)} (0.3 + 0.5 × value)`);
  P.patriotism = clamp01(0.35 + 0.5 * c.electorate.patriot);
  row('Culture', 'Nationalism', f2(c.electorate.patriot), `${VPARTY}: vote-weighted appeals to cultural superiority (${c.electorate.year} election)`, 'derived', `${f2(P.patriotism)} (0.35 + 0.5 × value)`);
  P.tolerance = 0.75 + 0.35 * phi(c.vdem.religiousFreedom);
  row('Culture', 'Tolerance', f2(c.vdem.religiousFreedom), `${VDEM}: freedom of religion (latent scale)`, 'derived', `multiplier ${f2(P.tolerance)}`);
  P.socialTrust = clamp01(0.15 + 0.6 * c.socialTrust.v / 100);
  row('Culture', 'Trust in other people', pct(c.socialTrust.v), c.socialTrust.src, 'derived', `${f2(P.socialTrust)} (0.15 + 0.6 × share)`);
  if (c.institutionalTrust) {
    P.institutionalTrust = clamp01(c.institutionalTrust.v);
    row('Culture', 'Trust in government', pct(c.institutionalTrust.v * 100), c.institutionalTrust.src, 'measured');
  } else {
    P.institutionalTrust = 0.5;
    row('Culture', 'Trust in government', '—', 'No comparable recent figure found; Gallup\'s global median (≈50%)', 'default', '0.50');
  }
  row('Culture', 'Personality, empathy, aggression, materialism', '—', 'No reliable national averages: global defaults', 'default');
  for (const k of Object.keys(S.trends) as (keyof typeof S.trends)[]) S.trends[k] = 0;
  row('Culture', 'Media & state trends', 'none', 'No assumed push: values change only through people, generations and events', 'default');

  S.name = c.name;
  sc.real = { countryId: c.id, name: c.name, asOf: COUNTRY_DATA_DATE };
  return { scenario: sc, sheet, targets: countryTargets(c), country: c };
}
