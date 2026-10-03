// The event system.
//
// Every event, real or imagined, is described as DATA: a combination of primitive effects
// (economic shocks, institutional shifts, deaths, migration, value pushes on a target group...),
// a duration, a time-profile and a target. That is what makes the simulator general: the
// template library below encodes well-documented historical episodes, and users can build
// any other event (past or hypothetical) from the same primitives.

import type { Ideology } from './config';

export type EffectMode = 'total' | 'level';
export type EffectGroup = 'economy' | 'institutions' | 'population' | 'minds';

export interface EffectDef {
  label: string;
  group: EffectGroup;
  mode: EffectMode;
  unit: string;
  min: number;
  max: number;
  step: number;
  help: string;
}

export const EFFECTS = {
  // ---------------- economy ----------------
  gdp: { label: 'Economic output', group: 'economy', mode: 'total', unit: '%', min: -60, max: 60, step: 1, help: 'Shock to output relative to potential. Recovers gradually after the event (half-life ≈ 2 years).' },
  growth: { label: 'Trend growth', group: 'economy', mode: 'level', unit: 'pp/yr', min: -5, max: 8, step: 0.1, help: 'Change in long-run productivity growth while the event lasts.' },
  inflation: { label: 'Inflation', group: 'economy', mode: 'level', unit: '%/yr', min: -10, max: 5000, step: 1, help: 'Extra annual inflation while active. High inflation erodes savings of ordinary people.' },
  unemployment: { label: 'Unemployment', group: 'economy', mode: 'level', unit: 'pp', min: -10, max: 30, step: 0.5, help: 'Extra unemployment (percentage points) while active.' },
  tech: { label: 'Productivity / technology', group: 'economy', mode: 'total', unit: '%', min: -50, max: 200, step: 1, help: 'Permanent change in productivity (new technology, destruction of capital).' },
  automation: { label: 'Automation of routine jobs', group: 'economy', mode: 'total', unit: '% of jobs', min: 0, max: 80, step: 1, help: 'Share of manual and routine skilled jobs replaced by machines/AI over the event.' },
  capitalShare: { label: "Owners' share of income", group: 'economy', mode: 'total', unit: 'pp', min: -20, max: 20, step: 1, help: 'Shift of national income from wages to capital owners (raises inequality).' },
  wealthDestroyed: { label: 'Wealth destroyed', group: 'economy', mode: 'total', unit: '%', min: 0, max: 90, step: 1, help: 'Share of the target group\'s wealth wiped out (crashes, war damage, disasters).' },
  redistribution: { label: 'Wealth redistributed', group: 'economy', mode: 'total', unit: '%', min: 0, max: 80, step: 1, help: 'Share of the richest 10%\'s wealth transferred to the poorest half (land reform, expropriation).' },
  // ---------------- institutions & policy (absolute change on a 0..1 scale) ----------------
  democracy: { label: 'Democracy', group: 'institutions', mode: 'total', unit: 'Δ', min: -1, max: 1, step: 0.05, help: 'Free elections, checks and balances.' },
  ruleOfLaw: { label: 'Rule of law / low corruption', group: 'institutions', mode: 'total', unit: 'Δ', min: -1, max: 1, step: 0.05, help: '' },
  pressFreedom: { label: 'Press freedom', group: 'institutions', mode: 'total', unit: 'Δ', min: -1, max: 1, step: 0.05, help: '' },
  repression: { label: 'Repression', group: 'institutions', mode: 'total', unit: 'Δ', min: -1, max: 1, step: 0.05, help: 'Willingness to use force against dissent.' },
  securityLoyalty: { label: 'Army & police loyalty', group: 'institutions', mode: 'total', unit: 'Δ', min: -1, max: 1, step: 0.05, help: '' },
  welfare: { label: 'Welfare generosity', group: 'institutions', mode: 'total', unit: 'Δ', min: -1, max: 1, step: 0.05, help: '' },
  taxRate: { label: 'Tax rate', group: 'institutions', mode: 'total', unit: 'Δ', min: -0.4, max: 0.4, step: 0.01, help: '' },
  progressivity: { label: 'Tax progressivity', group: 'institutions', mode: 'total', unit: 'Δ', min: -1, max: 1, step: 0.05, help: '' },
  marketFreedom: { label: 'Market freedom', group: 'institutions', mode: 'total', unit: 'Δ', min: -1, max: 1, step: 0.05, help: '' },
  eduAccess: { label: 'Access to education', group: 'institutions', mode: 'total', unit: 'Δ', min: -1, max: 1, step: 0.05, help: '' },
  healthSpend: { label: 'Public health spending', group: 'institutions', mode: 'total', unit: 'Δ', min: -1, max: 1, step: 0.05, help: '' },
  military: { label: 'Military strength', group: 'institutions', mode: 'total', unit: 'Δ', min: -1, max: 1, step: 0.05, help: '' },
  policing: { label: 'Policing', group: 'institutions', mode: 'total', unit: 'Δ', min: -1, max: 1, step: 0.05, help: '' },
  genderEquality: { label: 'Gender equality', group: 'institutions', mode: 'total', unit: 'Δ', min: -1, max: 1, step: 0.05, help: 'Women\'s access to education, jobs and legal equality.' },
  contraception: { label: 'Access to contraception', group: 'institutions', mode: 'total', unit: 'Δ', min: -1, max: 1, step: 0.05, help: '' },
  minorityBias: { label: 'Discrimination against minorities', group: 'institutions', mode: 'total', unit: 'Δ', min: -1, max: 1, step: 0.05, help: '' },
  socialMedia: { label: 'Social media penetration', group: 'institutions', mode: 'total', unit: 'Δ', min: -1, max: 1, step: 0.05, help: '' },
  collectivism: { label: 'Collectivism', group: 'institutions', mode: 'total', unit: 'Δ', min: -1, max: 1, step: 0.05, help: 'Weight of family and community approval over individual choice.' },
  propaganda: { label: 'State propaganda reach', group: 'institutions', mode: 'level', unit: '0-1', min: 0, max: 1, step: 0.05, help: 'Extra reach of state messaging (e.g. radio in the 1930s).' },
  // ---------------- population ----------------
  mortality: { label: 'Extra deaths', group: 'population', mode: 'level', unit: '%/yr', min: 0, max: 60, step: 0.1, help: 'Additional annual death rate in the target group (famine, violence).' },
  epidemic: { label: 'Epidemic (R₀)', group: 'population', mode: 'level', unit: 'R', min: 0, max: 6, step: 0.1, help: 'Basic reproduction number of a new infectious disease.' },
  ifr: { label: 'Infection fatality rate', group: 'population', mode: 'level', unit: '%', min: 0, max: 60, step: 0.1, help: 'Average share of infected who die (shaped by age profile).' },
  migrants: { label: 'Immigrants arrive', group: 'population', mode: 'total', unit: '% of pop', min: 0, max: 40, step: 0.5, help: '' },
  emigration: { label: 'Emigration', group: 'population', mode: 'level', unit: '%/yr', min: 0, max: 20, step: 0.1, help: 'Share of the target group leaving the country each year.' },
  urbanization: { label: 'Push to cities', group: 'population', mode: 'level', unit: '0-1', min: 0, max: 1, step: 0.05, help: 'Rural people moving to cities (industrialization, drought).' },
  war: { label: 'War mobilization', group: 'population', mode: 'level', unit: '% young men', min: 0, max: 60, step: 1, help: 'Share of men aged 18–40 sent to fight. Casualties follow.' },
  protestSeed: { label: 'Protest spark', group: 'population', mode: 'level', unit: '0-1', min: 0, max: 1, step: 0.05, help: 'A focal event (a martyr, a stolen election) that pushes aggrieved people into the streets.' },
  crime: { label: 'Crime pressure', group: 'population', mode: 'level', unit: '×', min: -1, max: 5, step: 0.1, help: 'Extra crime (drug epidemics, state collapse).' },
  // ---------------- minds: monthly push on the target group's attitudes (-1..1) ----------------
  griev: { label: 'Grievance', group: 'minds', mode: 'level', unit: 'push', min: -1, max: 1, step: 0.05, help: 'Sense of injustice and deprivation.' },
  fear: { label: 'Fear', group: 'minds', mode: 'level', unit: 'push', min: -1, max: 1, step: 0.05, help: '' },
  mood: { label: 'Mood', group: 'minds', mode: 'level', unit: 'push', min: -1, max: 1, step: 0.05, help: '' },
  health: { label: 'Physical health', group: 'minds', mode: 'level', unit: 'push', min: -1, max: 1, step: 0.05, help: '' },
  mental: { label: 'Mental health', group: 'minds', mode: 'level', unit: 'push', min: -1, max: 1, step: 0.05, help: '' },
  itrust: { label: 'Trust in institutions', group: 'minds', mode: 'level', unit: 'push', min: -1, max: 1, step: 0.05, help: '' },
  strust: { label: 'Trust in people', group: 'minds', mode: 'level', unit: 'push', min: -1, max: 1, step: 0.05, help: '' },
  toler: { label: 'Tolerance of others', group: 'minds', mode: 'level', unit: 'push', min: -1, max: 1, step: 0.05, help: '' },
  patriot: { label: 'Patriotism / nationalism', group: 'minds', mode: 'level', unit: 'push', min: -1, max: 1, step: 0.05, help: '' },
  relig: { label: 'Religiosity', group: 'minds', mode: 'level', unit: 'push', min: -1, max: 1, step: 0.05, help: '' },
  strict: { label: 'Strict interpretation', group: 'minds', mode: 'level', unit: 'push', min: -1, max: 1, step: 0.05, help: '' },
  social: { label: 'Social liberalism', group: 'minds', mode: 'level', unit: 'push', min: -1, max: 1, step: 0.05, help: '+ progressive, − traditional' },
  econ: { label: 'Pro-market views', group: 'minds', mode: 'level', unit: 'push', min: -1, max: 1, step: 0.05, help: '+ free market, − redistribution' },
  auth: { label: 'Desire for strong leader', group: 'minds', mode: 'level', unit: 'push', min: -1, max: 1, step: 0.05, help: '' },
  consum: { label: 'Consumerism', group: 'minds', mode: 'level', unit: 'push', min: -1, max: 1, step: 0.05, help: '' },
  extrem: { label: 'Extremism', group: 'minds', mode: 'level', unit: 'push', min: -1, max: 1, step: 0.05, help: 'Readiness to use violence for a cause.' },
  backlash: { label: 'Backlash against the target', group: 'minds', mode: 'level', unit: '0-1', min: 0, max: 1, step: 0.05, help: 'Everyone outside the target becomes less tolerant and more fearful; the target feels aggrieved.' },
} satisfies Record<string, EffectDef>;

