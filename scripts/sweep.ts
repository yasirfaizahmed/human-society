// Robustness sweep: run every preset with several seeds and report the range of key indicators,
// flagging NaNs. Useful after changing the model.
// Usage: npx tsx scripts/sweep.ts [presetId] [people=8000] [years=50] [seeds=2]

import { Simulation } from '../src/sim/engine';
import { PRESETS, presetScenario } from '../src/sim/presets';

const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2] : '';
const people = Number(process.argv[3] ?? 8000);
const years = Number(process.argv[4] ?? 50);
const seeds = Number(process.argv[5] ?? 2);
const keys = ['gdppc', 'unemployment', 'gini', 'wealthGini', 'lifeExp', 'tfr', 'happy', 'griev', 'relig', 'extrem', 'protest', 'crime', 'homicide', 'suicide', 'democracy'];
const fmt = (v: number) => (!isFinite(v) ? 'NaN' : Math.abs(v) >= 100 ? Math.round(v).toString() : v.toFixed(2));

for (const p of PRESETS) {
  if (only && p.id !== only) continue;
  for (let seed = 1; seed <= seeds; seed++) {
    const sc = presetScenario(p.id);
    sc.population.size = people;
    sc.society.seed = seed;
    const sim = new Simulation(sc);
    const mn: Record<string, number> = {}, mx: Record<string, number> = {};
    const nans = new Set<string>();
    for (let y = 0; y < years; y++) {
      for (let m = 0; m < 12; m++) sim.tick();
      for (const k of keys) {
        const v = sim.latest[k];
        if (!isFinite(v) && y > 1) nans.add(k);
        if (y < 2) continue;
        mn[k] = Math.min(mn[k] ?? Infinity, v);
        mx[k] = Math.max(mx[k] ?? -Infinity, v);
      }
    }
    console.log(`\n${p.id} #${seed}: ${sc.society.startYear}→${sim.year}, population ${people} → ${Math.round(sim.latest.pop)}, ends as "${sim.S.regimeLabel}"`);
    console.log('  ' + keys.map((k) => `${k} ${fmt(mn[k])}…${fmt(mx[k])}`).join(' | '));
    if (nans.size) console.log('  NaN in: ' + [...nans].join(', '));
    const big = sim.news.filter((n) => n.level >= 2 && !n.text.startsWith('Election')).map((n) => `${sc.society.startYear + Math.floor(n.t / 12)} ${n.text}`);
    console.log('  ' + big.slice(0, 10).join('\n  '));
  }
}
