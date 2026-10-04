// Starting points. Every preset is a filled-in set of sliders; the user can change anything.
// Faith groups use real traditions with region-specific, survey-based profiles (see faiths.ts).
// Where Pew Research or national statistics published projections, the description says so,
// so the simulation can be compared with them.

import { defaultScenario, type FaithGroup, type ScenarioConfig } from './config';
import type { ScheduledEvent } from './events';
import { profileFields } from './faiths';

export interface Preset {
  id: string;
  name: string;
  era: string;
  description: string;
  apply: (s: ScenarioConfig) => void;
}

let uidN = 0;
const ev = (templateId: string, year: number, month = 0, intensity = 1, extra: Partial<ScheduledEvent> = {}): ScheduledEvent => ({
  uid: `p${++uidN}`, templateId, year, month, intensity, ...extra,
});

/** A faith group from a library profile with a share and optional overrides (e.g. a different name or tolerance). */
export function faith(profileId: string, share: number, over: Partial<FaithGroup> = {}): FaithGroup {
  const f = profileFields(profileId);
  if (!f) throw new Error('Unknown faith profile ' + profileId);
  return { ...f, share, ...over };
}

export const PRESETS: Preset[] = [
  {
    id: 'modern',
    name: 'Western Europe',
    era: '2025',
    description: 'A rich, ageing, mostly secular democracy: a shrinking Christian majority, a fast-growing non-religious share, and a younger Muslim minority from immigrant families. Pew projected Muslims at 7.4% of Europe by 2050 with no migration and 11.2% with medium migration (from 4.9% in 2016).',
    apply: (s) => {
      const p = s.population, c = s.society;
      Object.assign(p, { ageStructure: 0.3, urbanShare: 0.8, cities: 7, education: 13.5, socialValues: 0.6, valueSpread: 0.55, economicValues: 0.5, authoritarianism: 0.38, patriotism: 0.5, materialism: 0.6, institutionalTrust: 0.45, socialTrust: 0.45, health: 0.8, wealthInequality: 0.72 });
      p.faiths = [
        faith('christian_weurope', 0.66),
        faith('none_west', 0.27),
        faith('muslim_europe', 0.06),
        faith('jewish_diaspora', 0.004),
      ];
      Object.assign(c, { name: 'Western Europe', startYear: 2025, gdpPerCapita: 52000, techGrowth: 1.1, democracy: 0.88, ruleOfLaw: 0.82, pressFreedom: 0.85, repression: 0.06, securityLoyalty: 0.82, marketFreedom: 0.68, taxRate: 0.36, progressivity: 0.55, welfare: 0.62, eduAccess: 0.92, healthSpend: 0.8, military: 0.3, policing: 0.55, genderEquality: 0.85, religiousPolicy: 'neutral', minorityBias: 0.18, immigration: 0.5, collectivism: 0.3, socialMedia: 0.85 });
      c.ruling = { social: 0.58, econ: 0.52, auth: 0.35, relig: 0.3, patriot: 0.5 };
      c.trends = { consumerism: 0.4, patriotism: 0, religiosity: 0, liberalism: 0.05, capitalism: 0.05, authority: 0, tolerance: 0 };
    },
  },
  {
    id: 'unitedStates',
    name: 'United States',
    era: '2025',
    description: 'A large Christian majority (evangelical and other), a fast-growing non-religious share, and small Jewish, Muslim, Hindu and Buddhist communities. Pew (2022) projected Christians falling from 64% to 35–54% by 2070 depending on how many people leave religion.',
    apply: (s) => {
      const p = s.population, c = s.society;
      Object.assign(p, { ageStructure: 0.4, urbanShare: 0.83, cities: 10, education: 13.5, socialValues: 0.55, valueSpread: 0.8, economicValues: 0.6, authoritarianism: 0.45, patriotism: 0.65, materialism: 0.7, institutionalTrust: 0.35, socialTrust: 0.4, health: 0.75, wealthInequality: 0.84 });
      p.faiths = [
        faith('evangelical', 0.23),
        faith('christian_us', 0.39, { name: 'Other Christians' }),
        faith('none_west', 0.29),
        faith('jewish_diaspora', 0.02),
        faith('muslim_us', 0.012),
        faith('hindu_diaspora', 0.01),
        faith('buddhist_eastasia', 0.01),
      ];
      Object.assign(c, { name: 'United States', startYear: 2025, gdpPerCapita: 78000, techGrowth: 1.4, democracy: 0.8, ruleOfLaw: 0.75, pressFreedom: 0.8, repression: 0.12, securityLoyalty: 0.85, marketFreedom: 0.85, taxRate: 0.27, progressivity: 0.45, welfare: 0.35, eduAccess: 0.88, healthSpend: 0.55, military: 0.6, policing: 0.6, genderEquality: 0.8, religiousPolicy: 'neutral', minorityBias: 0.2, immigration: 0.55, collectivism: 0.25, socialMedia: 0.9, electionYears: 4 });
      c.ruling = { social: 0.45, econ: 0.65, auth: 0.5, relig: 0.55, patriot: 0.7 };
      c.trends = { consumerism: 0.5, patriotism: 0.1, religiosity: 0, liberalism: 0, capitalism: 0.2, authority: 0, tolerance: 0 };
    },
  },
  {
    id: 'india',
    name: 'India',
    era: '2025',
    description: 'A Hindu-majority democracy with a large Muslim minority and Christian, Sikh and Buddhist communities. Fertility differences are narrowing (NFHS-5: Muslims 2.36, Hindus 1.94). Pew (2015) projected Muslims rising from 14.4% to 18.4% by 2050.',
    apply: (s) => {
      const p = s.population, c = s.society;
      Object.assign(p, { ageStructure: 0.6, urbanShare: 0.37, cities: 10, education: 9.5, socialValues: 0.3, valueSpread: 0.6, economicValues: 0.45, authoritarianism: 0.55, patriotism: 0.72, materialism: 0.45, institutionalTrust: 0.55, socialTrust: 0.4, health: 0.7, wealthInequality: 0.82, tolerance: 0.95 });
      p.faiths = [
        faith('hindu_india', 0.795),
        faith('muslim_south_asia', 0.148),
        faith('christian_south_asia', 0.023),
        faith('sikh', 0.017),
        faith('buddhist_sea', 0.007),
        faith('none_eastasia', 0.01, { name: 'Others & non-religious', profile: 'none_eastasia' }),
      ];
      Object.assign(c, { name: 'India', startYear: 2025, gdpPerCapita: 10500, techGrowth: 2.2, democracy: 0.58, ruleOfLaw: 0.48, pressFreedom: 0.45, repression: 0.3, securityLoyalty: 0.85, marketFreedom: 0.6, taxRate: 0.18, progressivity: 0.4, welfare: 0.25, eduAccess: 0.72, healthSpend: 0.4, military: 0.55, policing: 0.5, genderEquality: 0.45, familyPlanning: 1, religiousPolicy: 'neutral', minorityBias: 0.35, immigration: 0.05, collectivism: 0.82, socialMedia: 0.55, electionYears: 5 });
      c.ruling = { social: 0.3, econ: 0.55, auth: 0.6, relig: 0.7, patriot: 0.85 };
      c.trends = { consumerism: 0.25, patriotism: 0.25, religiosity: 0.1, liberalism: 0, capitalism: 0.1, authority: 0.05, tolerance: -0.05 };
    },
  },
  {
    id: 'divided',
    name: 'Nigeria',
    era: '2025',
    description: 'A young, fast-growing country split almost evenly between Muslims (mostly in the north) and Christians (mostly in the south), with a weak state and episodes of communal violence. Pew (2015) projected Muslims rising from 49% to 58% by 2050.',
    apply: (s) => {
      const p = s.population, c = s.society;
      Object.assign(p, { ageStructure: 0.95, urbanShare: 0.53, cities: 8, education: 7.5, socialValues: 0.25, valueSpread: 0.55, economicValues: 0.45, authoritarianism: 0.55, patriotism: 0.5, materialism: 0.5, tolerance: 0.85, institutionalTrust: 0.3, socialTrust: 0.3, health: 0.65, wealthInequality: 0.8 });
      p.faiths = [
        faith('muslim_west_africa', 0.5),
        faith('christian_africa', 0.46),
        faith('folk_african', 0.04),
      ];
      Object.assign(c, { name: 'Nigeria', startYear: 2025, gdpPerCapita: 5800, techGrowth: 1.5, democracy: 0.5, ruleOfLaw: 0.3, pressFreedom: 0.45, repression: 0.35, securityLoyalty: 0.6, marketFreedom: 0.55, taxRate: 0.08, progressivity: 0.25, welfare: 0.08, eduAccess: 0.55, healthSpend: 0.2, military: 0.45, policing: 0.35, genderEquality: 0.35, familyPlanning: 0.1, religiousPolicy: 'neutral', minorityBias: 0.3, immigration: 0.02, collectivism: 0.85, socialMedia: 0.45 });
      c.ruling = { social: 0.3, econ: 0.5, auth: 0.6, relig: 0.65, patriot: 0.55 };
      c.trends = { consumerism: 0.2, patriotism: 0.05, religiosity: 0.05, liberalism: 0, capitalism: 0.05, authority: 0, tolerance: -0.05 };
    },
  },
  {
    id: 'israel',
    name: 'Israel',
    era: '2025',
    description: 'A Jewish-majority democracy whose fastest-growing community is the ultra-Orthodox (TFR ≈ 6.5), alongside an Arab Muslim and Christian minority. Israel\'s statistics bureau projects the ultra-Orthodox share to roughly double by 2050.',
    apply: (s) => {
      const p = s.population, c = s.society;
      Object.assign(p, { ageStructure: 0.65, urbanShare: 0.92, cities: 6, education: 13, socialValues: 0.45, valueSpread: 0.8, economicValues: 0.55, authoritarianism: 0.5, patriotism: 0.75, materialism: 0.55, institutionalTrust: 0.4, socialTrust: 0.45, health: 0.82, wealthInequality: 0.75 });
      p.faiths = [
        faith('jewish_israel', 0.62),
        faith('jewish_orthodox', 0.13),
        faith('muslim_mena', 0.18, { fertility: -0.1, retention: 0.95, eduGap: -1.2, wealthRatio: 0.65 }),
        faith('christian_mena', 0.02),
        faith('none_west', 0.05),
      ];
      Object.assign(c, { name: 'Israel', startYear: 2025, gdpPerCapita: 52000, techGrowth: 1.6, democracy: 0.72, ruleOfLaw: 0.72, pressFreedom: 0.7, repression: 0.3, securityLoyalty: 0.9, marketFreedom: 0.72, taxRate: 0.3, progressivity: 0.5, welfare: 0.5, eduAccess: 0.88, healthSpend: 0.75, military: 0.9, policing: 0.6, genderEquality: 0.7, religiousPolicy: 'favor', favoredFaith: 0, minorityBias: 0.35, immigration: 0.3, collectivism: 0.5, socialMedia: 0.85 });
      c.ruling = { social: 0.4, econ: 0.6, auth: 0.55, relig: 0.6, patriot: 0.85 };
      c.trends = { consumerism: 0.3, patriotism: 0.25, religiosity: 0.05, liberalism: 0, capitalism: 0.1, authority: 0.05, tolerance: -0.05 };
    },
  },
  {
    id: 'youngAutocracy',
    name: 'Young Arab autocracy',
    era: '2010',
    description: 'A middle-income Muslim-majority dictatorship with a Christian minority and a huge young generation: educated but jobless, wired to social media, angry at corruption, with volatile food prices. The setting of the 2011 Arab uprisings.',
    apply: (s) => {
      const p = s.population, c = s.society;
      Object.assign(p, { ageStructure: 0.88, urbanShare: 0.6, cities: 6, education: 10.5, socialValues: 0.32, valueSpread: 0.55, economicValues: 0.42, authoritarianism: 0.5, patriotism: 0.6, materialism: 0.5, institutionalTrust: 0.3, socialTrust: 0.45, health: 0.72, wealthInequality: 0.78 });
      p.faiths = [
        faith('muslim_mena', 0.9),
        faith('christian_mena', 0.09),
        faith('none_west', 0.01),
      ];
      Object.assign(c, { name: 'Nile Republic', startYear: 2010, gdpPerCapita: 11000, techGrowth: 1.2, democracy: 0.14, ruleOfLaw: 0.32, pressFreedom: 0.18, repression: 0.6, securityLoyalty: 0.62, marketFreedom: 0.45, taxRate: 0.18, progressivity: 0.25, welfare: 0.25, eduAccess: 0.75, healthSpend: 0.4, military: 0.6, policing: 0.6, genderEquality: 0.35, familyPlanning: 0.45, religiousPolicy: 'neutral', minorityBias: 0.3, immigration: 0.02, collectivism: 0.7, socialMedia: 0.45 });
      c.ruling = { social: 0.4, econ: 0.55, auth: 0.9, relig: 0.35, patriot: 0.85 };
      c.trends = { consumerism: 0.2, patriotism: 0.2, religiosity: 0, liberalism: 0, capitalism: 0, authority: 0.15, tolerance: 0 };
      s.timeline = [ev('foodPrices', 2011, 0, 1.3), ev('socialMediaEra', 2010, 6, 0.8)];
    },
  },
  {
    id: 'devout',
    name: 'Devout South Asian society',
    era: '2025',
    description: 'A lower-middle-income, Muslim-majority society with small Hindu and Christian minorities, where faith, family and community shape daily life: large families, strong social approval, and a semi-authoritarian state that favours the majority faith.',
    apply: (s) => {
      const p = s.population, c = s.society;
      Object.assign(p, { ageStructure: 0.78, urbanShare: 0.38, cities: 6, education: 8, socialValues: 0.2, valueSpread: 0.4, economicValues: 0.45, authoritarianism: 0.6, patriotism: 0.65, materialism: 0.35, institutionalTrust: 0.4, socialTrust: 0.5, health: 0.7, wealthInequality: 0.75, empathy: 0.55 });
      p.faiths = [
        faith('muslim_south_asia', 0.96, { eduGap: 0, wealthRatio: 1, youth: 0 }),
        faith('hindu_india', 0.02, { eduGap: -1, wealthRatio: 0.7 }),
        faith('christian_south_asia', 0.017, { eduGap: -1, wealthRatio: 0.7 }),
      ];
      Object.assign(c, { name: 'Indus Republic', startYear: 2025, gdpPerCapita: 6500, techGrowth: 1.5, democracy: 0.4, ruleOfLaw: 0.38, pressFreedom: 0.35, repression: 0.45, securityLoyalty: 0.8, marketFreedom: 0.55, taxRate: 0.12, progressivity: 0.3, welfare: 0.15, eduAccess: 0.6, healthSpend: 0.3, military: 0.7, policing: 0.5, genderEquality: 0.3, familyPlanning: 0.3, religiousPolicy: 'favor', favoredFaith: 0, minorityBias: 0.4, immigration: 0.02, collectivism: 0.85, socialMedia: 0.5 });
      c.ruling = { social: 0.22, econ: 0.5, auth: 0.7, relig: 0.85, patriot: 0.75 };
      c.trends = { consumerism: 0.15, patriotism: 0.15, religiosity: 0.15, liberalism: -0.1, capitalism: 0, authority: 0.05, tolerance: 0 };
    },
  },
  {
    id: 'welfareState',
    name: 'Nordic welfare state',
    era: '2025',
    description: 'High trust, high taxes, generous welfare, clean government and a highly secular culture: a nominally Lutheran majority, many non-religious people, and a Muslim minority from recent immigration.',
    apply: (s) => {
      const p = s.population, c = s.society;
      Object.assign(p, { ageStructure: 0.32, urbanShare: 0.85, cities: 5, education: 14, socialValues: 0.75, valueSpread: 0.4, economicValues: 0.42, authoritarianism: 0.25, patriotism: 0.45, materialism: 0.45, institutionalTrust: 0.72, socialTrust: 0.72, health: 0.82, wealthInequality: 0.65, agreeableness: 0.55 });
      p.faiths = [
        faith('christian_weurope', 0.58, { name: 'Lutherans', religiosity: 0.15, retention: 0.45 }),
        faith('none_west', 0.34),
        faith('muslim_europe', 0.07),
        faith('evangelical', 0.01, { name: 'Free-church Christians' }),
      ];
      Object.assign(c, { name: 'Northern Commonwealth', startYear: 2025, gdpPerCapita: 62000, techGrowth: 1.3, democracy: 0.95, ruleOfLaw: 0.95, pressFreedom: 0.95, repression: 0.03, securityLoyalty: 0.85, marketFreedom: 0.7, taxRate: 0.42, progressivity: 0.65, welfare: 0.85, eduAccess: 0.95, healthSpend: 0.85, military: 0.25, policing: 0.5, genderEquality: 0.95, religiousPolicy: 'neutral', minorityBias: 0.1, immigration: 0.45, collectivism: 0.35, socialMedia: 0.85 });
      c.ruling = { social: 0.72, econ: 0.42, auth: 0.25, relig: 0.2, patriot: 0.45 };
      c.trends = { consumerism: 0.2, patriotism: 0, religiosity: 0, liberalism: 0.05, capitalism: 0, authority: 0, tolerance: 0.1 };
    },
  },
  {
    id: 'fragileDemocracy',
    name: 'Fragile democracy (Weimar-like)',
    era: '1920',
    description: 'A new democracy after a lost war: humiliated, polarized and indebted, Protestant–Catholic, with a small Jewish minority, weak institutions and an army that never accepted the republic. Hyperinflation and a depression are scripted in. Will it survive?',
    apply: (s) => {
      const p = s.population, c = s.society;
      Object.assign(p, { ageStructure: 0.5, urbanShare: 0.55, cities: 7, education: 8, socialValues: 0.4, valueSpread: 0.9, economicValues: 0.45, authoritarianism: 0.58, patriotism: 0.72, materialism: 0.45, institutionalTrust: 0.3, socialTrust: 0.4, health: 0.7, wealthInequality: 0.75 });
      p.faiths = [
        faith('protestant_1920', 0.62),
        faith('catholic_1920', 0.33),
        faith('jewish_premodern', 0.01),
        faith('none_west', 0.04),
      ];
      Object.assign(c, { name: 'Weary Republic', startYear: 1920, gdpPerCapita: 6500, techGrowth: 1.2, democracy: 0.6, ruleOfLaw: 0.5, pressFreedom: 0.65, repression: 0.25, securityLoyalty: 0.55, marketFreedom: 0.6, taxRate: 0.2, progressivity: 0.4, welfare: 0.2, eduAccess: 0.65, healthSpend: 0.3, military: 0.3, policing: 0.45, genderEquality: 0.35, religiousPolicy: 'neutral', minorityBias: 0.3, immigration: 0.02, collectivism: 0.55, socialMedia: 0 });
      c.ruling = { social: 0.5, econ: 0.42, auth: 0.4, relig: 0.45, patriot: 0.55 };
      c.trends = { consumerism: 0.05, patriotism: 0.15, religiosity: 0, liberalism: 0, capitalism: 0, authority: 0.1, tolerance: -0.05 };
      s.timeline = [ev('hyperinflation', 1922, 6, 1), ev('massMedia', 1926, 0, 1), ev('depression', 1929, 9, 1.1)];
    },
  },
  {
    id: 'industrializing',
    name: 'Industrializing nation',
    era: '1900',
    description: 'Factories are rising and peasants are moving to the cities. A limited democracy, little welfare, large families and sharp class divisions; Protestants, Catholics and a small Jewish community.',
    apply: (s) => {
      const p = s.population, c = s.society;
      Object.assign(p, { ageStructure: 0.68, urbanShare: 0.35, cities: 6, education: 5, socialValues: 0.3, valueSpread: 0.5, economicValues: 0.5, authoritarianism: 0.6, patriotism: 0.7, materialism: 0.4, institutionalTrust: 0.45, socialTrust: 0.5, health: 0.65, wealthInequality: 0.85 });
      p.faiths = [
        faith('protestant_1920', 0.6, { religiosity: 0.65 }),
        faith('catholic_1920', 0.36, { religiosity: 0.75 }),
        faith('jewish_premodern', 0.01),
        faith('none_west', 0.03),
      ];
      Object.assign(c, { name: 'Iron Republic', startYear: 1900, gdpPerCapita: 4500, techGrowth: 1.4, democracy: 0.5, ruleOfLaw: 0.5, pressFreedom: 0.45, repression: 0.35, securityLoyalty: 0.75, marketFreedom: 0.75, taxRate: 0.08, progressivity: 0.1, welfare: 0.05, eduAccess: 0.45, healthSpend: 0.2, military: 0.55, policing: 0.4, genderEquality: 0.2, religiousPolicy: 'favor', favoredFaith: 0, minorityBias: 0.35, immigration: 0.05, collectivism: 0.6, socialMedia: 0 });
      c.ruling = { social: 0.3, econ: 0.68, auth: 0.6, relig: 0.6, patriot: 0.75 };
      c.trends = { consumerism: 0.05, patriotism: 0.2, religiosity: 0, liberalism: 0, capitalism: 0.1, authority: 0, tolerance: 0 };
    },
  },
  {
    id: 'agrarian',
    name: 'Agrarian kingdom',
    era: '1800',
    description: 'A pre-industrial Christian monarchy of devout peasants and landlords with a small Jewish community. Most people farm, few can read, many children die young. Growth is almost zero, so population presses against the land (the Malthusian trap).',
    apply: (s) => {
      const p = s.population, c = s.society;
      Object.assign(p, { ageStructure: 0.72, urbanShare: 0.12, cities: 4, education: 1.2, openness: 0.42, socialValues: 0.15, valueSpread: 0.35, economicValues: 0.5, authoritarianism: 0.72, patriotism: 0.6, materialism: 0.3, institutionalTrust: 0.55, socialTrust: 0.55, health: 0.6, wealthInequality: 0.85, aggression: 0.45 });
      p.faiths = [
        faith('christian_premodern', 0.96),
        faith('jewish_premodern', 0.03, { eduGap: 2, wealthRatio: 1.2 }),
        faith('none_west', 0.01, { name: 'Freethinkers' }),
      ];
      Object.assign(c, { name: 'Old Kingdom', startYear: 1800, gdpPerCapita: 1400, techGrowth: 0.15, democracy: 0.08, ruleOfLaw: 0.3, pressFreedom: 0.1, repression: 0.5, securityLoyalty: 0.75, marketFreedom: 0.4, taxRate: 0.1, progressivity: 0.05, welfare: 0.02, eduAccess: 0.12, healthSpend: 0.05, military: 0.5, policing: 0.3, genderEquality: 0.1, religiousPolicy: 'favor', favoredFaith: 0, minorityBias: 0.45, immigration: 0.05, collectivism: 0.85, socialMedia: 0, electionYears: 5 });
      c.ruling = { social: 0.2, econ: 0.6, auth: 0.8, relig: 0.75, patriot: 0.75 };
      c.trends = { consumerism: 0, patriotism: 0.1, religiosity: 0.1, liberalism: 0, capitalism: 0, authority: 0.1, tolerance: 0 };
    },
  },
  {
    id: 'custom',
    name: 'Blank slate',
    era: 'any',
    description: 'Balanced middle-of-the-road settings with three faith groups. A neutral starting point for your own experiment: change the groups in "Faith groups".',
    apply: () => {},
  },
];

export function presetScenario(id: string): ScenarioConfig {
  const s = defaultScenario();
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[PRESETS.length - 1];
  p.apply(s);
  return s;
}