export type EffectKey = keyof typeof EFFECTS;
export const EFFECT_KEYS = Object.keys(EFFECTS) as EffectKey[];

/** Agent-level push dimensions, in the order the engine uses them. */
export const PUSH_DIMS = ['griev', 'fear', 'mood', 'health', 'mental', 'itrust', 'strust', 'toler', 'patriot', 'relig', 'strict', 'social', 'econ', 'auth', 'consum', 'extrem'] as const;
export type PushDim = (typeof PUSH_DIMS)[number];

export type EventCategory = 'economy' | 'politics' | 'conflict' | 'health' | 'society' | 'faith' | 'technology' | 'nature' | 'people';

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  economy: 'Economy',
  politics: 'Politics & power',
  conflict: 'War & violence',
  health: 'Health & disease',
  society: 'Society & culture',
  faith: 'Faith & ideas',
  technology: 'Technology',
  nature: 'Nature & climate',
  people: 'Influential people',
};

export type LeaderStyle = 'demagogue' | 'reformer' | 'peacemaker' | 'spiritual' | 'extremist' | 'revolutionary' | 'visionary';

export const LEADER_STYLES: Record<LeaderStyle, { label: string; help: string }> = {
  demagogue: { label: 'Populist demagogue', help: 'Channels anger at elites and out-groups; raises nationalism and the desire for a strongman.' },
  reformer: { label: 'Liberal reformer', help: 'Pushes openness, rule of law and press freedom.' },
  peacemaker: { label: 'Unifier / peacemaker', help: 'Builds bridges across groups; lowers extremism and fear.' },
  spiritual: { label: 'Spiritual teacher', help: 'Revives faith, charity and community; tolerance depends on their teaching.' },
  extremist: { label: 'Extremist recruiter', help: 'Recruits aggrieved, isolated young people into violent militancy.' },
  revolutionary: { label: 'Revolutionary organizer', help: 'Turns grievance into organized mass protest.' },
  visionary: { label: 'Visionary inventor / entrepreneur', help: 'Accelerates technology and growth; spreads consumer culture.' },
};

export interface LeaderSpec {
  style: LeaderStyle;
  charisma: number;
  /** 0 = local (their city), 1 = national reach. */
  reach: number;
  ideology?: Partial<Ideology & { toler: number; extrem: number }>;
  name?: string;
}

export type RegimeKind = 'military' | 'theocracy' | 'socialist' | 'nationalist' | 'monarchy' | 'democratic';

export const REGIMES: Record<RegimeKind, { label: string; ideology: Ideology; democracy: number; repression: number; press: number }> = {
  military: { label: 'Military junta', ideology: { social: 0.35, econ: 0.55, auth: 0.92, relig: 0.45, patriot: 0.9 }, democracy: 0.08, repression: 0.75, press: 0.15 },
  theocracy: { label: 'Clerical rule', ideology: { social: 0.12, econ: 0.45, auth: 0.85, relig: 0.95, patriot: 0.6 }, democracy: 0.15, repression: 0.65, press: 0.15 },
  socialist: { label: 'One-party socialist state', ideology: { social: 0.45, econ: 0.08, auth: 0.9, relig: 0.05, patriot: 0.7 }, democracy: 0.05, repression: 0.8, press: 0.05 },
  nationalist: { label: 'Nationalist strongman', ideology: { social: 0.3, econ: 0.55, auth: 0.85, relig: 0.6, patriot: 0.95 }, democracy: 0.25, repression: 0.55, press: 0.25 },
  monarchy: { label: 'Traditional monarchy', ideology: { social: 0.2, econ: 0.6, auth: 0.8, relig: 0.75, patriot: 0.75 }, democracy: 0.1, repression: 0.5, press: 0.2 },
  democratic: { label: 'Democratic transition', ideology: { social: 0.55, econ: 0.5, auth: 0.35, relig: 0.4, patriot: 0.55 }, democracy: 0.7, repression: 0.15, press: 0.7 },
};

export interface Target {
  /** Faith group index. */
  faith?: number;
  /** Settlement index (-2 = a random settlement chosen when the event starts). */
  settlement?: number;
  urban?: boolean;
  rural?: boolean;
  minAge?: number;
  maxAge?: number;
  sex?: number;
  /** 0 = poorest 40%, 1 = middle, 2 = richest 10%. */
  wealthClass?: number;
  /** Fraction of matching people affected (0..1). */
  share?: number;
}

export interface MigrantProfile {
  /** Faith group index of arrivals (-1 = same mix as the population). */
  faith: number;
  religiosity: number;
  education: number;
  /** Wealth relative to the national average. */
  wealth: number;
  strictness: number;
  social: number;
}

export type Shape = 'pulse' | 'ramp' | 'sustained' | 'decay' | 'hump';

export interface EventSpec {
  id: string;
  name: string;
  category: EventCategory;
  description: string;
  history: string;
  refs: string[];
  duration: number;
  shape: Shape;
  effects: Partial<Record<EffectKey, number>>;
  target?: Target;
  /** Age profile of epidemic deaths. */
  ifrProfile?: 'flu1918' | 'covid' | 'uniform';
  mortalityProfile?: 'uniform' | 'youngMen' | 'vulnerable';
  regime?: RegimeKind;
  leader?: LeaderSpec;
  migrant?: MigrantProfile;
  /** Random occurrence: base probability per year at event-rate 1. 0/undefined = only scripted. */
  baseRate?: number;
  /** Multiplier of baseRate given current conditions. */
  likelihood?: (s: StateView) => number;
  /** If random, which faith group is targeted (chooses one by this rule). */
  randomTarget?: 'minority' | 'extremists' | 'none';
}

/** What random-event likelihoods can see. */
export interface StateView {
  year: number;
  gdppc: number;
  growth: number;
  unemployment: number;
  inflation: number;
  gini: number;
  democracy: number;
  repression: number;
  legitimacy: number;
  psi: number;
  protest: number;
  extremists: number;
  patriot: number;
  auth: number;
  toler: number;
  relig: number;
  socialMedia: number;
  debtRatio: number;
  youth: number;
  atWar: boolean;
  epidemic: boolean;
  diversity: number;
  itrust: number;
  marketFreedom: number;
  military: number;
  ruleOfLaw: number;
  agrarian: number;
}

