// Real faith traditions, described by MEASURABLE characteristics in a given region.
//
// Why "tradition × region": surveys consistently find that the same religion looks very different
// in different places (Muslims in Bosnia vs. Pakistan, Christians in Sweden vs. Nigeria), often more
// different than neighbouring groups of another faith. So each profile is a tradition in a context.
//
// What is (and is not) here: only characteristics that are documented by large surveys and that
// drive group growth — devotion, literal vs. flexible reading of scripture, fertility, age structure,
// how firmly the group keeps its members (retention), how actively it gains converts (outreach),
// how strongly it marries within the group (endogamy), schooling and wealth relative to the national
// average. There are no character traits (honesty, aggression, intelligence…): those are not
// supported by evidence, and violence in the model comes from grievance, humiliation and networks,
// which can affect any group. Tolerance starts equal for every profile because measured intergroup
// tolerance depends mostly on the country and its history; presets set it per country.

export interface FaithProfile {
  id: string;
  /** Short name used for the group, e.g. "Muslims". */
  name: string;
  tradition: 'Christianity' | 'Islam' | 'Hinduism' | 'Buddhism' | 'Judaism' | 'Sikhism' | 'Folk religion' | 'No religion';
  context: string;
  color: string;
  religiosity: number;
  strictness: number;
  tolerance: number;
  /** Extra desired children per woman compared with an otherwise identical person (can be negative). */
  fertility: number;
  /** 0..1: how firmly the group keeps adults and raises children in the faith. */
  retention: number;
  /** 0..1: how actively the group gains converts (mission, dawah, marriage). */
  outreach: number;
  /** 0..1: preference for marrying within the group. */
  endogamy: number;
  /** Years of schooling above (+) or below (−) the national average at the start. */
  eduGap: number;
  /** Wealth relative to the national average at the start. */
  wealthRatio: number;
  /** Younger (+) or older (−) age structure than the national average. */
  youth: number;
  secular?: boolean;
  source: string;
}

export const TRADITION_COLORS: Record<FaithProfile['tradition'], string> = {
  Christianity: '#3987e5',
  Islam: '#199e70',
  Hinduism: '#e0782e',
  Buddhism: '#c9a400',
  Judaism: '#9085e9',
  Sikhism: '#d55181',
  'Folk religion': '#a0703c',
  'No religion': '#8b8a84',
};

const P = (p: Omit<FaithProfile, 'color' | 'tolerance'> & { color?: string; tolerance?: number }): FaithProfile => ({
  tolerance: 0.55,
  color: TRADITION_COLORS[p.tradition],
  ...p,
});

