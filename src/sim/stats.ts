// Indicator definitions shared by the engine (which computes them) and the UI (which charts them).

export type Fmt = 'int' | 'money' | 'pct' | 'pct1' | 'idx' | 'num1' | 'num2' | 'years' | 'per1k' | 'per100k';

export interface SeriesDef {
  key: string;
  label: string;
  fmt: Fmt;
  group: 'people' | 'economy' | 'minds' | 'politics' | 'faith' | 'parties';
  help?: string;
  /** True when higher is better (for coloring deltas). */
  good?: boolean;
}

export const SERIES: SeriesDef[] = [
  { key: 'pop', label: 'Population', fmt: 'int', group: 'people' },
  { key: 'births', label: 'Birth rate', fmt: 'per1k', group: 'people', help: 'Births per 1,000 people per year' },
  { key: 'deaths', label: 'Death rate', fmt: 'per1k', group: 'people', help: 'Deaths per 1,000 people per year' },
  { key: 'lifeExp', label: 'Life expectancy', fmt: 'years', group: 'people', good: true, help: 'Period life expectancy at birth, from this year\'s deaths' },
  { key: 'tfr', label: 'Fertility rate', fmt: 'num2', group: 'people', help: 'Children per woman (period total fertility rate)' },
  { key: 'medianAge', label: 'Median age', fmt: 'years', group: 'people' },
  { key: 'urban', label: 'Urban share', fmt: 'pct', group: 'people' },
  { key: 'edu', label: 'Years of schooling', fmt: 'num1', group: 'people', good: true, help: 'Mean years of schooling, adults 25+' },
  { key: 'married', label: 'Adults with partner', fmt: 'pct', group: 'people' },
  { key: 'immigrantShare', label: 'Immigrant share', fmt: 'pct', group: 'people' },
  { key: 'gdppc', label: 'GDP per person', fmt: 'money', group: 'economy', good: true, help: 'Output per person per year, international $ (PPP)' },
  { key: 'growth', label: 'Economic growth', fmt: 'pct1', group: 'economy', good: true, help: 'Change in GDP per person over the past 12 months' },
  { key: 'unemployment', label: 'Unemployment', fmt: 'pct1', group: 'economy', good: false },
  { key: 'inflation', label: 'Inflation', fmt: 'pct1', group: 'economy', good: false },
  { key: 'gini', label: 'Income inequality', fmt: 'idx', group: 'economy', good: false, help: 'Gini coefficient of household income per adult (0 = equal, 1 = one person has all)' },
  { key: 'wealthGini', label: 'Wealth inequality', fmt: 'idx', group: 'economy', good: false },
  { key: 'top10', label: 'Top 10% wealth share', fmt: 'pct', group: 'economy' },
  { key: 'poverty', label: 'Poverty rate', fmt: 'pct', group: 'economy', good: false, help: 'Adults below 50% of median income (relative poverty)' },
  { key: 'extremePoverty', label: 'Extreme poverty', fmt: 'pct', group: 'economy', good: false, help: 'Adults living on less than $2.15 a day' },
  { key: 'debtRatio', label: 'Public debt / GDP', fmt: 'pct', group: 'economy' },
  { key: 'happy', label: 'Life satisfaction', fmt: 'idx', group: 'minds', good: true },
  { key: 'health', label: 'Physical health', fmt: 'idx', group: 'minds', good: true },
  { key: 'mental', label: 'Mental health', fmt: 'idx', group: 'minds', good: true },
  { key: 'griev', label: 'Grievance', fmt: 'idx', group: 'minds', good: false },
  { key: 'fear', label: 'Fear', fmt: 'idx', group: 'minds', good: false },
  { key: 'itrust', label: 'Trust in institutions', fmt: 'idx', group: 'minds', good: true },
  { key: 'strust', label: 'Trust in people', fmt: 'idx', group: 'minds', good: true },
  { key: 'toler', label: 'Tolerance', fmt: 'idx', group: 'minds', good: true },
  { key: 'social', label: 'Social liberalism', fmt: 'idx', group: 'minds', help: '0 = traditional, 1 = progressive' },
  { key: 'econ', label: 'Pro-market views', fmt: 'idx', group: 'minds', help: '0 = redistribution, 1 = free market' },
  { key: 'auth', label: 'Desire for strong leader', fmt: 'idx', group: 'minds' },
  { key: 'patriot', label: 'Nationalism', fmt: 'idx', group: 'minds' },
  { key: 'consum', label: 'Consumerism', fmt: 'idx', group: 'minds' },
  { key: 'esteem', label: 'Self-esteem', fmt: 'num2', group: 'minds', help: '−1 inferiority complex … +1 superiority complex' },
  { key: 'polarization', label: 'Polarization', fmt: 'idx', group: 'minds', good: false, help: 'Spread of social and economic views (0 = consensus, 1 = two hostile camps)' },
  { key: 'relig', label: 'Religiosity', fmt: 'idx', group: 'faith' },
  { key: 'strict', label: 'Strict interpretation', fmt: 'idx', group: 'faith' },
  { key: 'extrem', label: 'Extremists', fmt: 'pct1', group: 'faith', good: false, help: 'Share of adults ready to use violence for a cause' },
  { key: 'democracy', label: 'Democracy', fmt: 'idx', group: 'politics', good: true },
  { key: 'pressFreedom', label: 'Press freedom', fmt: 'idx', group: 'politics', good: true },
  { key: 'repression', label: 'Repression', fmt: 'idx', group: 'politics', good: false },
  { key: 'legitimacy', label: 'Regime legitimacy', fmt: 'idx', group: 'politics', good: true },
  { key: 'psi', label: 'Political stress', fmt: 'idx', group: 'politics', good: false, help: 'Turchin\'s structural-demographic stress index: mass discontent × elite competition × state fiscal weakness' },
  { key: 'protest', label: 'Protesting', fmt: 'pct1', group: 'politics', good: false, help: 'Share of adults in street protests' },
  { key: 'crime', label: 'Crime rate', fmt: 'per1k', group: 'politics', good: false, help: 'Crimes per 1,000 people per year' },
  { key: 'homicide', label: 'Homicide rate', fmt: 'per100k', group: 'politics', good: false, help: 'Killings per 100,000 per year (crime, terror, repression)' },
  { key: 'suicide', label: 'Suicide rate', fmt: 'per100k', group: 'politics', good: false },
  { key: 'welfare', label: 'Welfare generosity', fmt: 'idx', group: 'politics' },
  { key: 'taxRate', label: 'Tax rate', fmt: 'pct', group: 'politics' },
];