export interface ScheduledEvent {
  uid: string;
  templateId: string;
  /** Simulation year and month (0-11) at which it starts. */
  year: number;
  month: number;
  intensity: number;
  target?: Target;
  /** A fully custom spec (when the user builds their own event). */
  custom?: Omit<EventSpec, 'likelihood'>;
  /** Optional parameters for leaders / migrants. */
  leader?: LeaderSpec;
  migrant?: MigrantProfile;
  fired?: boolean;
}

/** Time profile of an event. level(t) peaks at 1; weights sum to 1 over the duration. */
export function shapeLevel(shape: Shape, m: number, dur: number): number {
  const t = dur <= 1 ? 0 : m / (dur - 1);
  switch (shape) {
    case 'pulse': return m === 0 ? 1 : Math.max(0, 1 - m / Math.max(1, dur * 0.35));
    case 'ramp': return 0.25 + 0.75 * t;
    case 'sustained': return 1;
    case 'decay': return Math.exp(-3 * t);
    case 'hump': return Math.sin(Math.PI * Math.min(1, (m + 0.5) / dur));
  }
}

export function shapeWeights(shape: Shape, dur: number): number[] {
  const d = Math.max(1, Math.round(dur));
  if (shape === 'pulse') {
    const w = new Array(d).fill(0);
    w[0] = 1;
    return w;
  }
  const w: number[] = [];
  let tot = 0;
  for (let m = 0; m < d; m++) {
    const v = shapeLevel(shape, m, d);
    w.push(v);
    tot += v;
  }
  return w.map((v) => v / (tot || 1));
}

const poor = (s: StateView) => Math.max(0.2, Math.min(4, 8000 / Math.max(800, s.gdppc)));