export const FAITH_PROFILES: FaithProfile[] = [
  // ------------------------------------------------------------------ Christianity
  P({
    id: 'christian_weurope', name: 'Christians', tradition: 'Christianity', context: 'Western & Northern Europe',
    religiosity: 0.25, strictness: 0.2, fertility: 0, retention: 0.5, outreach: 0.12, endogamy: 0.25, eduGap: 0, wealthRatio: 1.05, youth: -0.12,
    source: 'Pew 2018 "Being Christian in Western Europe": 11–22% say religion is very important; large losses to "no religion" through switching.',
  }),
  P({
    id: 'christian_us', name: 'Christians', tradition: 'Christianity', context: 'United States',
    religiosity: 0.6, strictness: 0.45, fertility: -0.35, retention: 0.62, outreach: 0.45, endogamy: 0.35, eduGap: -0.2, wealthRatio: 1, youth: -0.08,
    source: 'Pew Religious Landscape Study 2023–24; Pew 2022 "Modeling the Future of Religion in America" (net losses to switching).',
  }),
  P({
    id: 'evangelical', name: 'Evangelical Christians', tradition: 'Christianity', context: 'Evangelical & Pentecostal (Americas, Africa)',
    religiosity: 0.85, strictness: 0.65, fertility: -0.1, retention: 0.72, outreach: 0.8, endogamy: 0.45, eduGap: -0.3, wealthRatio: 0.95, youth: 0,
    source: 'Pew 2014 "Religion in Latin America" (Pentecostal growth by conversion); Pew 2006 "Spirit and Power".',
  }),
  P({
    id: 'catholic_latam', name: 'Catholics', tradition: 'Christianity', context: 'Latin America',
    religiosity: 0.6, strictness: 0.4, fertility: 0.05, retention: 0.6, outreach: 0.2, endogamy: 0.35, eduGap: 0, wealthRatio: 1, youth: -0.03,
    source: 'Pew 2014 "Religion in Latin America": 84% raised Catholic, 69% still Catholic.',
  }),
  P({
    id: 'christian_africa', name: 'Christians', tradition: 'Christianity', context: 'Sub-Saharan Africa',
    religiosity: 0.88, strictness: 0.6, fertility: -0.3, retention: 0.88, outreach: 0.65, endogamy: 0.6, eduGap: 2, wealthRatio: 1.15, youth: -0.04,
    source: 'Pew 2010 "Tolerance and Tension: Islam and Christianity in Sub-Saharan Africa"; Pew 2016 "Religion and Education".',
  }),
  P({
    id: 'christian_orthodox', name: 'Orthodox Christians', tradition: 'Christianity', context: 'Eastern Europe',
    religiosity: 0.35, strictness: 0.4, fertility: 0, retention: 0.75, outreach: 0.08, endogamy: 0.5, eduGap: 0, wealthRatio: 1, youth: -0.1,
    source: 'Pew 2017 "Religious Belief and National Belonging in Central and Eastern Europe".',
  }),
  P({
    id: 'christian_mena', name: 'Christians', tradition: 'Christianity', context: 'Middle East (Coptic, Maronite, Orthodox)',
    religiosity: 0.75, strictness: 0.5, fertility: -0.2, retention: 0.88, outreach: 0.06, endogamy: 0.9, eduGap: 1, wealthRatio: 1.15, youth: -0.08,
    source: 'Pew 2015 "The Future of World Religions" (MENA Christians: older, lower fertility, emigration).',
  }),
  P({
    id: 'christian_south_asia', name: 'Christians', tradition: 'Christianity', context: 'South Asia',
    religiosity: 0.8, strictness: 0.5, fertility: -0.15, retention: 0.9, outreach: 0.4, endogamy: 0.85, eduGap: 1, wealthRatio: 1.05, youth: -0.03,
    source: 'Pew 2021 "Religious Composition of India" (Christians: TFR 1.88, slightly older than average).',
  }),
  P({
    id: 'protestant_1920', name: 'Protestants', tradition: 'Christianity', context: 'Europe, early 20th century',
    religiosity: 0.55, strictness: 0.45, fertility: -0.1, retention: 0.8, outreach: 0.2, endogamy: 0.6, eduGap: 0.4, wealthRatio: 1.05, youth: -0.02,
    source: 'Historical demography of interwar Germany and the Netherlands (Protestants: earlier fertility decline).',
  }),
  P({
    id: 'catholic_1920', name: 'Catholics', tradition: 'Christianity', context: 'Europe, early 20th century',
    religiosity: 0.68, strictness: 0.5, fertility: 0.3, retention: 0.85, outreach: 0.2, endogamy: 0.7, eduGap: -0.4, wealthRatio: 0.95, youth: 0.03,
    source: 'Historical demography of interwar Europe (Catholic regions kept higher fertility longer).',
  }),
  P({
    id: 'christian_premodern', name: 'Christians', tradition: 'Christianity', context: 'Pre-modern Europe',
    religiosity: 0.85, strictness: 0.6, fertility: 0, retention: 0.95, outreach: 0.25, endogamy: 0.85, eduGap: 0, wealthRatio: 1.05, youth: 0,
    source: 'General historical consensus; near-universal practice before secularization.',
  }),
  // ------------------------------------------------------------------ Islam
  P({
    id: 'muslim_mena', name: 'Muslims', tradition: 'Islam', context: 'Middle East & North Africa',
    religiosity: 0.85, strictness: 0.55, fertility: 0.15, retention: 0.94, outreach: 0.35, endogamy: 0.88, eduGap: 0, wealthRatio: 1, youth: 0.03,
    source: 'Pew 2012/2013 "The World\'s Muslims"; Pew 2015 "The Future of World Religions" (median age 23 worldwide).',
  }),
  P({
    id: 'muslim_south_asia', name: 'Muslims', tradition: 'Islam', context: 'South Asia',
    religiosity: 0.88, strictness: 0.55, fertility: 0.3, retention: 0.96, outreach: 0.25, endogamy: 0.93, eduGap: -1, wealthRatio: 0.85, youth: 0.08,
    source: 'Pew 2021 "Religion in India" & "Religious Composition of India"; NFHS-5 (2019–21): TFR 2.36 vs 1.94 for Hindus.',
  }),
  P({
    id: 'muslim_sea', name: 'Muslims', tradition: 'Islam', context: 'Southeast Asia',
    religiosity: 0.9, strictness: 0.45, fertility: 0.05, retention: 0.95, outreach: 0.3, endogamy: 0.85, eduGap: 0, wealthRatio: 1, youth: 0.02,
    source: 'Pew 2013 "The World\'s Muslims" (Indonesia, Malaysia: religion very important for 90%+).',
  }),
  P({
    id: 'muslim_europe', name: 'Muslims', tradition: 'Islam', context: 'Europe (mostly immigrant families)',
    religiosity: 0.62, strictness: 0.45, fertility: 0.35, retention: 0.85, outreach: 0.2, endogamy: 0.8, eduGap: -1.5, wealthRatio: 0.6, youth: 0.38,
    source: 'Pew 2017 "Europe\'s Growing Muslim Population": median age 30.4 vs 43.8; TFR 2.6 vs 1.6; 4.9% of Europe in 2016.',
  }),
  P({
    id: 'muslim_us', name: 'Muslims', tradition: 'Islam', context: 'United States',
    religiosity: 0.65, strictness: 0.45, fertility: 0.2, retention: 0.77, outreach: 0.3, endogamy: 0.7, eduGap: 0.3, wealthRatio: 0.9, youth: 0.3,
    source: 'Pew 2017 "U.S. Muslims Concerned About Their Place in Society" (77% raised Muslim still Muslim; younger than average).',
  }),
  P({
    id: 'muslim_west_africa', name: 'Muslims', tradition: 'Islam', context: 'West Africa',
    religiosity: 0.9, strictness: 0.6, fertility: 0.6, retention: 0.95, outreach: 0.35, endogamy: 0.85, eduGap: -3, wealthRatio: 0.7, youth: 0.12,
    source: 'Pew 2010 "Tolerance and Tension"; Nigeria DHS 2018 (northern, mostly Muslim states: lower schooling, higher fertility).',
  }),
  // ------------------------------------------------------------------ Hinduism, Sikhism
  P({
    id: 'hindu_india', name: 'Hindus', tradition: 'Hinduism', context: 'India',
    religiosity: 0.78, strictness: 0.45, fertility: 0, retention: 0.98, outreach: 0.05, endogamy: 0.95, eduGap: 0.15, wealthRatio: 1.03, youth: -0.01,
    source: 'Pew 2021 "Religion in India" (99% of those raised Hindu remain Hindu; interfaith marriage rare); NFHS-5.',
  }),
  P({
    id: 'hindu_diaspora', name: 'Hindus', tradition: 'Hinduism', context: 'Diaspora (US, UK)',
    religiosity: 0.55, strictness: 0.35, fertility: -0.2, retention: 0.85, outreach: 0.05, endogamy: 0.8, eduGap: 2.5, wealthRatio: 1.6, youth: 0.05,
    source: 'Pew 2016 "Religion and Education Around the World"; Pew 2024 "Religion Among Asian Americans".',
  }),
  P({
    id: 'sikh', name: 'Sikhs', tradition: 'Sikhism', context: 'India & diaspora',
    religiosity: 0.8, strictness: 0.5, fertility: -0.3, retention: 0.92, outreach: 0.05, endogamy: 0.9, eduGap: 1, wealthRatio: 1.3, youth: -0.05,
    source: 'Pew 2021 "Religious Composition of India" (Sikhs: lowest fertility of India\'s major groups, 1.6).',
  }),
  // ------------------------------------------------------------------ Buddhism
  P({
    id: 'buddhist_eastasia', name: 'Buddhists', tradition: 'Buddhism', context: 'East Asia',
    religiosity: 0.3, strictness: 0.2, fertility: -0.3, retention: 0.6, outreach: 0.1, endogamy: 0.3, eduGap: 0, wealthRatio: 1, youth: -0.15,
    source: 'Pew 2015 "The Future of World Religions" (Buddhists: TFR 1.6, median age 34; projected to shrink).',
  }),
  P({
    id: 'buddhist_sea', name: 'Buddhists', tradition: 'Buddhism', context: 'Southeast & South Asia',
    religiosity: 0.85, strictness: 0.4, fertility: -0.1, retention: 0.93, outreach: 0.12, endogamy: 0.7, eduGap: 0, wealthRatio: 1, youth: -0.03,
    source: 'Pew 2015 (Thailand, Myanmar, Sri Lanka: religion very important for ~90%).',
  }),
  // ------------------------------------------------------------------ Judaism
  P({
    id: 'jewish_diaspora', name: 'Jews', tradition: 'Judaism', context: 'Diaspora (US, Europe)',
    religiosity: 0.3, strictness: 0.25, fertility: -0.05, retention: 0.72, outreach: 0.02, endogamy: 0.35, eduGap: 2.5, wealthRatio: 1.7, youth: -0.15,
    source: 'Pew 2021 "Jewish Americans in 2020" (high intermarriage among recent marriages, highest schooling).',
  }),
  P({
    id: 'jewish_israel', name: 'Jews', tradition: 'Judaism', context: 'Israel',
    religiosity: 0.45, strictness: 0.4, fertility: 0.55, retention: 0.9, outreach: 0.02, endogamy: 0.96, eduGap: 0.8, wealthRatio: 1.2, youth: 0.05,
    source: 'Pew 2016 "Israel\'s Religiously Divided Society"; Israel CBS (TFR ≈ 3).',
  }),
  P({
    id: 'jewish_orthodox', name: 'Orthodox Jews', tradition: 'Judaism', context: 'Haredi / ultra-Orthodox',
    religiosity: 0.96, strictness: 0.85, fertility: 2.4, retention: 0.88, outreach: 0, endogamy: 0.99, eduGap: -1, wealthRatio: 0.65, youth: 0.4,
    source: 'Israel CBS & Pew 2016 (Haredi TFR ≈ 6.5; median age ~16).',
  }),
  P({
    id: 'jewish_premodern', name: 'Jews', tradition: 'Judaism', context: 'Europe, 19th–early 20th century',
    religiosity: 0.7, strictness: 0.6, fertility: 0, retention: 0.85, outreach: 0.02, endogamy: 0.92, eduGap: 2, wealthRatio: 1.3, youth: -0.02,
    source: 'Historical demography of European Jewry (high literacy and urbanization, early fertility decline).',
  }),
  // ------------------------------------------------------------------ Folk and none
  P({
    id: 'folk_african', name: 'Traditional religions', tradition: 'Folk religion', context: 'Africa',
    religiosity: 0.75, strictness: 0.4, fertility: 0.25, retention: 0.45, outreach: 0.05, endogamy: 0.5, eduGap: -2, wealthRatio: 0.6, youth: 0.03,
    source: 'Pew 2010 "Tolerance and Tension" (steady conversion to Christianity and Islam).',
  }),
  P({
    id: 'folk_chinese', name: 'Folk religions', tradition: 'Folk religion', context: 'East Asia',
    religiosity: 0.4, strictness: 0.2, fertility: -0.2, retention: 0.6, outreach: 0.05, endogamy: 0.3, eduGap: -0.5, wealthRatio: 0.9, youth: -0.1,
    source: 'Pew 2015 "The Future of World Religions".',
  }),
  P({
    id: 'none_west', name: 'Non-religious', tradition: 'No religion', context: 'Europe & the Americas',
    religiosity: 0.04, strictness: 0.15, fertility: -0.05, retention: 0.6, outreach: 0.35, endogamy: 0.15, eduGap: 0.5, wealthRatio: 1.05, youth: 0.08, secular: true, tolerance: 0.62,
    source: 'Pew 2015 (unaffiliated: TFR 1.7, median age 34; gain the most from switching in the West).',
  }),
  P({
    id: 'none_eastasia', name: 'Non-religious', tradition: 'No religion', context: 'East Asia',
    religiosity: 0.06, strictness: 0.15, fertility: -0.3, retention: 0.8, outreach: 0.15, endogamy: 0.2, eduGap: 0.3, wealthRatio: 1.05, youth: -0.05, secular: true,
    source: 'Pew 2015 (most of the world\'s unaffiliated live in China; low fertility).',
  }),
];

export const FAITH_PROFILE_BY_ID: Record<string, FaithProfile> = Object.fromEntries(FAITH_PROFILES.map((p) => [p.id, p]));

/** Fields a group takes from a profile (everything except the share). */
export function profileFields(id: string) {
  const p = FAITH_PROFILE_BY_ID[id];
  if (!p) return null;
  return {
    profile: p.id, name: p.name, color: p.color, religiosity: p.religiosity, strictness: p.strictness, tolerance: p.tolerance,
    fertility: p.fertility, retention: p.retention, outreach: p.outreach, endogamy: p.endogamy, eduGap: p.eduGap,
    wealthRatio: p.wealthRatio, youth: p.youth, secular: !!p.secular, note: p.source,
  };
}
