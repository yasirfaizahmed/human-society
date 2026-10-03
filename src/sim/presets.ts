// Starting points. Every preset is just a filled-in set of sliders; the user can change anything.
// They are deliberately generic (no real country) so outcomes come from mechanisms, not labels.

import { defaultScenario, FAITH_COLORS, type ScenarioConfig } from './config';
import type { ScheduledEvent } from './events';

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

export const PRESETS: Preset[] = [
  {
    id: 'modern',
    name: 'Modern democracy',
    era: '2025',
    description: 'A rich, ageing, mostly secular democracy with a religious minority, high social media use and moderate inequality.',
    apply: (s) => {
      const p = s.population, c = s.society;
      Object.assign(p, { ageStructure: 0.3, urbanShare: 0.8, cities: 7, education: 13.5, socialValues: 0.6, valueSpread: 0.55, economicValues: 0.5, authoritarianism: 0.38, patriotism: 0.5, materialism: 0.6, institutionalTrust: 0.45, socialTrust: 0.45, health: 0.8, wealthInequality: 0.72 });
      p.faiths = [
        { name: 'Faith A', color: FAITH_COLORS[0], share: 0.5, religiosity: 0.45, strictness: 0.35, tolerance: 0.65 },
        { name: 'Faith B', color: FAITH_COLORS[1], share: 0.08, religiosity: 0.72, strictness: 0.5, tolerance: 0.6 },
        { name: 'Non-religious', color: FAITH_COLORS[2], share: 0.42, religiosity: 0.05, strictness: 0.2, tolerance: 0.7, secular: true },
      ];
      Object.assign(c, { name: 'Modern Republic', startYear: 2025, gdpPerCapita: 48000, techGrowth: 1.2, democracy: 0.85, ruleOfLaw: 0.8, pressFreedom: 0.82, repression: 0.08, securityLoyalty: 0.8, marketFreedom: 0.7, taxRate: 0.33, progressivity: 0.55, welfare: 0.55, eduAccess: 0.92, healthSpend: 0.75, military: 0.3, policing: 0.55, genderEquality: 0.85, religiousPolicy: 'neutral', minorityBias: 0.15, immigration: 0.55, collectivism: 0.3, socialMedia: 0.85 });
      c.ruling = { social: 0.58, econ: 0.52, auth: 0.35, relig: 0.3, patriot: 0.5 };
      c.trends = { consumerism: 0.4, patriotism: 0, religiosity: 0, liberalism: 0.05, capitalism: 0.05, authority: 0, tolerance: 0 };
    },
  },
  {
    id: 'agrarian',
    name: 'Agrarian kingdom',
    era: '1800',
    description: 'A pre-industrial monarchy of devout peasants and landlords. Most people farm, few can read, many children die young. Growth is almost zero, so population presses against the land (the Malthusian trap).',
    apply: (s) => {
      const p = s.population, c = s.society;
      Object.assign(p, { ageStructure: 0.72, urbanShare: 0.12, cities: 4, education: 1.2, openness: 0.42, socialValues: 0.15, valueSpread: 0.35, economicValues: 0.5, authoritarianism: 0.72, patriotism: 0.6, materialism: 0.3, institutionalTrust: 0.55, socialTrust: 0.55, health: 0.6, wealthInequality: 0.85, aggression: 0.45 });
      p.faiths = [
        { name: 'Faith A', color: FAITH_COLORS[0], share: 0.86, religiosity: 0.85, strictness: 0.6, tolerance: 0.4 },
        { name: 'Faith B', color: FAITH_COLORS[1], share: 0.12, religiosity: 0.85, strictness: 0.6, tolerance: 0.4 },
        { name: 'Non-religious', color: FAITH_COLORS[2], share: 0.02, religiosity: 0.1, strictness: 0.3, tolerance: 0.5, secular: true },
      ];
      Object.assign(c, { name: 'Old Kingdom', startYear: 1800, gdpPerCapita: 1400, techGrowth: 0.15, democracy: 0.08, ruleOfLaw: 0.3, pressFreedom: 0.1, repression: 0.5, securityLoyalty: 0.75, marketFreedom: 0.4, taxRate: 0.1, progressivity: 0.05, welfare: 0.02, eduAccess: 0.12, healthSpend: 0.05, military: 0.5, policing: 0.3, genderEquality: 0.1, religiousPolicy: 'favor', favoredFaith: 0, minorityBias: 0.45, immigration: 0.05, collectivism: 0.85, socialMedia: 0, electionYears: 5 });
      c.ruling = { social: 0.2, econ: 0.6, auth: 0.8, relig: 0.75, patriot: 0.75 };
      c.trends = { consumerism: 0, patriotism: 0.1, religiosity: 0.1, liberalism: 0, capitalism: 0, authority: 0.1, tolerance: 0 };
    },
  },
  {
    id: 'industrializing',
    name: 'Industrializing nation',
    era: '1900',
    description: 'Factories are rising and peasants are moving to the cities. A limited democracy, little welfare, large families, sharp class divisions. The industrial revolution is underway.',
    apply: (s) => {
      const p = s.population, c = s.society;
      Object.assign(p, { ageStructure: 0.68, urbanShare: 0.35, cities: 6, education: 5, socialValues: 0.3, valueSpread: 0.5, economicValues: 0.5, authoritarianism: 0.6, patriotism: 0.7, materialism: 0.4, institutionalTrust: 0.45, socialTrust: 0.5, health: 0.65, wealthInequality: 0.85 });
      p.faiths = [
        { name: 'Faith A', color: FAITH_COLORS[0], share: 0.78, religiosity: 0.75, strictness: 0.5, tolerance: 0.45 },
        { name: 'Faith B', color: FAITH_COLORS[1], share: 0.15, religiosity: 0.78, strictness: 0.5, tolerance: 0.45 },
        { name: 'Non-religious', color: FAITH_COLORS[2], share: 0.07, religiosity: 0.06, strictness: 0.2, tolerance: 0.55, secular: true },
      ];
      Object.assign(c, { name: 'Iron Republic', startYear: 1900, gdpPerCapita: 4500, techGrowth: 1.4, democracy: 0.5, ruleOfLaw: 0.5, pressFreedom: 0.45, repression: 0.35, securityLoyalty: 0.75, marketFreedom: 0.75, taxRate: 0.08, progressivity: 0.1, welfare: 0.05, eduAccess: 0.45, healthSpend: 0.2, military: 0.55, policing: 0.4, genderEquality: 0.2, religiousPolicy: 'favor', favoredFaith: 0, minorityBias: 0.35, collectivism: 0.6, socialMedia: 0 });
      c.ruling = { social: 0.3, econ: 0.68, auth: 0.6, relig: 0.6, patriot: 0.75 };
      c.trends = { consumerism: 0.05, patriotism: 0.2, religiosity: 0, liberalism: 0, capitalism: 0.1, authority: 0, tolerance: 0 };
    },
  },
  {
    id: 'youngAutocracy',
    name: 'Young autocracy',
    era: '2010',
    description: 'A middle-income dictatorship with a huge young generation: educated but jobless, wired to social media, angry at corruption. Food prices are volatile. A classic setting for uprisings.',
    apply: (s) => {
      const p = s.population, c = s.society;
      Object.assign(p, { ageStructure: 0.88, urbanShare: 0.6, cities: 6, education: 10.5, socialValues: 0.32, valueSpread: 0.55, economicValues: 0.42, authoritarianism: 0.5, patriotism: 0.6, materialism: 0.5, institutionalTrust: 0.3, socialTrust: 0.45, health: 0.72, wealthInequality: 0.78 });
      p.faiths = [
        { name: 'Faith A', color: FAITH_COLORS[0], share: 0.84, religiosity: 0.72, strictness: 0.5, tolerance: 0.5 },
        { name: 'Faith B', color: FAITH_COLORS[1], share: 0.11, religiosity: 0.75, strictness: 0.5, tolerance: 0.5 },
        { name: 'Non-religious', color: FAITH_COLORS[2], share: 0.05, religiosity: 0.05, strictness: 0.2, tolerance: 0.6, secular: true },
      ];
      Object.assign(c, { name: 'Sun Republic', startYear: 2010, gdpPerCapita: 11000, techGrowth: 1.2, democracy: 0.14, ruleOfLaw: 0.32, pressFreedom: 0.18, repression: 0.6, securityLoyalty: 0.62, marketFreedom: 0.45, taxRate: 0.18, progressivity: 0.25, welfare: 0.25, eduAccess: 0.75, healthSpend: 0.4, military: 0.6, policing: 0.6, genderEquality: 0.35, religiousPolicy: 'neutral', minorityBias: 0.3, collectivism: 0.7, socialMedia: 0.45 });
      c.ruling = { social: 0.4, econ: 0.55, auth: 0.9, relig: 0.35, patriot: 0.85 };
      c.trends = { consumerism: 0.2, patriotism: 0.2, religiosity: 0, liberalism: 0, capitalism: 0, authority: 0.15, tolerance: 0 };
      s.timeline = [ev('foodPrices', 2011, 0, 1.3), ev('socialMediaEra', 2010, 6, 0.8)];
    },
  },
  {
    id: 'fragileDemocracy',
    name: 'Fragile democracy',
    era: '1920',
    description: 'A new democracy after a lost war: humiliated, polarized and indebted, with weak institutions and an army that never accepted the republic. Hyperinflation and a depression are scripted in. Will it survive?',
    apply: (s) => {
      const p = s.population, c = s.society;
      Object.assign(p, { ageStructure: 0.5, urbanShare: 0.55, cities: 7, education: 8, socialValues: 0.4, valueSpread: 0.9, economicValues: 0.45, authoritarianism: 0.58, patriotism: 0.72, materialism: 0.45, institutionalTrust: 0.3, socialTrust: 0.4, health: 0.7, wealthInequality: 0.75 });
      p.faiths = [
        { name: 'Faith A', color: FAITH_COLORS[0], share: 0.62, religiosity: 0.6, strictness: 0.45, tolerance: 0.5 },
        { name: 'Faith B', color: FAITH_COLORS[1], share: 0.32, religiosity: 0.65, strictness: 0.5, tolerance: 0.5 },
        { name: 'Faith C', color: FAITH_COLORS[3], share: 0.01, religiosity: 0.55, strictness: 0.4, tolerance: 0.6 },
        { name: 'Non-religious', color: FAITH_COLORS[2], share: 0.05, religiosity: 0.05, strictness: 0.2, tolerance: 0.55, secular: true },
      ];
      Object.assign(c, { name: 'Weary Republic', startYear: 1920, gdpPerCapita: 6500, techGrowth: 1.2, democracy: 0.6, ruleOfLaw: 0.5, pressFreedom: 0.65, repression: 0.25, securityLoyalty: 0.55, marketFreedom: 0.6, taxRate: 0.2, progressivity: 0.4, welfare: 0.2, eduAccess: 0.65, healthSpend: 0.3, military: 0.3, policing: 0.45, genderEquality: 0.35, religiousPolicy: 'neutral', minorityBias: 0.3, collectivism: 0.55, socialMedia: 0 });
      c.ruling = { social: 0.5, econ: 0.42, auth: 0.4, relig: 0.45, patriot: 0.55 };
      c.trends = { consumerism: 0.05, patriotism: 0.15, religiosity: 0, liberalism: 0, capitalism: 0, authority: 0.1, tolerance: -0.05 };
      s.timeline = [ev('hyperinflation', 1922, 6, 1), ev('massMedia', 1926, 0, 1), ev('depression', 1929, 9, 1.1)];
    },
  },
  {
    id: 'welfareState',
    name: 'Secular welfare state',
    era: '2025',
    description: 'High trust, high taxes, generous welfare, clean government and a mostly secular, egalitarian culture.',
    apply: (s) => {
      const p = s.population, c = s.society;
      Object.assign(p, { ageStructure: 0.32, urbanShare: 0.82, cities: 5, education: 14, socialValues: 0.75, valueSpread: 0.4, economicValues: 0.42, authoritarianism: 0.25, patriotism: 0.45, materialism: 0.45, institutionalTrust: 0.72, socialTrust: 0.72, health: 0.82, wealthInequality: 0.65, agreeableness: 0.55 });
      p.faiths = [
        { name: 'Faith A', color: FAITH_COLORS[0], share: 0.6, religiosity: 0.22, strictness: 0.2, tolerance: 0.8 },
        { name: 'Faith B', color: FAITH_COLORS[1], share: 0.06, religiosity: 0.7, strictness: 0.45, tolerance: 0.6 },
        { name: 'Non-religious', color: FAITH_COLORS[2], share: 0.34, religiosity: 0.04, strictness: 0.15, tolerance: 0.8, secular: true },
      ];
      Object.assign(c, { name: 'Northern Commonwealth', startYear: 2025, gdpPerCapita: 58000, techGrowth: 1.3, democracy: 0.95, ruleOfLaw: 0.95, pressFreedom: 0.95, repression: 0.03, securityLoyalty: 0.85, marketFreedom: 0.7, taxRate: 0.42, progressivity: 0.65, welfare: 0.85, eduAccess: 0.95, healthSpend: 0.85, military: 0.25, policing: 0.5, genderEquality: 0.95, religiousPolicy: 'neutral', minorityBias: 0.1, immigration: 0.5, collectivism: 0.35, socialMedia: 0.85 });
      c.ruling = { social: 0.72, econ: 0.42, auth: 0.25, relig: 0.2, patriot: 0.45 };
      c.trends = { consumerism: 0.2, patriotism: 0, religiosity: 0, liberalism: 0.05, capitalism: 0, authority: 0, tolerance: 0.1 };
    },
  },
  {
    id: 'devout',
    name: 'Devout traditional society',
    era: '2025',
    description: 'A lower-middle-income society where faith, family and community shape daily life. Large families, strong social approval, a semi-authoritarian state that favours the majority faith.',
    apply: (s) => {
      const p = s.population, c = s.society;
      Object.assign(p, { ageStructure: 0.72, urbanShare: 0.5, cities: 6, education: 8.5, socialValues: 0.2, valueSpread: 0.4, economicValues: 0.45, authoritarianism: 0.6, patriotism: 0.65, materialism: 0.35, institutionalTrust: 0.45, socialTrust: 0.55, health: 0.72, wealthInequality: 0.72, empathy: 0.55 });
      p.faiths = [
        { name: 'Faith A', color: FAITH_COLORS[0], share: 0.9, religiosity: 0.85, strictness: 0.5, tolerance: 0.5 },
        { name: 'Faith B', color: FAITH_COLORS[1], share: 0.08, religiosity: 0.8, strictness: 0.5, tolerance: 0.5 },
        { name: 'Non-religious', color: FAITH_COLORS[2], share: 0.02, religiosity: 0.05, strictness: 0.2, tolerance: 0.5, secular: true },
      ];
      Object.assign(c, { name: 'Valley of Faith', startYear: 2025, gdpPerCapita: 9000, techGrowth: 1.6, democracy: 0.4, ruleOfLaw: 0.45, pressFreedom: 0.35, repression: 0.4, securityLoyalty: 0.75, marketFreedom: 0.55, taxRate: 0.16, progressivity: 0.3, welfare: 0.2, eduAccess: 0.7, healthSpend: 0.4, military: 0.5, policing: 0.5, genderEquality: 0.3, religiousPolicy: 'favor', favoredFaith: 0, minorityBias: 0.3, collectivism: 0.85, socialMedia: 0.55 });
      c.ruling = { social: 0.22, econ: 0.5, auth: 0.7, relig: 0.85, patriot: 0.7 };
      c.trends = { consumerism: 0.15, patriotism: 0.1, religiosity: 0.15, liberalism: -0.1, capitalism: 0, authority: 0.05, tolerance: 0 };
    },
  },
  {
    id: 'divided',
    name: 'Divided society',
    era: '2025',
    description: 'Two large faith communities of similar size live side by side with low trust between them, a weak state and a history of grievances. A spark could lead to reconciliation or to sectarian conflict.',
    apply: (s) => {
      const p = s.population, c = s.society;
      Object.assign(p, { ageStructure: 0.62, urbanShare: 0.55, cities: 6, education: 9, socialValues: 0.35, valueSpread: 0.6, economicValues: 0.45, authoritarianism: 0.55, patriotism: 0.55, materialism: 0.45, tolerance: 0.75, institutionalTrust: 0.35, socialTrust: 0.35, health: 0.72, wealthInequality: 0.75 });
      p.faiths = [
        { name: 'Faith A', color: FAITH_COLORS[0], share: 0.52, religiosity: 0.7, strictness: 0.55, tolerance: 0.4 },
        { name: 'Faith B', color: FAITH_COLORS[1], share: 0.42, religiosity: 0.72, strictness: 0.55, tolerance: 0.4 },
        { name: 'Non-religious', color: FAITH_COLORS[2], share: 0.06, religiosity: 0.05, strictness: 0.2, tolerance: 0.6, secular: true },
      ];
      Object.assign(c, { name: 'Twin Rivers', startYear: 2025, gdpPerCapita: 9000, techGrowth: 1.2, democracy: 0.55, ruleOfLaw: 0.4, pressFreedom: 0.5, repression: 0.3, securityLoyalty: 0.6, marketFreedom: 0.55, taxRate: 0.18, progressivity: 0.3, welfare: 0.2, eduAccess: 0.7, healthSpend: 0.4, military: 0.45, policing: 0.45, genderEquality: 0.4, religiousPolicy: 'favor', favoredFaith: 0, minorityBias: 0.4, collectivism: 0.75, socialMedia: 0.6 });
      c.ruling = { social: 0.35, econ: 0.5, auth: 0.6, relig: 0.7, patriot: 0.65 };
      c.trends = { consumerism: 0.1, patriotism: 0.05, religiosity: 0.05, liberalism: 0, capitalism: 0, authority: 0, tolerance: -0.05 };
    },
  },
  {
    id: 'custom',
    name: 'Blank slate',
    era: 'any',
    description: 'Balanced middle-of-the-road settings. A neutral starting point for your own experiment.',
    apply: () => {},
  },
];

export function presetScenario(id: string): ScenarioConfig {
  const s = defaultScenario();
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[PRESETS.length - 1];
  p.apply(s);
  return s;
}
