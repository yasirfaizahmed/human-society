// Calibrate the "fitted" settings of each real country so the simulation reproduces what is observed:
// children per woman, life expectancy, adult schooling, growth per person and net migration.
// Usage: npx tsx scripts/fit-countries.ts [countryId|all] [people=20000] [iterations=8]
// Writes src/sim/countryFit.ts (all countries) or prints the result (one country).

import { writeFileSync } from 'node:fs';
import { countryScenario, realCountries } from '../src/sim/countries';
import type { CountryFit } from '../src/sim/countryFit';
import { COUNTRY_FIT } from '../src/sim/countryFit';
import { Simulation, expectedHealth } from '../src/sim/engine';

const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2] : '';
const people = Number(process.argv[3] ?? 20000);
const iterations = Number(process.argv[4] ?? 8);
const YEARS = 5;
/** Years run before measuring, so start-up adjustments do not bias the fit. */
const BURN_IN = 1;
const SEEDS = [11, 23, 37];

interface Measured { tfr: number; lifeExp: number; meanSchooling: number; gdpGrowthPerPerson: number; netMigration: number; medianAge: number; healthRatio: number }

function measure(id: string, fit: CountryFit): Measured {
  const acc = { tfr: 0, lifeExp: 0, meanSchooling: 0, gdpGrowthPerPerson: 0, netMigration: 0, medianAge: 0, healthRatio: 0 };
  for (const seed of SEEDS) {
    COUNTRY_FIT[id] = fit;
    const { scenario } = countryScenario(id, people);
    scenario.society.seed = seed;
    scenario.society.randomEvents = false;
    const sim = new Simulation(scenario);
    acc.meanSchooling += sim.latest.edu / SEEDS.length;
    acc.medianAge += sim.latest.medianAge / SEEDS.length;
    for (let m = 0; m < 12 * BURN_IN; m++) sim.tick();
    const g0 = sim.latest.gdppc;
    let tfr = 0, le = 0, net = 0;
    for (let y = 0; y < YEARS; y++) {
      for (let m = 0; m < 12; m++) sim.tick();
      tfr += sim.latest.tfr / YEARS;
      le += sim.latest.lifeExp / YEARS;
      let inn = 0, out = 0;
      for (let f = 0; f < sim.K; f++) { inn += sim.flowsLast[f * 6 + 4]; out += sim.flowsLast[f * 6 + 5]; }
      net += ((inn - out) / Math.max(1, sim.A.live)) * 1000 / YEARS;
    }
    acc.tfr += tfr / SEEDS.length;
    acc.lifeExp += le / SEEDS.length;
    acc.netMigration += net / SEEDS.length;
    acc.gdpGrowthPerPerson += ((Math.pow(sim.latest.gdppc / g0, 1 / YEARS) - 1) * 100) / SEEDS.length;
    // adults' health relative to the age norm, which the simulated conditions sustain
    const A = sim.A;
    let hr = 0, n = 0;
    for (let i = 0; i < A.n; i++) {
      if (!A.alive[i]) continue;
      const age = (sim.t - A.birth[i]) / 12;
      if (age >= 18 && age < 70) { hr += A.health[i] / expectedHealth(age); n++; }
    }
    acc.healthRatio += hr / Math.max(1, n) / SEEDS.length;
  }
  return acc;
}

/** Adults' health relative to the age norm right at the start, for the current settings. */
function startRatio(id: string, fit: CountryFit): number {
  COUNTRY_FIT[id] = fit;
  const { scenario } = countryScenario(id, Math.min(people, 6000));
  const sim = new Simulation({ ...scenario, society: { ...scenario.society, randomEvents: false } });
  const A = sim.A;
  let hr = 0, n = 0;
  for (let i = 0; i < A.n; i++) {
    const age = (sim.t - A.birth[i]) / 12;
    if (A.alive[i] && age >= 18 && age < 70) { hr += A.health[i] / expectedHealth(age); n++; }
  }
  return hr / Math.max(1, n);
}

