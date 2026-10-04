// Initial conditions: everything the user can set before pressing "Begin".
// Every value is a plain number so scenarios serialize to JSON and can be shared.

import { MAX_FAITHS } from './constants';
import type { ScheduledEvent } from './events';
import { profileFields } from './faiths';

export interface FaithGroup {
  name: string;
  color: string;
  /** Share of the initial population (normalized across groups). */
  share: number;
  /** Mean religiosity: how central faith is in daily life (0 = nominal, 1 = devout). */
  religiosity: number;
  /** Interpretive strictness: flexible/contextual (0) ↔ literal/rigid (1). Independent of devotion. */
  strictness: number;
  /** Tolerance of other groups (0 = hostile, 1 = fully accepting). */
  tolerance: number;
  /** Marks the "no religion" group (atheists/agnostics). */
  secular?: boolean;
  /** Profile from the library this group was created from (see faiths.ts). */
  profile?: string;
  /** Extra desired children per woman compared with an otherwise identical person. */
  fertility?: number;
  /** 0..1: how firmly the group keeps adults and raises children in the faith. */
  retention?: number;
  /** 0..1: how actively the group gains converts. */
  outreach?: number;
  /** 0..1: preference for marrying within the group. */
  endogamy?: number;
  /** Years of schooling above/below the national average at the start. */
  eduGap?: number;
  /** Wealth relative to the national average at the start. */
  wealthRatio?: number;
  /** Younger (+) or older (−) age structure than the national average. */
  youth?: number;
  /** Where the defaults come from. */
  note?: string;
}

/** Defaults for the demographic fields of a faith group. */
export const FAITH_DEFAULTS = { fertility: 0, retention: 0.75, outreach: 0.2, endogamy: 0.6, eduGap: 0, wealthRatio: 1, youth: 0 };

export interface PopulationConfig {
  size: number;
  /** 0 = ageing society (few children), 0.5 = balanced, 1 = very young (youth bulge). */
  ageStructure: number;
  /** Share of people living in cities. */
  urbanShare: number;
  cities: number;
  /** Mean years of schooling of young adults. */
  education: number;
  /** Big Five personality means (0..1, 0.5 = typical). */
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  empathy: number;
  aggression: number;
  /** 0 = traditional/conservative, 1 = progressive/liberal. */
  socialValues: number;
  /** How spread out (diverse) opinions are, 0..1. */
  valueSpread: number;
  /** 0 = left (redistribution), 1 = right (free market). */
  economicValues: number;
  /** 0 = anti-authority/libertarian, 1 = wants a strong leader and order. */
  authoritarianism: number;
  patriotism: number;
  materialism: number;
  /** Tolerance multiplier applied on top of each faith group's tolerance. */
  tolerance: number;
  /** Trust in institutions. */
  institutionalTrust: number;
  /** Trust in other people. */
  socialTrust: number;
  health: number;
  /** Wealth inequality (approximate wealth Gini, 0.3..0.95). */
  wealthInequality: number;
  faiths: FaithGroup[];
}

export type ReligiousPolicy = 'neutral' | 'favor' | 'theocracy' | 'suppress';

export interface Ideology {
  social: number;
  econ: number;
  auth: number;
  relig: number;
  patriot: number;
}

export interface SocietyConfig {
  name: string;
  startYear: number;
  /** GDP per person per year in international dollars (PPP). */
  gdpPerCapita: number;
  /** Baseline productivity growth (% per year) before institutions/education effects. */
  techGrowth: number;
  /** 0 = absolute dictatorship, 1 = full liberal democracy. */
  democracy: number;
  /** 0 = rampant corruption/arbitrary rule, 1 = clean, impartial rule of law. */
  ruleOfLaw: number;
  pressFreedom: number;
  /** Willingness of rulers to use force against dissent. */
  repression: number;
  /** Loyalty and cohesion of army & police to the regime. */
  securityLoyalty: number;
  /** Ideology of the ruling power (autocracy) / first government (democracy). */
  ruling: Ideology;
  /** 0 = state-planned economy, 1 = free market. */
  marketFreedom: number;
  /** Average tax rate on income (0..0.6). */
  taxRate: number;
  /** 0 = flat tax, 1 = strongly progressive. */
  progressivity: number;
  /** Generosity of welfare, pensions and unemployment support. */
  welfare: number;
  /** Access to schooling (public education investment). */
  eduAccess: number;
  /** Public health investment. */
  healthSpend: number;
  military: number;
  policing: number;
  genderEquality: number;
  /**
   * National family-planning programmes and the small-family norm they spread (India since 1952,
   * Bangladesh, Iran after 1989, China): more birth control and smaller desired families.
   */
  familyPlanning: number;
  religiousPolicy: ReligiousPolicy;
  favoredFaith: number;
  /** Social discrimination against minority faith groups. */
  minorityBias: number;
  /** How open borders are to immigrants (0 = closed, 1 = very open). Rich, peaceful societies attract more. */
  immigration: number;
  /** 0 = individualist, 1 = collectivist: weight of family/community approval. */
  collectivism: number;
  /** Share of people on algorithmic social media. */
  socialMedia: number;
  /** Society-wide pushes from media, advertising, schools and state (-1..1). */
  trends: Trends;
  /** If true, elected governments/regimes change policy themselves. If false, your sliders rule. */
  politicsEndogenous: boolean;
  electionYears: number;
  randomEvents: boolean;
  /** Multiplier on random-event frequency. */
  eventRate: number;
  seed: number;
}