export const SERIES_BY_KEY: Record<string, SeriesDef> = Object.fromEntries(SERIES.map((s) => [s.key, s]));

export function fmtValue(v: number, fmt: Fmt): string {
  if (!isFinite(v)) return '–';
  switch (fmt) {
    case 'int': return compact(v);
    case 'money': return '$' + compact(v);
    case 'pct': return (v * 100).toFixed(0) + '%';
    case 'pct1': return (v * 100).toFixed(1) + '%';
    case 'idx': return v.toFixed(2);
    case 'num1': return v.toFixed(1);
    case 'num2': return v.toFixed(2);
    case 'years': return v.toFixed(1);
    case 'per1k': return v.toFixed(1) + '‰';
    case 'per100k': return v.toFixed(1);
  }
}

export function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return (v / 1e3).toFixed(1) + 'K';
  if (a >= 1e3) return Math.round(v).toLocaleString('en-US');
  return a >= 10 ? Math.round(v).toString() : v.toFixed(1);
}

/** Gini coefficient of a sorted (ascending) sample; negative values are clipped to 0. */
export function giniSorted(a: Float64Array | number[], n: number): number {
  let sum = 0, cum = 0;
  for (let i = 0; i < n; i++) {
    const v = a[i] > 0 ? a[i] : 0;
    sum += v;
    cum += v * (2 * (i + 1) - n - 1);
  }
  return sum > 0 ? cum / (n * sum) : 0;
}

/** Period life expectancy at birth from deaths and person-years by single year of age. */
export function lifeExpectancy(deaths: Float64Array, exposure: Float64Array): number {
  let l = 1, e = 0;
  const n = deaths.length;
  for (let a = 0; a < n; a++) {
    const m = exposure[a] > 0 ? deaths[a] / exposure[a] : a > 90 ? 0.4 : 0;
    const q = a === n - 1 ? 1 : Math.min(1, m / (1 + 0.5 * m));
    const d = l * q;
    e += (l - d) + d * (a === 0 ? 0.15 : 0.5);
    l -= d;
    if (l <= 1e-6) break;
  }
  return e;
}

// ---------------------------------------------------------------------------------------------
// Ideology camps: adults grouped by their combination of values (first matching rule wins).
// ---------------------------------------------------------------------------------------------

export const CAMPS = [
  { id: 'religiousTrad', label: 'Religious traditionalists', color: '#2f9e6e', help: 'Devout and socially conservative' },
  { id: 'nationalist', label: 'Nationalists', color: '#d0453f', help: 'Strong national pride and a wish for order and a strong leader' },
  { id: 'progressive', label: 'Secular progressives', color: '#7b6fe0', help: 'Socially liberal and not very religious' },
  { id: 'socialist', label: 'Socialists', color: '#e0782e', help: 'Want strong redistribution' },
  { id: 'marketLiberal', label: 'Market liberals', color: '#3987e5', help: 'Favour free markets' },
  { id: 'moderate', label: 'Moderates', color: '#8b8a84', help: 'No strong leaning' },
] as const;

/**
 * The camp a person leans to most: each camp scores how far its defining views are from the
 * centre (a camp defined by two views takes the weaker of the two), and weak leanings are moderate.
 */
export function campOf(relig: number, social: number, econ: number, auth: number, patriot: number): number {
  let best = 5, bs = 0.13;
  const sc = [
    Math.min(relig - 0.5, 0.5 - social),
    Math.min(patriot - 0.5, auth - 0.5),
    Math.min(social - 0.5, 0.5 - relig),
    0.5 - econ,
    econ - 0.5,
  ];
  for (let k = 0; k < 5; k++) if (sc[k] > bs) { bs = sc[k]; best = k; }
  return best;
}