function fitCountry(id: string): CountryFit {
  const { targets, country } = countryScenario(id, people);
  const fit: CountryFit = COUNTRY_FIT[id] ? { ...COUNTRY_FIT[id], achieved: null } : {
    fertilityNorm: 0, healthSpend: 0.5, education: country.meanSchooling + 2, growthMomentum: targets.gdpGrowthPerPerson - 1,
    immigration: targets.netMigration > 0 ? 0.3 : 0.03, emigrationScale: 1, startHealth: 0.75, achieved: null,
  };
  // schooling only depends on the starting population: fit it first, without running time
  for (let k = 0; k < 6; k++) {
    COUNTRY_FIT[id] = fit;
    const { scenario } = countryScenario(id, Math.min(people, 6000));
    const sim = new Simulation({ ...scenario, society: { ...scenario.society, randomEvents: false } });
    fit.education = Math.max(1, Math.min(20, fit.education + 1.1 * (targets.meanSchooling - sim.latest.edu)));
  }
  let m = measure(id, fit);
  for (let it = 0; it < iterations; it++) {
    // fertility: the family-size norm first; if that alone would need an implausible shift (beyond
    // −2 … +1.5 children), the rest comes from birth-control use differing from what income predicts
    const want = fit.fertilityNorm + 0.9 * (targets.tfr - m.tfr);
    fit.fertilityNorm = Math.max(-2, Math.min(1.5, want));
    const excess = want - fit.fertilityNorm;
    if (excess !== 0 || fit.contraceptionShift) fit.contraceptionShift = Math.max(-0.6, Math.min(0.4, (fit.contraceptionShift ?? 0) - 0.25 * excess));
    // life expectancy: health investment, and below zero investment a disease burden (one scale)
    const z = fit.healthSpend - (fit.diseaseBurden ?? 0) / 0.35 + (targets.lifeExp - m.lifeExp) / 12;
    fit.healthSpend = Math.max(0, Math.min(1, z));
    fit.diseaseBurden = z < 0 ? Math.min(0.5, -z * 0.35) : 0;
    fit.growthMomentum = Math.max(-6, Math.min(14, fit.growthMomentum + (targets.gdpGrowthPerPerson - m.gdpGrowthPerPerson) / 0.8));
    // start people at the health their conditions sustain (health/age-norm 1 ↔ setting 0.75)
    fit.startHealth = Math.max(0.2, Math.min(1, fit.startHealth * Math.pow(m.healthRatio / startRatio(id, fit), 0.8)));
    if (targets.netMigration > 0) {
      fit.emigrationScale = 1;
      fit.immigration = Math.max(0, Math.min(1, fit.immigration + 0.05 * (targets.netMigration - m.netMigration)));
    } else {
      fit.immigration = 0.03;
      fit.emigrationScale = Math.max(0.01, Math.min(6, fit.emigrationScale * Math.exp(0.35 * (m.netMigration - targets.netMigration))));
    }
    m = measure(id, fit);
    const r = (v: number) => v.toFixed(2);
    console.error(`${id} #${it + 1} [norm ${fit.fertilityNorm.toFixed(2)} contra ${(fit.contraceptionShift ?? 0).toFixed(2)} health ${fit.healthSpend.toFixed(2)} disease ${(fit.diseaseBurden ?? 0).toFixed(2)}]: TFR ${r(m.tfr)}/${r(targets.tfr)} · life ${r(m.lifeExp)}/${r(targets.lifeExp)} · growth ${r(m.gdpGrowthPerPerson)}/${r(targets.gdpGrowthPerPerson)} · migration ${r(m.netMigration)}/${r(targets.netMigration)} · school ${r(m.meanSchooling)}/${r(targets.meanSchooling)}`);
  }
  const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
  return {
    fertilityNorm: round(fit.fertilityNorm), healthSpend: round(fit.healthSpend), education: round(fit.education, 2), growthMomentum: round(fit.growthMomentum),
    immigration: round(fit.immigration), emigrationScale: round(fit.emigrationScale), startHealth: round(fit.startHealth),
    ...(fit.contraceptionShift ? { contraceptionShift: round(fit.contraceptionShift) } : {}), ...(fit.diseaseBurden ? { diseaseBurden: round(fit.diseaseBurden) } : {}),
    achieved: { tfr: round(m.tfr, 2), lifeExp: round(m.lifeExp, 1), meanSchooling: round(m.meanSchooling, 1), gdpGrowthPerPerson: round(m.gdpGrowthPerPerson, 2), netMigration: round(m.netMigration, 2), medianAge: round(m.medianAge, 1) },
  };
}

const ids = realCountries().map((c) => c.id).filter((id) => !only || id === only);
const results: Record<string, CountryFit> = { ...COUNTRY_FIT };
for (const id of ids) results[id] = fitCountry(id);
if (only) {
  console.log(JSON.stringify({ [only]: results[only] }));
} else {
  const body = Object.entries(results).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n');
  const src = `// Calibrated settings for real countries. Generated by \`npm run fit-countries\`; do not edit by hand.

export interface CountryFit {
  fertilityNorm: number;
  healthSpend: number;
  education: number;
  growthMomentum: number;
  immigration: number;
  emigrationScale: number;
  startHealth: number;
  contraceptionShift?: number;
  diseaseBurden?: number;
  /** What the calibrated simulation produced in its first years, for comparison with the targets. */
  achieved: { tfr: number; lifeExp: number; meanSchooling: number; gdpGrowthPerPerson: number; netMigration: number; medianAge: number } | null;
}

export const COUNTRY_FIT: Record<string, CountryFit> = {
${body}
};
`;
  writeFileSync(new URL('../src/sim/countryFit.ts', import.meta.url), src);
  console.log('Wrote src/sim/countryFit.ts for', ids.length, 'countries');
}
