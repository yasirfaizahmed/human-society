// Project which faith groups grow, with the reasons (births, deaths, switching, migration).
// Usage: npx tsx scripts/groups.ts <preset> [people=20000] [years=30] [seed=1] [immigration or -] [calm]
// ("calm" turns random events off, to see the underlying trends).
// Compare with published projections quoted in each preset's description.

import { Simulation } from '../src/sim/engine';
import { PRESETS, presetScenario } from '../src/sim/presets';
import { CAMPS } from '../src/sim/stats';

const presetId = process.argv[2] ?? 'modern';
const people = Number(process.argv[3] ?? 20000);
const years = Number(process.argv[4] ?? 30);
const seed = Number(process.argv[5] ?? 1);
if (!PRESETS.some((p) => p.id === presetId)) {
  console.error('Unknown preset. Available:', PRESETS.map((p) => p.id).join(', '));
  process.exit(1);
}
const sc = presetScenario(presetId);
sc.population.size = people;
sc.society.seed = seed;
if (process.argv[6] !== undefined && process.argv[6] !== '-') sc.society.immigration = Number(process.argv[6]);
if (process.argv[7] === 'calm') sc.society.randomEvents = false;
const sim = new Simulation(sc);
const names = sc.population.faiths.map((f) => f.name.slice(0, 14).padEnd(14));
const pct = (v: number) => (v * 100).toFixed(1).padStart(5);
console.log(`${sc.society.name}: ${people} people, ${years} years, immigration openness ${sc.society.immigration}`);
console.log('year  relig ' + names.join(' ') + '   | ' + CAMPS.map((c) => c.label.slice(0, 10).padEnd(10)).join(' '));
const row = () => console.log(`${sim.year} r${(sim.latest.relig ?? 0).toFixed(2)} ` + sc.population.faiths.map((_, f) => pct(sim.faithShareNow[f]).padEnd(14)).join(' ') + '   | ' + CAMPS.map((_, c) => pct(sim.latest['camp' + c] ?? 0).padEnd(10)).join(' '));
row();
for (let y = 1; y <= years; y++) {
  for (let m = 0; m < 12; m++) sim.tick();
  if (y % 5 === 0 || y === years) row();
}
console.log('\nPer group (last full year):  TFR | median age | schooling (25+) | wealth vs avg | per 1,000 members: births, deaths, converts in, converts out, immigrants, emigrants');
sc.population.faiths.forEach((fg, f) => {
  const members = Math.max(1, sim.faithShareNow[f] * sim.A.live);
  const fl = Array.from(sim.flowsLast.slice(f * 6, f * 6 + 6)).map((v) => ((v / members) * 1000).toFixed(1).padStart(5));
  console.log(`  ${names[f]} ${sim.faithTFR[f].toFixed(2).padStart(5)} | ${sim.faithMedianAge[f].toFixed(1).padStart(5)} | ${sim.faithEdu[f].toFixed(1).padStart(5)} | ${sim.faithWealthRel[f].toFixed(2).padStart(5)} | ${fl.join(' ')}`);
});
const L = sim.latest;

console.log(`\nWhole society: TFR ${L.tfr?.toFixed(2)}, life expectancy ${L.lifeExp?.toFixed(1)}, median age ${L.medianAge?.toFixed(1)}, births ${L.births?.toFixed(1)}‰, deaths ${L.deaths?.toFixed(1)}‰, married ${L.married?.toFixed(2)}, religiosity ${L.relig?.toFixed(2)}, social liberalism ${L.social?.toFixed(2)}, polarization ${L.polarization?.toFixed(2)}, GDP/person $${Math.round(L.gdppc ?? 0)}`);
