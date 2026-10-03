// Run a scenario without the UI and print yearly indicators.
// Usage: npx tsx scripts/headless.ts [preset] [population] [years] [seed]

import { Simulation } from '../src/sim/engine';
import { PRESETS, presetScenario } from '../src/sim/presets';

const presetId = process.argv[2] ?? 'modern';
const size = Number(process.argv[3] ?? 20000);
const years = Number(process.argv[4] ?? 40);
const seed = Number(process.argv[5] ?? 1);

if (!PRESETS.some((p) => p.id === presetId)) {
  console.error('Unknown preset. Available:', PRESETS.map((p) => p.id).join(', '));
  process.exit(1);
}
const sc = presetScenario(presetId);
sc.population.size = size;
sc.society.seed = seed;
const t0 = performance.now();
const sim = new Simulation(sc);
console.log(`init ${(performance.now() - t0).toFixed(0)} ms, ${sim.A.live} people, regime: ${sim.S.regimeLabel}`);
const cols = ['pop', 'gdppc', 'growth', 'unemployment', 'inflation', 'gini', 'wealthGini', 'lifeExp', 'tfr', 'births', 'deaths', 'urban', 'edu', 'happy', 'mental', 'griev', 'fear', 'relig', 'social', 'toler', 'extrem', 'itrust', 'protest', 'crime', 'homicide', 'suicide', 'democracy', 'psi', 'married', 'debtRatio'];
const fmt = (k: string, v: number) => {
  if (v === undefined || !isFinite(v)) return '-';
  if (k === 'pop' || k === 'gdppc') return Math.round(v).toString();
  if (['growth', 'unemployment', 'inflation', 'extrem', 'protest'].includes(k)) return (v * 100).toFixed(1);
  if (['births', 'deaths', 'crime', 'homicide', 'suicide', 'lifeExp', 'edu'].includes(k)) return v.toFixed(1);
  return v.toFixed(2);
};
console.log(['year', ...cols].join('\t'));
let tickTime = 0;
for (let y = 0; y < years; y++) {
  for (let m = 0; m < 12; m++) {
    const a = performance.now();
    sim.tick();
    tickTime += performance.now() - a;
  }
  const L = sim.latest;
  console.log([sim.year, ...cols.map((k) => fmt(k, L[k]))].join('\t'));
}
console.log(`avg tick ${(tickTime / (years * 12)).toFixed(1)} ms for ~${sim.A.live} people (${((tickTime / (years * 12)) / sim.A.live * 1e6).toFixed(0)} ns/person)`);
console.log('occupations', Array.from(sim.acc.occ).map((v) => Math.round(v)).join(' '));
console.log('faith shares', Array.from(sim.faithShareNow.slice(0, sim.K)).map((v) => v.toFixed(2)).join(' '));
console.log('parties', sim.S.parties.map((p) => `${p.name} ${(p.share * 100).toFixed(0)}%`).join(' | '));
console.log('regime', sim.S.regimeLabel, 'dem', sim.S.democracy.toFixed(2));
console.log('death causes', Array.from(sim.deathCauses).map((v) => Math.round(v)).join(' '));
console.log('--- news (last 40) ---');
for (const n of sim.news.slice(-40)) console.log(`${sc.society.startYear + Math.floor(n.t / 12)}: ${n.text}`);