// ---------------------------------------------------------------------------------------------
// Template library. Magnitudes at intensity 1 approximate the documented historical episode.
// ---------------------------------------------------------------------------------------------
export const TEMPLATES: EventSpec[] = [
  // ======================= ECONOMY =======================
  {
    id: 'recession', name: 'Recession', category: 'economy', duration: 14, shape: 'hump',
    description: 'A normal business-cycle downturn: output dips, layoffs rise, people tighten belts.',
    history: 'Market economies contract every 5–10 years. The US had 12 recessions between 1945 and 2020, with output falling about 2.5% on average.',
    refs: ['NBER Business Cycle Dating Committee', 'Romer & Romer (2019), "Fiscal Space and the Aftermath of Financial Crises"'],
    effects: { gdp: -4, unemployment: 2.5, griev: 0.06, mood: -0.08, fear: 0.04 },
    baseRate: 0.11, likelihood: (s) => (s.agrarian > 0.6 ? 0.25 : 1) * (s.marketFreedom > 0.5 ? 1.2 : 0.8),
  },
  {
    id: 'depression', name: 'Great Depression', category: 'economy', duration: 48, shape: 'hump',
    description: 'A deep, long collapse: banks fail, a quarter of workers lose their jobs, savings vanish. Desperation pushes people toward strongmen and radical solutions.',
    history: '1929–1933: US output fell about 27% and unemployment reached 25%. Where the depression lasted longer, far-right parties gained most, most famously in Germany.',
    refs: ['Romer (1993), "The Nation in Depression", JEP', 'de Bromhead, Eichengreen & O\'Rourke (2013), "Political Extremism in the 1920s and 1930s", JEH', 'Funke, Schularick & Trebesch (2016), "Going to Extremes", EER'],
    effects: { gdp: -27, unemployment: 18, wealthDestroyed: 30, griev: 0.3, fear: 0.18, itrust: -0.25, auth: 0.12, patriot: 0.06, extrem: 0.06, mood: -0.2, econ: -0.06 },
    baseRate: 0.008, likelihood: (s) => (s.debtRatio > 1 ? 1.6 : 1) * (s.marketFreedom > 0.7 ? 1.4 : 1) * (s.gini > 0.45 ? 1.3 : 1) * (s.agrarian > 0.5 ? 0.05 : 1 - s.agrarian),
  },
  {
    id: 'financialCrisis', name: 'Financial crisis', category: 'economy', duration: 30, shape: 'hump',
    description: 'A banking or housing bubble bursts. Wealth evaporates, credit freezes, and trust in elites falls for a decade.',
    history: '2008: global financial crisis. After systemic banking crises, unemployment rises about 7 points on average and populist parties gain about 30% more votes.',
    refs: ['Reinhart & Rogoff (2009), "This Time Is Different"', 'Funke, Schularick & Trebesch (2016), EER'],
    effects: { gdp: -6, unemployment: 5, wealthDestroyed: 15, itrust: -0.22, griev: 0.15, mood: -0.1, econ: -0.04 },
    baseRate: 0.02, likelihood: (s) => (s.marketFreedom > 0.6 ? 1.5 : 0.7) * (s.debtRatio > 0.9 ? 1.4 : 1) * (s.gdppc > 10000 ? 1.2 : 0.8) * (1 - 0.95 * s.agrarian),
  },
  {
    id: 'hyperinflation', name: 'Hyperinflation', category: 'economy', duration: 20, shape: 'hump',
    description: 'The currency collapses. Prices double every few days; the savings of the middle class become worthless. Trust in the system and its rulers is destroyed.',
    history: 'Weimar Germany 1923 (prices doubled every 3.7 days at the peak), Zimbabwe 2008, Venezuela 2018. The impoverishment of the German middle class fed later support for extremists.',
    refs: ['Hanke & Krus (2012), "World Hyperinflations"', 'Fergusson (1975), "When Money Dies"'],
    effects: { inflation: 2500, gdp: -12, unemployment: 4, griev: 0.4, itrust: -0.45, fear: 0.15, auth: 0.15, extrem: 0.1, mood: -0.25 },
    baseRate: 0.004, likelihood: (s) => (s.debtRatio > 1.2 ? 4 : 1) * 4 * (1 - s.ruleOfLaw) ** 2 * (s.atWar ? 2 : 1) * (s.year > 1910 ? 1 : 0.05),
  },
  {
    id: 'debtCrisis', name: 'Debt crisis & currency crash', category: 'economy', duration: 30, shape: 'hump',
    description: 'The state cannot pay its debts. The currency crashes, banks close, and austerity follows.',
    history: 'Mexico 1982 and 1994, Russia 1998, Argentina 2001, Greece 2010–15. In Greece output fell about 25%.',
    refs: ['Reinhart & Rogoff (2009)', 'IMF (2013), "Greece: Ex Post Evaluation"'],
    effects: { gdp: -12, inflation: 50, unemployment: 7, wealthDestroyed: 20, welfare: -0.15, itrust: -0.3, griev: 0.25, mood: -0.15 },
    baseRate: 0.004, likelihood: (s) => (s.debtRatio > 1 ? 5 * s.debtRatio : 0.3) * (s.year > 1820 ? 1 : 0.2),
  },
  {
    id: 'oilShock', name: 'Energy price shock', category: 'economy', duration: 24, shape: 'decay',
    description: 'Fuel prices spike, causing inflation and job losses across the economy.',
    history: 'The 1973 and 1979 oil shocks brought "stagflation"; the 2022 gas crisis followed in Europe.',
    refs: ['Hamilton (1983), "Oil and the Macroeconomy since World War II", JPE'],
    effects: { inflation: 12, gdp: -3, unemployment: 2, griev: 0.08, mood: -0.05 },
    baseRate: 0.025, likelihood: (s) => (s.year > 1900 ? 1 - 0.8 * s.agrarian : 0.03),
  },
  {
    id: 'foodPrices', name: 'Food price spike', category: 'economy', duration: 12, shape: 'hump',
    description: 'Bread and rice become unaffordable for the poor. In poor societies this sparks riots.',
    history: 'Food riots in 2007–08 and the 2010–11 spike that helped trigger the Arab Spring. The French Revolution (1789) followed a bread price surge.',
    refs: ['Lagi, Bertrand & Bar-Yam (2011), "The Food Crises and Political Instability"', 'Bellemare (2015), "Rising Food Prices, Food Price Volatility, and Social Unrest", AJAE'],
    effects: { inflation: 10, griev: 0.3, health: -0.05, mood: -0.12, protestSeed: 0.15 }, target: { wealthClass: 0 },
    baseRate: 0.03, likelihood: (s) => poor(s),
  },
  {
    id: 'boom', name: 'Economic boom', category: 'economy', duration: 72, shape: 'hump',
    description: 'Years of fast growth: new industries, rising wages, optimism and spending.',
    history: 'Post-war "golden age" 1950–73, the East Asian miracle, and China after 1978.',
    refs: ['Eichengreen (2007), "The European Economy since 1945"'],
    effects: { growth: 2.5, gdp: 6, unemployment: -2, mood: 0.08, consum: 0.08, itrust: 0.05 },
    baseRate: 0.025, likelihood: (s) => 1 - 0.7 * s.agrarian,
  },
  {
    id: 'resourceBoom', name: 'Oil / resource discovery', category: 'economy', duration: 120, shape: 'sustained',
    description: 'A huge resource find makes rulers rich without needing citizens\' taxes, which weakens pressure for democracy (the "resource curse").',
    history: 'Gulf states after 1950, Nigeria, Venezuela; Norway is the exception because it already had strong institutions.',
    refs: ['Ross (2001), "Does Oil Hinder Democracy?", World Politics', 'Mehlum, Moene & Torvik (2006), "Institutions and the Resource Curse"'],
    effects: { gdp: 15, growth: 1, welfare: 0.15, taxRate: -0.1, democracy: -0.1, ruleOfLaw: -0.1, consum: 0.1, griev: -0.08 },
    baseRate: 0.004,
  },
  {
    id: 'austerity', name: 'Austerity program', category: 'economy', duration: 36, shape: 'sustained',
    description: 'Deep spending cuts to balance the budget. Services shrink, anger grows.',
    history: 'Europe 2010–15. Across 1919–2008, each major cut in spending raised the risk of riots and demonstrations.',
    refs: ['Ponticelli & Voth (2020), "Austerity and Anarchy", JCE', 'Fetzer (2019), "Did Austerity Cause Brexit?", AER'],
    effects: { welfare: -0.2, healthSpend: -0.1, eduAccess: -0.05, unemployment: 1.5, griev: 0.12, itrust: -0.12 },
    baseRate: 0.01, likelihood: (s) => (s.debtRatio > 0.9 ? 3 : 0.3),
  },
  {
    id: 'marketReform', name: 'Market liberalization', category: 'economy', duration: 120, shape: 'ramp',
    description: 'Prices freed, firms privatized, trade opened. Growth often accelerates, but so does inequality.',
    history: 'China after 1978, India 1991, Chile in the 1980s; "shock therapy" in Russia in the 1990s ended far worse.',
    refs: ['Rodrik (2008), "One Economics, Many Recipes"', 'Milanovic (2016), "Global Inequality"'],
    effects: { marketFreedom: 0.35, growth: 1.5, capitalShare: 5, welfare: -0.1, econ: 0.08, consum: 0.1 },
  },
  {
    id: 'nationalization', name: 'Socialist turn', category: 'economy', duration: 60, shape: 'ramp',
    description: 'Big firms and land are nationalized, wealth is redistributed, and markets are restricted.',
    history: 'USSR 1917–30, Cuba 1959, Venezuela after 2005.',
    refs: ['Kornai (1992), "The Socialist System"'],
    effects: { marketFreedom: -0.45, capitalShare: -10, redistribution: 40, growth: -1, welfare: 0.2, econ: -0.12, griev: 0.05 },
  },
  {
    id: 'landReform', name: 'Land reform', category: 'economy', duration: 36, shape: 'ramp',
    description: 'Large estates are split and given to the peasants who work them.',
    history: 'Japan, South Korea and Taiwan after 1945 laid the base for broad-based growth; Zimbabwe 2000 was chaotic and caused a collapse.',
    refs: ['Besley & Burgess (2000), "Land Reform, Poverty Reduction, and Growth", QJE'],
    effects: { redistribution: 35, growth: 0.4, griev: -0.15, itrust: 0.08 },
  },
  {
    id: 'welfareExpansion', name: 'Welfare state / basic income', category: 'economy', duration: 60, shape: 'ramp',
    description: 'Universal benefits, pensions and unemployment insurance, funded by higher taxes.',
    history: 'Bismarck\'s insurance (1880s), the Beveridge-era UK welfare state (1945–50), Nordic model.',
    refs: ['Esping-Andersen (1990), "The Three Worlds of Welfare Capitalism"'],
    effects: { welfare: 0.35, taxRate: 0.08, progressivity: 0.15, griev: -0.1, itrust: 0.06 },
  },
  {
    id: 'automation', name: 'AI & automation wave', category: 'technology', duration: 180, shape: 'ramp',
    description: 'Machines and AI take over routine work. Productivity soars, but many workers lose jobs and owners take a larger share.',
    history: 'Industrial robots cut local employment and wages in US regions (1990–2007). Generative AI could expose a large share of tasks to automation.',
    refs: ['Acemoglu & Restrepo (2020), "Robots and Jobs", JPE', 'Eloundou et al. (2023), "GPTs are GPTs"', 'Autor (2015), "Why Are There Still So Many Jobs?", JEP'],
    effects: { tech: 45, automation: 35, capitalShare: 8, griev: 0.06, consum: 0.05 },
    baseRate: 0.004, likelihood: (s) => (s.gdppc > 30000 && s.year > 2020 ? 2 : 0.1),
  },
  // ======================= TECHNOLOGY =======================
  {
    id: 'industrialRevolution', name: 'Industrial revolution', category: 'technology', duration: 600, shape: 'sustained',
    description: 'Factories, railways and steam power: decades of rising productivity that pull peasants into cities, spread schooling and slowly transform values and families.',
    history: 'Britain 1760–1840, then Europe, the US and Japan. It started the demographic transition.',
    refs: ['Allen (2009), "The British Industrial Revolution in Global Perspective"', 'Galor (2011), "Unified Growth Theory"'],
    effects: { growth: 1.6, urbanization: 0.5, eduAccess: 0.35, healthSpend: 0.25, contraception: 0.25 },
    baseRate: 0.004, likelihood: (s) => (s.agrarian > 0.6 && s.year > 1700 ? 1 : 0),
  },
  {
    id: 'printing', name: 'Printing press & mass literacy', category: 'technology', duration: 300, shape: 'ramp',
    description: 'Cheap books and pamphlets spread literacy and new ideas, challenging established authority, including religious authority.',
    history: 'Gutenberg (1450s). Towns with early presses grew faster, and printing helped the Protestant Reformation spread.',
    refs: ['Dittmar (2011), "Information Technology and Economic Change", QJE', 'Rubin (2014), "Printing and Protestants", REStat'],
    effects: { eduAccess: 0.35, pressFreedom: 0.1, auth: -0.04, social: 0.03, itrust: -0.05, strict: -0.02 },
  },
  {
    id: 'massMedia', name: 'Radio & mass broadcasting', category: 'technology', duration: 180, shape: 'ramp',
    description: 'A single voice can reach every home. Whoever controls broadcasting can shape the nation: unifying it, or turning it against a scapegoat.',
    history: 'Nazi radio propaganda measurably raised support and anti-Jewish acts where reception was strong; Rwanda\'s RTLM radio fueled the 1994 genocide.',
    refs: ['Adena et al. (2015), "Radio and the Rise of the Nazis", QJE', 'Yanagizawa-Drott (2014), "Propaganda and Conflict", QJE'],
    effects: { propaganda: 0.6, patriot: 0.05 },
  },
  {
    id: 'socialMediaEra', name: 'Social media era', category: 'technology', duration: 120, shape: 'ramp',
    description: 'Smartphones and algorithmic feeds connect everyone. Mobilization becomes easy, echo chambers deepen polarization, and young people\'s mental health may suffer.',
    history: 'In the 2010s Facebook and Twitter helped organize the Arab Spring. In experiments, quitting Facebook reduced polarization and slightly improved well-being.',
    refs: ['Allcott et al. (2020), "The Welfare Effects of Social Media", AER', 'Enikolopov, Makarin & Petrova (2020), "Social Media and Protest Participation", Econometrica', 'Bail et al. (2018), PNAS'],
    effects: { socialMedia: 0.6, mental: -0.04 },
  },
  {
    id: 'pill', name: 'Contraception & women\'s education', category: 'society', duration: 180, shape: 'ramp',
    description: 'Reliable birth control and girls\' schooling let women plan families and careers. Fertility falls sharply.',
    history: 'The pill (1960s US/Europe) delayed marriage and boosted women\'s careers. Female education is the strongest predictor of falling fertility worldwide.',
    refs: ['Goldin & Katz (2002), "The Power of the Pill", JPE', 'Lutz & KC (2011), "Global Human Capital", Science'],
    effects: { contraception: 0.5, genderEquality: 0.3, eduAccess: 0.1 },
  },
  {
    id: 'educationReform', name: 'Universal schooling', category: 'society', duration: 120, shape: 'ramp',
    description: 'Free compulsory education for all children.',
    history: 'Prussia (1763), Meiji Japan (1872), post-independence India and Africa. More schooling raises incomes and civic participation.',
    refs: ['Barro & Lee (2013), "A New Data Set of Educational Attainment"'],
    effects: { eduAccess: 0.4 },
  },
  {
    id: 'healthReform', name: 'Universal healthcare', category: 'health', duration: 60, shape: 'ramp',
    description: 'Public healthcare for all: vaccinations, clinics, hospitals.',
    history: 'UK NHS 1948. Vaccination and sanitation programs drove most of the 20th-century fall in child mortality.',
    refs: ['Cutler, Deaton & Lleras-Muney (2006), "The Determinants of Mortality", JEP'],
    effects: { healthSpend: 0.35, mental: 0.03, health: 0.05 },
  },
  {
    id: 'greenRevolution', name: 'Agricultural revolution', category: 'technology', duration: 180, shape: 'ramp',
    description: 'New seeds, fertilizer and irrigation multiply harvests; famine retreats.',
    history: 'The Green Revolution (1960s–80s) roughly doubled cereal yields in Asia.',
    refs: ['Gollin, Hansen & Wingender (2021), "Two Blades of Grass", JPE'],
    effects: { tech: 35, health: 0.05, urbanization: 0.2 },
    baseRate: 0.004, likelihood: (s) => (s.agrarian > 0.4 && s.year > 1900 ? 1.5 : 0),
  },
  // ======================= POLITICS =======================
  {
    id: 'coup', name: 'Military coup', category: 'politics', duration: 24, shape: 'pulse', regime: 'military',
    description: 'The army seizes power, suspends elections and arrests opponents.',
    history: 'More than 480 coup attempts worldwide since 1950. They are most common in poor countries with a history of coups and an unpopular government.',
    refs: ['Powell & Thyne (2011), "Global Instances of Coups from 1950 to 2010", JPR'],
    effects: { fear: 0.3, itrust: -0.1, securityLoyalty: 0.2 },
    // Rich, consolidated democracies essentially never suffer coups (Przeworski et al. 2000)
    baseRate: 0.015, likelihood: (s) => (s.democracy < 0.5 ? 1 : s.democracy < 0.7 ? 0.3 : 0.02) * (1.4 - s.legitimacy) * 1.5 * (s.gdppc < 12000 ? 1.5 : s.gdppc < 25000 ? 0.4 : 0.04) * (0.5 + s.military),
  },
  {
    id: 'theocraticRevolution', name: 'Clerical takeover', category: 'politics', duration: 24, shape: 'pulse', regime: 'theocracy',
    description: 'Religious authorities take state power and impose their interpretation of religious law.',
    history: 'Iran 1979 began as a broad revolution against the Shah; clerics then consolidated power. Afghanistan 1996 and 2021.',
    refs: ['Kurzman (2004), "The Unthinkable Revolution in Iran"'],
    effects: { fear: 0.2, strict: 0.15, minorityBias: 0.25 },
  },
  {
    id: 'socialistRevolution', name: 'Socialist revolution', category: 'politics', duration: 24, shape: 'pulse', regime: 'socialist',
    description: 'A revolutionary party takes power, nationalizes property and suppresses religion and dissent.',
    history: 'Russia 1917, China 1949, Cuba 1959.',
    refs: ['Skocpol (1979), "States and Social Revolutions"'],
    effects: { marketFreedom: -0.5, redistribution: 50, fear: 0.25 },
  },
  {
    id: 'democratization', name: 'Democratic transition', category: 'politics', duration: 48, shape: 'ramp', regime: 'democratic',
    description: 'Free elections, a free press and courts that restrain rulers are introduced.',
    history: 'Third wave of democratization: Portugal 1974, Spain 1977, Latin America in the 1980s, Eastern Europe 1989, South Africa 1994.',
    refs: ['Huntington (1991), "The Third Wave"', 'Acemoglu & Robinson (2006), "Economic Origins of Dictatorship and Democracy"'],
    effects: { itrust: 0.1, mood: 0.08, fear: -0.15, ruleOfLaw: 0.1 },
  },
  {
    id: 'backsliding', name: 'Democratic backsliding', category: 'politics', duration: 72, shape: 'ramp',
    description: 'An elected leader captures courts, media and elections step by step while keeping a democratic facade.',
    history: 'Venezuela after 1999, Hungary after 2010, Turkey after 2013. Elected autocrats rarely abolish elections outright.',
    refs: ['Levitsky & Ziblatt (2018), "How Democracies Die"', 'V-Dem Institute Democracy Reports'],
    effects: { democracy: -0.35, pressFreedom: -0.35, ruleOfLaw: -0.2, repression: 0.15, patriot: 0.04 },
    baseRate: 0.01, likelihood: (s) => (s.democracy > 0.4 && s.democracy < 0.85 ? 1 : 0.2) * (s.auth > 0.55 ? 2 : 0.6) * (s.itrust < 0.4 ? 1.6 : 0.8) * (s.gdppc > 30000 && s.ruleOfLaw > 0.75 ? 0.3 : 1),
  },
  {
    id: 'electionFraud', name: 'Stolen election', category: 'politics', duration: 6, shape: 'decay',
    description: 'Blatant vote-rigging becomes public. It is a focal point that can bring otherwise divided opponents onto the streets together.',
    history: 'Serbia 2000, Georgia 2003, Ukraine 2004 ("colour revolutions"); Iran 2009; Belarus 2020.',
    refs: ['Tucker (2007), "Enough! Electoral Fraud, Collective Action Problems, and Post-Communist Colored Revolutions"'],
    effects: { itrust: -0.35, griev: 0.25, protestSeed: 0.4, democracy: -0.05 },
    baseRate: 0.015, likelihood: (s) => (s.democracy > 0.2 && s.democracy < 0.6 ? 2 : 0.1),
  },
  {
    id: 'scandal', name: 'Corruption scandal', category: 'politics', duration: 8, shape: 'decay',
    description: 'Leaders are caught stealing; public trust drops.',
    history: 'From Watergate (1974) to Brazil\'s "Car Wash" (2014–21), scandals reliably lower trust in politicians.',
    refs: ['Chong et al. (2015), "Does Corruption Information Inspire the Fight or Quash the Hope?", JOP'],
    effects: { itrust: -0.25, griev: 0.1, ruleOfLaw: 0.02 },
    baseRate: 0.25, likelihood: (s) => (1 - s.ruleOfLaw) * (0.3 + s.democracy),
  },
  {
    id: 'protestSpark', name: 'Spark of outrage', category: 'politics', duration: 4, shape: 'decay',
    description: 'One shocking injustice, caught on camera or told by word of mouth, becomes a symbol and brings angry people out.',
    history: 'Mohamed Bouazizi\'s self-immolation (Tunisia 2010), the killing of George Floyd (2020), Mahsa Amini (Iran 2022).',
    refs: ['Granovetter (1978), "Threshold Models of Collective Behavior", AJS', 'Kuran (1991), "Now Out of Never", World Politics'],
    effects: { protestSeed: 0.5, griev: 0.2 },
    baseRate: 0.06, likelihood: (s) => Math.max(0, s.psi * 1.5),
  },
  {
    id: 'reconciliation', name: 'Reconciliation program', category: 'society', duration: 60, shape: 'sustained',
    description: 'Truth commissions, mixed schools, shared projects and contact between rival groups.',
    history: 'South Africa\'s TRC, Rwanda\'s gacaca courts. Experiments show that cooperative contact, such as mixed football teams of Iraqi Christians and Muslims, builds tolerance.',
    refs: ['Pettigrew & Tropp (2006), "A Meta-Analytic Test of Intergroup Contact Theory", JPSP', 'Mousa (2020), "Building Social Cohesion Between Christians and Muslims Through Soccer", Science'],
    effects: { toler: 0.3, strust: 0.15, extrem: -0.2, griev: -0.1, fear: -0.1 },
  },
  {
    id: 'civilRights', name: 'Civil rights reform', category: 'society', duration: 60, shape: 'ramp',
    description: 'Discrimination against a group is outlawed; equal access to jobs, schools and votes.',
    history: 'US Civil Rights Act (1964), the end of apartheid (1994).',
    refs: ['Wright (2013), "Sharing the Prize"'],
    effects: { minorityBias: -0.4, toler: 0.1, griev: -0.15 },
  },
  {
    id: 'persecution', name: 'Persecution of a group', category: 'conflict', duration: 120, shape: 'ramp', randomTarget: 'minority',
    description: 'Laws strip a group of rights, jobs and safety. The persecuted grow fearful and aggrieved; many flee. Society as a whole becomes poorer and less free.',
    history: 'Jim Crow laws (US), the Nuremberg Laws (Germany 1935), the expulsion of the Rohingya (Myanmar 2017). Persecution reliably drives emigration and long-term loss of human capital.',
    refs: ['Waldinger (2010), "Quality Matters: The Expulsion of Professors and the Consequences for PhD Student Outcomes", JPE', 'Acemoglu, Hassan & Robinson (2011), "Social Structure and Development", QJE'],
    effects: { minorityBias: 0.5, griev: 0.4, fear: 0.4, emigration: 3, itrust: -0.3, mortality: 0.3 },
    target: { faith: 1 },
  },
  {
    id: 'scapegoating', name: 'Scapegoating campaign', category: 'society', duration: 36, shape: 'hump', randomTarget: 'minority',
    description: 'Media and politicians blame a group for society\'s problems. Others grow hostile; the target grows afraid and angry.',
    history: 'Antisemitic propaganda in 1930s Europe, anti-Tutsi radio in Rwanda (1994), and rhetoric against immigrants in many places.',
    refs: ['Yanagizawa-Drott (2014), QJE', 'Voigtländer & Voth (2015), "Nazi Indoctrination and Anti-Semitic Beliefs in Germany", PNAS'],
    effects: { backlash: 0.6, griev: 0.2 }, target: { faith: 1 },
    baseRate: 0.01, likelihood: (s) => (s.auth > 0.55 ? 2 : 0.5) * (s.growth < 0 ? 2 : 1) * s.diversity * 2,
  },
  // ======================= CONFLICT =======================
  {
    id: 'war', name: 'War with a neighbour', category: 'conflict', duration: 48, shape: 'sustained',
    description: 'Young men are mobilized and many die. People first rally around the flag, then grow weary and angry as the war drags on. Debt and inflation rise.',
    history: 'In World War I, 13% of mobilized French soldiers died. Approval of leaders spikes at the start of wars (the "rally effect") and erodes with casualties.',
    refs: ['Mueller (1970), "Presidential Popularity from Truman to Johnson", APSR', 'Correlates of War Project', 'Scheve & Stasavage (2010), "The Conscription of Wealth", IO'],
    effects: { war: 20, patriot: 0.2, fear: 0.2, gdp: -6, inflation: 12, military: 0.25, taxRate: 0.06 },
    baseRate: 0.012, likelihood: (s) => (0.4 + s.patriot) * (0.5 + s.auth) * (0.5 + s.military) * (s.democracy > 0.7 ? 0.5 : 1.2) * (s.legitimacy < 0.4 ? 1.5 : 1),
  },
  {
    id: 'civilWar', name: 'Civil war', category: 'conflict', duration: 72, shape: 'hump',
    description: 'Armed factions fight for control. Deaths, displacement, collapse of the economy, and deep distrust that lasts generations.',
    history: 'Spain 1936–39, Lebanon 1975–90, Syria 2011–. Civil wars typically cut income by about 15% and take decades to recover from.',
    refs: ['Collier (1999), "On the Economic Consequences of Civil War", OEP', 'Fearon & Laitin (2003), "Ethnicity, Insurgency, and Civil War", APSR'],
    effects: { mortality: 1.2, fear: 0.45, gdp: -25, emigration: 2.5, strust: -0.25, toler: -0.2, extrem: 0.12, griev: 0.2, wealthDestroyed: 25, crime: 1 },
  },
  {
    id: 'occupation', name: 'Foreign occupation', category: 'conflict', duration: 84, shape: 'sustained',
    description: 'A foreign power rules the country by force. Humiliation and resistance follow; some resisters turn to terrorism.',
    history: 'Nearly all suicide-terror campaigns from 1980 to 2003 aimed to force a foreign military out of territory the attackers saw as their homeland.',
    refs: ['Pape (2005), "Dying to Win"', 'Kalyvas (2006), "The Logic of Violence in Civil War"'],
    effects: { democracy: -0.35, repression: 0.3, griev: 0.35, patriot: 0.2, extrem: 0.12, fear: 0.2, itrust: -0.3 },
  },
  {
    id: 'independence', name: 'Independence', category: 'politics', duration: 12, shape: 'decay',
    description: 'Liberation from foreign rule: a burst of national pride and hope.',
    history: 'The wave of decolonization 1945–1975.',
    refs: ['Wimmer (2013), "Waves of War"'],
    effects: { patriot: 0.3, itrust: 0.25, mood: 0.2, democracy: 0.15, griev: -0.2 },
  },
  {
    id: 'terror', name: 'Terror attack', category: 'conflict', duration: 6, shape: 'decay', randomTarget: 'extremists',
    description: 'A mass-casualty attack by extremists. Fear spreads, the nation rallies, and suspicion often falls on the attackers\' whole community, which can feed the next cycle of radicalization.',
    history: 'After 9/11, hate crimes against Muslims in the US rose sharply. Attacks are often designed to provoke overreaction.',
    refs: ['Disha, Cavendish & King (2011), "Historical Events and Spaces of Hate", Social Problems', 'Kydd & Walter (2006), "The Strategies of Terrorism", IS'],
    effects: { fear: 0.4, backlash: 0.5, patriot: 0.1, repression: 0.05, itrust: 0.05, mortality: 0.02 }, target: { faith: 0 },
  },
  {
    id: 'assassination', name: 'Assassination of a leader', category: 'politics', duration: 6, shape: 'decay',
    description: 'A prominent figure is killed. Shock, fear and a power vacuum follow.',
    history: 'Archduke Franz Ferdinand (1914), Gandhi (1948), JFK (1963), Rabin (1995). Successful assassinations of autocrats tend to change institutions more than failed attempts do.',
    refs: ['Jones & Olken (2009), "Hit or Miss? The Effect of Assassinations on Institutions and War", AEJ'],
    effects: { fear: 0.2, itrust: -0.1, extrem: 0.03, securityLoyalty: -0.1 },
    baseRate: 0.01,
  },
  // ======================= HEALTH =======================
  {
    id: 'pandemic1918', name: 'Severe influenza pandemic', category: 'health', duration: 18, shape: 'hump', ifrProfile: 'flu1918',
    description: 'A deadly flu that, unusually, kills many healthy young adults as well as infants and the elderly.',
    history: 'The 1918–20 "Spanish" flu killed about 40 million people (about 2% of humanity) in waves; typical GDP losses were about 6%.',
    refs: ['Taubenberger & Morens (2006), Emerging Infectious Diseases', 'Barro, Ursúa & Weng (2020), NBER w26866'],
    effects: { epidemic: 2.4, ifr: 2.5, gdp: -6, fear: 0.3, mood: -0.1 },
    baseRate: 0.008,
  },
  {
    id: 'pandemicCovid', name: 'Modern pandemic', category: 'health', duration: 30, shape: 'hump', ifrProfile: 'covid',
    description: 'A coronavirus-like pandemic: deadly mainly for the old, with lockdowns, lost jobs and lonely months.',
    history: 'COVID-19 (2020–22): the infection fatality rate rose steeply with age (about 0.01% at 25, about 5–10% at 85); the world economy shrank about 3% in 2020.',
    refs: ['Levin et al. (2020), "Assessing the Age Specificity of Infection Fatality Rates for COVID-19", EJE', 'IMF World Economic Outlook (2021)'],
    effects: { epidemic: 2.2, ifr: 0.35, gdp: -5, unemployment: 4, mental: -0.08, fear: 0.2 },
    baseRate: 0.015, likelihood: (s) => (s.year > 1950 ? 1 : 0.4),
  },
  {
    id: 'plague', name: 'Plague (Black Death)', category: 'health', duration: 48, shape: 'hump', ifrProfile: 'uniform',
    description: 'A catastrophic plague kills a third or more of the people. Afterwards, the surviving workers become scarce and valuable, so wages rise.',
    history: 'The Black Death (1347–51) killed 30–50% of Europeans. Real wages roughly doubled afterwards, and the old social order weakened.',
    refs: ['Benedictow (2004), "The Black Death 1346–1353"', 'Jedwab, Johnson & Koyama (2022), "The Economic Impact of the Black Death", JEL'],
    effects: { epidemic: 3.2, ifr: 45, fear: 0.5, relig: 0.1, gdp: -10, mood: -0.25 },
    baseRate: 0.003, likelihood: (s) => (s.year < 1800 ? 3 : 0.1) * (s.gdppc < 4000 ? 1 : 0.2),
  },
  {
    id: 'famine', name: 'Famine', category: 'nature', duration: 18, shape: 'hump', mortalityProfile: 'vulnerable',
    description: 'Harvests fail and food runs out. Children and the elderly die first; survivors carry the scars for life.',
    history: 'Ireland 1845–52 (about 1 million dead, 1 million emigrated), Bengal 1943, China 1959–61. Famines are rare in democracies with a free press.',
    refs: ['Sen (1981), "Poverty and Famines"', 'Ó Gráda (2009), "Famine: A Short History"'],
    effects: { mortality: 5, health: -0.3, griev: 0.3, gdp: -10, emigration: 1, relig: 0.05, mood: -0.25 },
    baseRate: 0.02, likelihood: (s) => (s.gdppc < 3000 ? 2.5 : 0.02) * (s.atWar ? 2 : 1) * (s.democracy > 0.6 ? 0.2 : 1),
  },
  {
    id: 'drugEpidemic', name: 'Deaths of despair', category: 'health', duration: 120, shape: 'hump',
    description: 'Opioids, alcohol and suicide spread among people left behind economically.',
    history: 'In the US since the late 1990s, mortality rose among middle-aged adults without degrees.',
    refs: ['Case & Deaton (2020), "Deaths of Despair and the Future of Capitalism"'],
    effects: { mortality: 0.25, mental: -0.15, health: -0.08, griev: 0.08, crime: 0.4 }, target: { minAge: 20, maxAge: 60, wealthClass: 0 },
    baseRate: 0.005, likelihood: (s) => (s.gdppc > 25000 ? 1.5 : 0.3),
  },
  // ======================= NATURE =======================
  {
    id: 'earthquake', name: 'Earthquake', category: 'nature', duration: 6, shape: 'pulse', target: { settlement: -2 },
    description: 'A city is shaken to ruins. Survivors pull together, but resentment follows if the government fails them.',
    history: 'Lisbon 1755, Tangshan 1976, Haiti 2010, Turkey–Syria 2023. Poorly built cities suffer far worse.',
    refs: ['Kahn (2005), "The Death Toll from Natural Disasters", REStat', 'Solnit (2009), "A Paradise Built in Hell"'],
    effects: { mortality: 15, wealthDestroyed: 35, fear: 0.4, strust: 0.08, health: -0.1 },
    baseRate: 0.03,
  },
  {
    id: 'flood', name: 'Great flood', category: 'nature', duration: 4, shape: 'pulse', target: { settlement: -2 },
    description: 'Rivers burst their banks; homes and harvests are washed away.',
    history: 'China 1931, Pakistan 2010 and 2022.',
    refs: ['EM-DAT International Disaster Database'],
    effects: { mortality: 3, wealthDestroyed: 25, fear: 0.25, health: -0.08, gdp: -1 },
    baseRate: 0.05,
  },
  {
    id: 'drought', name: 'Long drought', category: 'nature', duration: 48, shape: 'sustained', target: { rural: true },
    description: 'Years without enough rain ruin farmers, who crowd into city slums looking for work.',
    history: 'The 2006–10 drought in Syria displaced farmers into cities before the 2011 uprising (the causal link is debated).',
    refs: ['Kelley et al. (2015), PNAS', 'Selby et al. (2017), "Climate change and the Syrian civil war revisited", Political Geography'],
    effects: { gdp: -4, urbanization: 0.6, griev: 0.15, health: -0.05, mood: -0.1 },
    baseRate: 0.02, likelihood: (s) => (s.agrarian > 0.3 ? 1.5 : 0.4),
  },
  // ======================= SOCIETY / MIGRATION =======================
  {
    id: 'refugees', name: 'Refugee wave', category: 'society', duration: 24, shape: 'hump',
    description: 'People fleeing war arrive in large numbers: poor, traumatized and often from a different faith. How the hosts react shapes the next decades.',
    history: 'Europe 2015–16 (about 1.3 million asylum seekers), Jordan and Lebanon after 2011, Germany after 1945 (12 million expellees).',
    refs: ['Dustmann et al. (2019), "Refugee Migration and Electoral Outcomes", REStud', 'Hangartner et al. (2019), "Does Exposure to the Refugee Crisis Make Natives More Hostile?", APSR'],
    effects: { migrants: 3 },
    migrant: { faith: 1, religiosity: 0.7, education: 8, wealth: 0.1, strictness: 0.5, social: 0.35 },
    baseRate: 0.01,
  },
  {
    id: 'laborMigration', name: 'Labour immigration', category: 'society', duration: 120, shape: 'sustained',
    description: 'Workers are invited in to fill jobs, and many settle with their families.',
    history: 'Gastarbeiter in Germany (1955–73), Gulf migrant labour, post-war Britain.',
    refs: ['Borjas (2014), "Immigration Economics"', 'Card (1990), "The Impact of the Mariel Boatlift"'],
    effects: { migrants: 8, growth: 0.3 },
    migrant: { faith: -1, religiosity: 0.6, education: 9, wealth: 0.2, strictness: 0.45, social: 0.4 },
  },
  {
    id: 'brainDrain', name: 'Brain drain', category: 'society', duration: 120, shape: 'sustained',
    description: 'Educated young people leave for richer, freer countries.',
    history: 'Eastern Europe after 2004, Iran, Nigeria, India\'s tech emigration.',
    refs: ['Docquier & Rapoport (2012), "Globalization, Brain Drain, and Development", JEL'],
    effects: { emigration: 1.2 }, target: { minAge: 20, maxAge: 40 },
    baseRate: 0.01, likelihood: (s) => (s.gdppc < 15000 ? 1.5 : 0.3) * (s.democracy < 0.4 ? 1.5 : 1),
  },
  {
    id: 'culturalRevolution', name: 'Youth cultural revolution', category: 'society', duration: 120, shape: 'hump',
    description: 'A rebellious young generation questions tradition, religion and authority.',
    history: 'The 1960s counterculture and the 1968 protests; the "silent revolution" toward self-expression values in rich democracies.',
    refs: ['Inglehart (1977), "The Silent Revolution"', 'Inglehart & Welzel (2005), "Modernization, Cultural Change, and Democracy"'],
    effects: { social: 0.3, relig: -0.15, auth: -0.2, toler: 0.12, consum: 0.05 }, target: { minAge: 14, maxAge: 32 },
  },
  {
    id: 'traditionalistBacklash', name: 'Traditionalist backlash', category: 'society', duration: 96, shape: 'hump',
    description: 'Older and rural people, feeling their way of life is disappearing, push back hard against cultural change.',
    history: 'Rising support for populist-authoritarian parties in Western democracies since the 2000s.',
    refs: ['Norris & Inglehart (2019), "Cultural Backlash"'],
    effects: { social: -0.2, auth: 0.15, patriot: 0.15, toler: -0.1, griev: 0.08 }, target: { minAge: 45 },
    baseRate: 0.008, likelihood: (s) => (s.democracy > 0.5 && s.gdppc > 15000 ? 1.5 : 0.3),
  },
  {
    id: 'nationalTriumph', name: 'National sporting triumph', category: 'society', duration: 6, shape: 'decay',
    description: 'The national team wins a big tournament; for a while everyone feels part of one nation.',
    history: 'After African national football teams won key matches, people identified less with their ethnic group and trusted other groups more.',
    refs: ['Depetris-Chauvin, Durante & Campante (2020), "Building Nations through Shared Experiences", AER'],
    effects: { patriot: 0.12, mood: 0.15, toler: 0.06, strust: 0.05 },
    baseRate: 0.08,
  },
  // ======================= FAITH =======================
  {
    id: 'religiousRevival', name: 'Religious revival', category: 'faith', duration: 120, shape: 'hump',
    description: 'A wave of spiritual renewal: prayer, charity and community life flourish.',
    history: 'The Great Awakenings in America (1730s, 1800s), the Islamic revival from the 1970s, the rise of Pentecostalism in Latin America and Africa.',
    refs: ['Finke & Stark (2005), "The Churching of America"', 'Norris & Inglehart (2011), "Sacred and Secular"'],
    effects: { relig: 0.3, strust: 0.06, mood: 0.05, consum: -0.06, social: -0.06 },
    baseRate: 0.008, likelihood: (s) => (s.growth < 0 || s.itrust < 0.35 ? 1.6 : 0.8),
  },
  {
    id: 'secularization', name: 'Secularization wave', category: 'faith', duration: 180, shape: 'ramp',
    description: 'Religion fades from public life as people feel secure and schooling spreads.',
    history: 'Western Europe since the 1960s; Quebec\'s "Quiet Revolution". Secularization follows existential security.',
    refs: ['Norris & Inglehart (2011), "Sacred and Secular"', 'Voas & Chaves (2016), "Is the United States a Counterexample to the Secularization Thesis?", AJS'],
    effects: { relig: -0.2, social: 0.08 },
  },
  {
    id: 'literalism', name: 'Rise of rigid literalism', category: 'faith', duration: 120, shape: 'hump',
    description: 'A movement preaches a narrow, literal reading of scripture and rejects other interpretations. Tolerance falls; a minority drifts toward militancy. It can arise in any tradition.',
    history: 'Christian fundamentalism in the 1920s US, Salafi-jihadism, Hindutva, militant Buddhist nationalism in Myanmar and Sri Lanka.',
    refs: ['Almond, Appleby & Sivan (2003), "Strong Religion"', 'Juergensmeyer (2017), "Terror in the Mind of God"'],
    effects: { strict: 0.35, toler: -0.2, social: -0.12, extrem: 0.05 }, target: { faith: 0 },
  },
  {
    id: 'reformMovement', name: 'Religious reform movement', category: 'faith', duration: 120, shape: 'hump',
    description: 'Scholars reinterpret scripture for the modern age, emphasizing mercy, reason and coexistence.',
    history: 'The Protestant Reformation\'s later irenic currents, Vatican II (1962–65), and 19th–20th-century Islamic modernism (al-Afghani, Abduh).',
    refs: ['Hourani (1962), "Arabic Thought in the Liberal Age"', 'O\'Malley (2008), "What Happened at Vatican II"'],
    effects: { strict: -0.3, toler: 0.2, social: 0.08 }, target: { faith: 0 },
  },
  // ======================= PEOPLE =======================
  {
    id: 'demagogue', name: 'A populist demagogue rises', category: 'people', duration: 240, shape: 'sustained',
    description: 'A charismatic figure blames elites and outsiders, promises to restore greatness, and wins devoted followers. In a democracy they may win power.',
    history: 'Charismatic outsiders tend to thrive after crises: Mussolini (1922), Perón (1946), and many 21st-century populists.',
    refs: ['Weber (1922), "Economy and Society": charismatic authority', 'Mudde & Kaltwasser (2017), "Populism: A Very Short Introduction"'],
    effects: {},
    leader: { style: 'demagogue', charisma: 0.85, reach: 0.9, ideology: { social: 0.25, econ: 0.4, auth: 0.9, relig: 0.6, patriot: 0.95, toler: 0.15 } },
    baseRate: 0.02, likelihood: (s) => (s.itrust < 0.4 ? 2 : 0.6) * (s.growth < 0 || s.unemployment > 0.1 ? 1.8 : 1) * (0.5 + s.socialMedia),
  },
  {
    id: 'reformer', name: 'A reformer leads', category: 'people', duration: 240, shape: 'sustained',
    description: 'A leader committed to openness, honest government and the rule of law.',
    history: 'Gorbachev\'s glasnost (1985–91), Lee Kuan Yew\'s anti-corruption drive, Atatürk\'s modernizing reforms, Deng Xiaoping\'s economic opening.',
    refs: ['Jones & Olken (2005), "Do Leaders Matter?", QJE'],
    effects: {},
    leader: { style: 'reformer', charisma: 0.75, reach: 0.9, ideology: { social: 0.7, econ: 0.55, auth: 0.25, relig: 0.35, patriot: 0.5, toler: 0.8 } },
    baseRate: 0.01,
  },
  {
    id: 'peacemaker', name: 'A peacemaker emerges', category: 'people', duration: 240, shape: 'sustained',
    description: 'A morally powerful figure who unites rival groups and channels anger into nonviolence.',
    history: 'Gandhi, Martin Luther King Jr., Nelson Mandela, Abdul Ghaffar Khan (the "Frontier Gandhi"). Nonviolent campaigns succeeded about twice as often as violent ones (1900–2006).',
    refs: ['Chenoweth & Stephan (2011), "Why Civil Resistance Works"'],
    effects: {},
    leader: { style: 'peacemaker', charisma: 0.9, reach: 0.8, ideology: { social: 0.55, econ: 0.4, auth: 0.2, relig: 0.6, patriot: 0.6, toler: 0.95, extrem: 0 } },
    baseRate: 0.005,
  },
  {
    id: 'spiritualTeacher', name: 'A spiritual teacher inspires', category: 'people', duration: 240, shape: 'sustained',
    description: 'A respected scholar or preacher revives faith, charity and moral discipline among their followers.',
    history: 'Founders and renewers of religious movements throughout history have reshaped how millions live.',
    refs: ['Stark (1996), "The Rise of Christianity"', 'Weber (1922): charismatic authority'],
    effects: {},
    leader: { style: 'spiritual', charisma: 0.8, reach: 0.6, ideology: { social: 0.35, econ: 0.4, auth: 0.45, relig: 0.95, patriot: 0.5, toler: 0.7 } },
    baseRate: 0.01,
  },
  {
    id: 'extremistRecruiter', name: 'Extremist network forms', category: 'people', duration: 120, shape: 'sustained', randomTarget: 'none',
    description: 'A militant recruiter targets aggrieved, isolated young people, offering them meaning, belonging and an enemy.',
    history: 'Radicalization usually runs through personal networks of friends and family, not lone exposure to ideology. Recruits are typically motivated by a loss of significance.',
    refs: ['Sageman (2004), "Understanding Terror Networks"', 'Kruglanski et al. (2014), "The Psychology of Radicalization and Deradicalization", Political Psychology', 'McCauley & Moskalenko (2008), "Mechanisms of Political Radicalization"'],
    effects: {},
    leader: { style: 'extremist', charisma: 0.7, reach: 0.25, ideology: { social: 0.15, auth: 0.9, relig: 0.8, patriot: 0.6, toler: 0.02, extrem: 0.95 } },
    baseRate: 0.015, likelihood: (s) => 0.3 + s.extremists * 40 + (s.toler < 0.4 ? 1 : 0),
  },
  {
    id: 'revolutionary', name: 'A revolutionary organizer', category: 'people', duration: 120, shape: 'sustained',
    description: 'An organizer turns scattered anger into a disciplined mass movement.',
    history: 'Lech Wałęsa and Solidarity (1980s Poland), and the student organizers of 1989.',
    refs: ['McAdam (1982), "Political Process and the Development of Black Insurgency"', 'Tilly (1978), "From Mobilization to Revolution"'],
    effects: {},
    leader: { style: 'revolutionary', charisma: 0.8, reach: 0.7, ideology: { social: 0.55, econ: 0.3, auth: 0.3, relig: 0.4, patriot: 0.6, toler: 0.6 } },
    baseRate: 0.008, likelihood: (s) => (s.democracy < 0.5 ? 2 : 0.4) * (0.5 + s.psi * 2),
  },
  {
    id: 'visionary', name: 'A visionary inventor', category: 'people', duration: 240, shape: 'sustained',
    description: 'An inventor or entrepreneur whose ideas transform industry and daily life.',
    history: 'Watt\'s steam engine, Edison\'s electric grid, Ford\'s assembly line, and the founders of the personal-computer and internet industries.',
    refs: ['Mokyr (1990), "The Lever of Riches"', 'Schumpeter (1942): creative destruction'],
    effects: { tech: 8, consum: 0.04 },
    leader: { style: 'visionary', charisma: 0.6, reach: 0.6, ideology: { social: 0.65, econ: 0.75, auth: 0.3, relig: 0.3, patriot: 0.5, toler: 0.7 } },
    baseRate: 0.02, likelihood: (s) => (s.gdppc > 5000 ? 1 : 0.3) * (0.5 + s.democracy),
  },
];

export const TEMPLATE_BY_ID: Record<string, EventSpec> = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

/** Build the effective spec of a scheduled event. */
export function resolveScheduled(ev: ScheduledEvent): EventSpec | null {
  const base = ev.custom ? (ev.custom as EventSpec) : TEMPLATE_BY_ID[ev.templateId];
  if (!base) return null;
  return {
    ...base,
    target: ev.target ?? base.target,
    leader: ev.leader ?? base.leader,
    migrant: ev.migrant ?? base.migrant,
  };
}