export interface Trends {
  consumerism: number;
  patriotism: number;
  religiosity: number;
  liberalism: number;
  capitalism: number;
  authority: number;
  tolerance: number;
}

export interface ScenarioConfig {
  population: PopulationConfig;
  society: SocietyConfig;
  timeline: ScheduledEvent[];
}

export const FAITH_COLORS = ['#3987e5', '#eb6834', '#1baf7a', '#c98500', '#d55181', '#9085e9'];

export function defaultFaiths(): FaithGroup[] {
  const mk = (id: string, share: number): FaithGroup => ({ ...(profileFields(id) as FaithGroup), share });
  return [mk('christian_us', 0.55), mk('muslim_us', 0.2), mk('none_west', 0.25)];
}

export function defaultPopulation(): PopulationConfig {
  return {
    size: 100_000,
    ageStructure: 0.5,
    urbanShare: 0.6,
    cities: 6,
    education: 11,
    openness: 0.5,
    conscientiousness: 0.5,
    extraversion: 0.5,
    agreeableness: 0.5,
    neuroticism: 0.5,
    empathy: 0.5,
    aggression: 0.4,
    socialValues: 0.5,
    valueSpread: 0.5,
    economicValues: 0.5,
    authoritarianism: 0.45,
    patriotism: 0.55,
    materialism: 0.5,
    tolerance: 1,
    institutionalTrust: 0.5,
    socialTrust: 0.5,
    health: 0.75,
    wealthInequality: 0.65,
    faiths: defaultFaiths(),
  };
}

export function defaultSociety(): SocietyConfig {
  return {
    name: 'New Society',
    startYear: 2025,
    gdpPerCapita: 20000,
    techGrowth: 1.5,
    democracy: 0.7,
    ruleOfLaw: 0.6,
    pressFreedom: 0.65,
    repression: 0.25,
    securityLoyalty: 0.7,
    ruling: { social: 0.5, econ: 0.5, auth: 0.45, relig: 0.45, patriot: 0.55 },
    marketFreedom: 0.6,
    taxRate: 0.28,
    progressivity: 0.5,
    welfare: 0.45,
    eduAccess: 0.75,
    healthSpend: 0.6,
    military: 0.35,
    policing: 0.5,
    genderEquality: 0.65,
    familyPlanning: 0,
    religiousPolicy: 'neutral',
    favoredFaith: 0,
    minorityBias: 0.2,
    immigration: 0.4,
    collectivism: 0.45,
    socialMedia: 0.6,
    trends: { consumerism: 0.3, patriotism: 0, religiosity: 0, liberalism: 0, capitalism: 0, authority: 0, tolerance: 0 },
    politicsEndogenous: true,
    electionYears: 4,
    randomEvents: true,
    eventRate: 1,
    seed: 20251003,
  };
}

export function defaultScenario(): ScenarioConfig {
  return { population: defaultPopulation(), society: defaultSociety(), timeline: [] };
}

/** Deep copy + normalization so the engine never sees invalid values. */
export function normalizeScenario(s: ScenarioConfig): ScenarioConfig {
  const c: ScenarioConfig = JSON.parse(JSON.stringify(s));
  const p = c.population;
  p.size = Math.max(500, Math.min(8_000_000, Math.round(p.size)));
  p.cities = Math.max(1, Math.min(24, Math.round(p.cities)));
  if (!p.faiths.length) p.faiths = defaultFaiths();
  p.faiths = p.faiths.slice(0, MAX_FAITHS);
  const tot = p.faiths.reduce((a, f) => a + Math.max(0, f.share), 0) || 1;
  for (const f of p.faiths) {
    f.share = Math.max(0, f.share) / tot;
    for (const [k, v] of Object.entries(FAITH_DEFAULTS)) {
      const key = k as keyof typeof FAITH_DEFAULTS;
      if (typeof f[key] !== 'number' || !isFinite(f[key] as number)) f[key] = v;
    }
  }
  if (typeof c.society.familyPlanning !== 'number') c.society.familyPlanning = 0;
  c.society.favoredFaith = Math.max(0, Math.min(p.faiths.length - 1, c.society.favoredFaith | 0));
  c.timeline = c.timeline || [];
  return c;
}
