// The simulation runs here, off the UI thread. The same script also runs Monte Carlo forecasts
// when started with a 'runForecast' message (the UI spawns a second copy for that).

import { Simulation } from '../sim/engine';
import { MAX_FAITHS, WORLD_H, WORLD_W } from '../sim/constants';
import { TEMPLATE_BY_ID, type EventSpec } from '../sim/events';
import { runForecast } from '../sim/forecast';
import { SERIES } from '../sim/stats';
import type { FrameState, FromWorker, ToWorker } from './protocol';

const ctx = self as unknown as {
  postMessage(msg: FromWorker, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
};

let sim: Simulation | null = null;
let running = false;
let speed = 6; // months per second; >= 1000 means "as fast as possible"
let lens = 'faith';
let selected = -1;
let selectedUid = -1;
let awaitingAck = false;
let dirty = true;
let lastLoop = 0;
let budget = 0;
let lastFrameAt = 0;
let lastYearSent = -1;
let personCounter = 0;
let msPerTick = 0;
let ticksDone = 0;
let ticksWindowStart = 0;
let tps = 0;
const pendingRows: { t: number; values: Record<string, number> }[] = [];
let newsCursor = 0;
let loopScheduled = false;

const history: Record<string, number[]> = {};
const historyT: number[] = [];

function post(msg: FromWorker, transfer: Transferable[] = []) {
  ctx.postMessage(msg, transfer);
}

function rowFor(s: Simulation): Record<string, number> {
  const L = s.latest;
  const row: Record<string, number> = {};
  for (const d of SERIES) row[d.key] = L[d.key] ?? NaN;
  for (let f = 0; f < s.K; f++) row['faith' + f] = s.faithShareNow[f];
  for (let k = 0; k < s.S.parties.length; k++) row['party' + k] = s.S.parties[k].share;
  return row;
}

function record(s: Simulation) {
  const row = rowFor(s);
  historyT.push(s.t);
  for (const [k, v] of Object.entries(row)) {
    if (!history[k]) history[k] = new Array(historyT.length - 1).fill(NaN);
    history[k].push(v);
  }
  pendingRows.push({ t: s.t, values: row });
}

function findUid(uid: number): number {
  if (!sim) return -1;
  const A = sim.A;
  for (let i = 0; i < A.n; i++) if (A.alive[i] && A.uid[i] === uid) return i;
  return -1;
}

function frameState(s: Simulation): FrameState {
  const S = s.S;
  const acc = s.acc;
  const faithStats = [];
  for (let f = 0; f < s.K; f++) {
    const n = Math.max(1, acc.faithN[f]);
    faithStats.push({ relig: acc.faithRelig[f] / n, griev: acc.faithGriev[f] / n, toler: acc.faithToler[f] / n, wealth: acc.faithWealth[f] / n, extremists: acc.faithExtrem[f] * s.popScale });
  }
  return {
    t: s.t, year: s.year, month: s.month, n: s.A.n, live: s.A.live, popScale: s.popScale, latest: { ...s.latest },
    S: {
      democracy: S.democracy, ruleOfLaw: S.ruleOfLaw, pressFreedom: S.pressFreedom, repression: S.repression, securityLoyalty: S.securityLoyalty,
      marketFreedom: S.marketFreedom, taxRate: S.taxRate, progressivity: S.progressivity, welfare: S.welfare, eduAccess: S.eduAccess,
      healthSpend: S.healthSpend, military: S.military, policing: S.policing, genderEquality: S.genderEquality, contraception: S.contraception,
      minorityBias: S.minorityBias, immigration: S.immigration, socialMedia: S.socialMedia, collectivism: S.collectivism, religiousPolicy: S.religiousPolicy,
      favoredFaith: S.favoredFaith, H: S.H, legitimacy: S.legitimacy, ruling: { ...S.ruling }, regimeLabel: S.regimeLabel, trends: { ...S.trends },
      politicsEndogenous: S.politicsEndogenous, parties: S.parties.map((p) => ({ ...p, pos: { ...p.pos } })), govParties: [...S.govParties],
      nextElection: S.nextElection, lastElection: S.lastElection, headLeader: S.headLeader, psi: S.psi, mmp: S.mmp, emp: S.emp, sfd: S.sfd,
      conflict: S.conflict, warActive: S.warActive, epiActive: S.epiActive, automation: S.automation, debtRatio: S.debtRatio,
      protestFrac: S.protestFrac, violentFrac: S.violentFrac,
    },
    faithShares: Array.from(s.faithShareNow.slice(0, s.K)),
    faithStats,
    events: s.events.map((e) => {
      const dur = Math.max(1, Math.round(e.spec.duration));
      const m = s.t - e.start;
      const tg = e.target;
      const parts: string[] = [];
      if (tg.faith !== undefined) parts.push(s.cfg.population.faiths[tg.faith]?.name ?? '');
      if (tg.settlement !== undefined && tg.settlement >= 0) parts.push(s.world.settlements[tg.settlement]?.name ?? '');
      if (tg.minAge !== undefined || tg.maxAge !== undefined) parts.push(`ages ${tg.minAge ?? 0}–${tg.maxAge ?? '∞'}`);
      if (tg.wealthClass !== undefined) parts.push(['poorest 40%', 'middle', 'richest 10%'][tg.wealthClass]);
      if (tg.urban) parts.push('cities');
      if (tg.rural) parts.push('countryside');
      return { uid: e.uid, id: e.spec.id, name: e.spec.name, category: e.spec.category, progress: m / dur, monthsLeft: dur - m, intensity: e.intensity, target: parts.join(', ') };
    }),
    leaders: s.leaders.filter((l) => l.alive).map((l) => ({ ...l, ideology: { ...l.ideology } })),
    occupations: Array.from(acc.occ),
    deathCauses: Array.from(s.deathCauses),
    settlementPop: Array.from(s.settlementPop, (v) => v * s.popScale),
    settlementProtest: Array.from(s.settlementProtest, (v) => v * s.popScale),
  };
}

function sendFrame() {
  if (!sim) return;
  const s = sim;
  const n = s.A.n;
  const positions = new Uint16Array(n * 2);
  const A = s.A;
  const kx = 65535 / WORLD_W, ky = 65535 / WORLD_H;
  for (let i = 0; i < n; i++) {
    positions[2 * i] = A.x[i] * kx;
    positions[2 * i + 1] = A.y[i] * ky;
  }
  const values = new Uint8Array(n);
  s.lensValues(lens, values);
  if (selected >= 0 && (selected >= A.n || A.uid[selected] !== selectedUid || !A.alive[selected])) {
    const found = findUid(selectedUid);
    if (found >= 0) selected = found;
  }
  let person = undefined;
  if (selected >= 0 && (personCounter++ % 3 === 0 || dirty)) person = s.person(selected);
  const news = s.news.slice(Math.min(newsCursor, s.news.length));
  newsCursor = s.news.length;
  let pyramid, compass;
  if (s.year !== lastYearSent) {
    lastYearSent = s.year;
    pyramid = { male: Array.from(s.pyramid.male, (v) => v * s.popScale), female: Array.from(s.pyramid.female, (v) => v * s.popScale) };
    compass = Array.from(s.compass);
  }
  const rows = pendingRows.splice(0, pendingRows.length);
  awaitingAck = true;
  dirty = false;
  lastFrameAt = performance.now();
  post(
    {
      type: 'frame', positions, values, state: frameState(s), historyRows: rows, news, pyramid, compass, person,
      perf: { msPerTick, ticksPerSecond: tps },
      timeline: s.cfg.timeline.map((e) => ({ ...e })),
    },
    [positions.buffer, values.buffer],
  );
}

function loop() {
  loopScheduled = false;
  if (!sim) return;
  const now = performance.now();
  if (running) {
    const dt = Math.min(250, now - lastLoop);
    budget += (dt * speed) / 1000;
    const start = performance.now();
    const maxMs = 70;
    let ran = 0;
    while ((speed >= 1000 || budget >= 1) && performance.now() - start < maxMs) {
      const a = performance.now();
      sim.tick();
      record(sim);
      const d = performance.now() - a;
      msPerTick = msPerTick ? msPerTick * 0.8 + d * 0.2 : d;
      budget -= 1;
      ran++;
      ticksDone++;
      if (speed < 1000 && budget < 1) break;
    }
    if (budget > 3) budget = 3; // don't accumulate a backlog when ticks are slow
    if (ran) dirty = true;
  }
  lastLoop = now;
  if (now - ticksWindowStart > 1000) {
    tps = (ticksDone * 1000) / (now - ticksWindowStart);
    ticksDone = 0;
    ticksWindowStart = now;
  }
  if (!awaitingAck && (dirty || now - lastFrameAt > 500)) sendFrame();
  schedule(running ? 0 : 40);
}

function schedule(ms: number) {
  if (loopScheduled) return;
  loopScheduled = true;
  setTimeout(loop, ms);
}

ctx.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'init': {
        running = false;
        sim = new Simulation(msg.scenario);
        for (const k of Object.keys(history)) delete history[k];
        historyT.length = 0;
        pendingRows.length = 0;
        newsCursor = 0;
        lastYearSent = -1;
        selected = -1;
        record(sim);
        pendingRows.length = 0;
        post({ type: 'ready', settlements: sim.world.settlements, nCities: sim.world.nCities, scenario: sim.cfg, history, historyT });
        newsCursor = 0;
        dirty = true;
        awaitingAck = false;
        lastLoop = performance.now();
        ticksWindowStart = lastLoop;
        schedule(0);
        break;
      }
      case 'run':
        running = msg.running;
        speed = msg.speed;
        budget = 0;
        lastLoop = performance.now();
        schedule(0);
        break;
      case 'step':
        if (sim) for (let k = 0; k < msg.months; k++) { sim.tick(); record(sim); }
        dirty = true;
        schedule(0);
        break;
      case 'lens':
        lens = msg.id;
        dirty = true;
        schedule(0);
        break;
      case 'select':
        selected = msg.slot;
        selectedUid = sim && msg.slot >= 0 ? sim.A.uid[msg.slot] : -1;
        dirty = true;
        schedule(0);
        break;
      case 'pick': {
        if (!sim) break;
        const slot = sim.nearest(msg.x, msg.y, msg.radius);
        selected = slot;
        selectedUid = slot >= 0 ? sim.A.uid[slot] : -1;
        post({ type: 'picked', slot });
        dirty = true;
        schedule(0);
        break;
      }
      case 'follow':
        sim?.follow(msg.slot, msg.on);
        dirty = true;
        schedule(0);
        break;
      case 'trigger': {
        if (!sim) break;
        const base = (msg.custom as EventSpec) ?? TEMPLATE_BY_ID[msg.templateId];
        if (!base) break;
        const spec: EventSpec = msg.leader ? { ...base, leader: msg.leader } : base;
        sim.triggerEvent(spec, msg.intensity, msg.target);
        dirty = true;
        schedule(0);
        break;
      }
      case 'schedule':
        if (sim) {
          sim.cfg.timeline = sim.cfg.timeline.filter((x) => x.uid !== msg.event.uid);
          sim.cfg.timeline.push({ ...msg.event, fired: false });
          sim.cfg.timeline.sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
        }
        dirty = true;
        schedule(0);
        break;
      case 'unschedule':
        if (sim) sim.cfg.timeline = sim.cfg.timeline.filter((x) => x.uid !== msg.uid);
        dirty = true;
        schedule(0);
        break;
      case 'policy':
        sim?.setPolicy(msg.key, msg.value);
        dirty = true;
        schedule(0);
        break;
      case 'randomEvents':
        if (sim) { sim.cfg.society.randomEvents = msg.on; sim.cfg.society.eventRate = msg.rate; }
        break;
      case 'forecast': {
        if (!sim) break;
        const snap = sim.exportSnapshot(msg.request.sample);
        const transfer: Transferable[] = [snap.friends.buffer as ArrayBuffer];
        for (const v of Object.values(snap.fields)) transfer.push(v.buffer as ArrayBuffer);
        post({ type: 'snapshot', snap, request: msg.request }, transfer);
        break;
      }
      case 'runForecast': {
        const result = runForecast(msg.snap, msg.request, (done, total) => post({ type: 'forecast-progress', done, total }));
        post({ type: 'forecast-result', result });
        break;
      }
      case 'ack':
        awaitingAck = false;
        schedule(0);
        break;
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err) });
  }
};

void MAX_FAITHS;
