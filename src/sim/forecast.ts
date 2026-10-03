// Monte Carlo forecasting: run many possible futures from the same present and summarize the
// spread. A single run is one possible history; the distribution over runs is the prediction.
// An optional intervention (any event, scripted at the start) gives a "what if" comparison.

import { Simulation, type Snapshot } from './engine';
import { TEMPLATE_BY_ID, type EventSpec, type Target } from './events';

export const FORECAST_KEYS = [
  'pop', 'gdppc', 'unemployment', 'gini', 'happy', 'lifeExp', 'tfr', 'relig', 'social', 'toler', 'extrem',
  'itrust', 'griev', 'protest', 'democracy', 'psi', 'crime', 'polarization', 'edu', 'urban',
] as const;

export interface ForecastRequest {
  years: number;
  runs: number;
  sample: number;
  randomEvents: boolean;
  intervention?: { templateId: string; custom?: Omit<EventSpec, 'likelihood'>; intensity: number; target?: Target } | null;
}

export interface BranchResult {
  label: string;
  years: number[];
  /** key → [year][p10, p50, p90] */
  bands: Record<string, number[][]>;
  outcomes: Record<string, number>;
  /** Most common headline events across runs. */
  topEvents: { text: string; share: number }[];
  finalFaith: number[][];
  regimes: Record<string, number>;
}

export interface ForecastResult {
  baseline: BranchResult;
  intervention: BranchResult | null;
  runs: number;
  years: number;
  sample: number;
  startYear: number;
  faithNames: string[];
}

function pctile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const x = (sorted.length - 1) * p;
  const lo = Math.floor(x), hi = Math.ceil(x);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo);
}

function runBranch(snap: Snapshot, req: ForecastRequest, withIntervention: boolean, label: string, onRun: () => void, seedBase: number): BranchResult {
  const yearsArr: number[] = [];
  const startYear = snap.cfg.society.startYear + Math.floor(snap.t / 12);
  for (let y = 0; y <= req.years; y++) yearsArr.push(startYear + y);
  const traj: Record<string, number[][]> = {};
  for (const k of FORECAST_KEYS) traj[k] = yearsArr.map(() => []);
  const counts: Record<string, number> = { revolution: 0, coup: 0, civilWar: 0, democracyEnd: 0, autocracyEnd: 0, war: 0, terror: 0, popDecline: 0, recession: 0 };
  const eventCounts = new Map<string, number>();
  const finalFaith: number[][] = [];
  const regimes: Record<string, number> = {};
  for (let r = 0; r < req.runs; r++) {
    const sim = Simulation.fromSnapshot(snap, (seedBase + r * 7919) | 0);
    sim.cfg.society.randomEvents = req.randomEvents;
    if (withIntervention && req.intervention) {
      const iv = req.intervention;
      const spec = (iv.custom as EventSpec) ?? TEMPLATE_BY_ID[iv.templateId];
      if (spec) sim.triggerEvent(spec, iv.intensity, iv.target);
    }
    const startDem = sim.S.democracy;
    const startPop = sim.latest.pop;
    const seen = new Set<string>();
    let newsIdx = sim.news.length;
    let hadTerror = false, hadRecession = false;
    for (let y = 0; y <= req.years; y++) {
      if (y > 0) for (let m = 0; m < 12; m++) sim.tick();
      for (const k of FORECAST_KEYS) traj[k][y].push(sim.latest[k] ?? NaN);
      for (; newsIdx < sim.news.length; newsIdx++) {
        const t = sim.news[newsIdx].text;
        if (t.startsWith('REVOLUTION')) seen.add('revolution');
        if (/Military coup/i.test(t)) seen.add('coup');
        if (/civil war/i.test(t)) seen.add('civilWar');
        if (/^War with|War with a neighbour/i.test(t)) seen.add('war');
        if (/^Attack in/.test(t)) hadTerror = true;
        if (/Recession|Great Depression|Financial crisis/i.test(t)) hadRecession = true;
        const key = t.replace(/\d[\d,.%]*/g, '#').replace(/ in [A-Z][a-z]+( \(capital\))?/g, '').replace(/^[A-Z][a-z]+ [A-Z][a-z]+, a /, 'A ').slice(0, 90);
        if (!/^Election|begins in|subsides|immigrants arrived/.test(t)) eventCounts.set(key, (eventCounts.get(key) ?? 0) + (seen.has('ev:' + key) ? 0 : 1));
        seen.add('ev:' + key);
      }
    }
    for (const k of ['revolution', 'coup', 'civilWar', 'war']) if (seen.has(k)) counts[k]++;
    if (hadTerror) counts.terror++;
    if (hadRecession) counts.recession++;
    if (sim.S.democracy >= 0.5) counts.democracyEnd++;
    if (sim.S.democracy < 0.3) counts.autocracyEnd++;
    if (sim.latest.pop < startPop) counts.popDecline++;
    finalFaith.push(Array.from(sim.faithShareNow.slice(0, sim.K)));
    regimes[sim.S.regimeLabel] = (regimes[sim.S.regimeLabel] ?? 0) + 1;
    void startDem;
    onRun();
  }
  const bands: Record<string, number[][]> = {};
  for (const k of FORECAST_KEYS) {
    bands[k] = traj[k].map((vals) => {
      const s = vals.filter((v) => isFinite(v)).sort((a, b) => a - b);
      return [pctile(s, 0.1), pctile(s, 0.5), pctile(s, 0.9)];
    });
  }
  const outcomes: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) outcomes[k] = v / req.runs;
  for (const k of Object.keys(regimes)) regimes[k] /= req.runs;
  const topEvents = [...eventCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([text, n]) => ({ text, share: n / req.runs }));
  return { label, years: yearsArr, bands, outcomes, topEvents, finalFaith, regimes };
}

export function runForecast(snap: Snapshot, req: ForecastRequest, progress: (done: number, total: number) => void): ForecastResult {
  const total = req.runs * (req.intervention ? 2 : 1);
  let done = 0;
  const tick = () => progress(++done, total);
  const seedBase = 1000 + snap.t * 31;
  const baseline = runBranch(snap, req, false, 'Baseline', tick, seedBase);
  // same seeds for both branches: differences come from the intervention, not luck
  const intervention = req.intervention ? runBranch(snap, req, true, 'With intervention', tick, seedBase) : null;
  return {
    baseline, intervention, runs: req.runs, years: req.years, sample: snap.count,
    startYear: snap.cfg.society.startYear + Math.floor(snap.t / 12), faithNames: snap.cfg.population.faiths.map((f) => f.name),
  };
}
