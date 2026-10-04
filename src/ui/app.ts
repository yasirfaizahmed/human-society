// The running simulation: map, indicators and the side panels.

import type { ScenarioConfig } from '../sim/config';
import { FAITH_PROFILE_BY_ID } from '../sim/faiths';
import { OCC_NAMES, DEATH_NAMES } from '../sim/constants';
import type { Leader, NewsItem, PersonInfo } from '../sim/engine';
import {
  CATEGORY_LABELS, EFFECTS, EFFECT_KEYS, LEADER_STYLES, TEMPLATES, TEMPLATE_BY_ID,
  type EffectGroup, type EffectKey, type EventCategory, type EventSpec, type LeaderStyle, type ScheduledEvent, type Shape, type Target,
} from '../sim/events';
import { FORECAST_KEYS, type ForecastRequest, type ForecastResult } from '../sim/forecast';
import { LENSES, LENS_BY_ID, LOVE_LABELS, OCC_COLORS, PROTEST_COLORS, DISEASE_COLORS, cssRamp, lensPalette } from '../sim/lens';
import { describeIdeology } from '../sim/politics';
import { CAMPS, SERIES, SERIES_BY_KEY, compact, fmtValue, type Fmt } from '../sim/stats';
import type { Settlement } from '../sim/world';
import type { FrameState, FromWorker, ToWorker } from '../worker/protocol';
import { FanChart, LineChart, drawCompass, drawPyramid, seriesColor, sparkline } from './charts';
import { clear, cssVar, h, meter, numberInput, select, setMeter, slider, toast, toggle } from './dom';
import { PopulationMap } from './map';
import { openSetup } from './setup';
import SimWorker from '../worker/sim.worker.ts?worker&inline';
import { createSimHost } from '../worker/host';

interface HostLike {
  postMessage(msg: ToWorker, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((e: MessageEvent<FromWorker>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

/** Runs the simulation on the main thread when Web Workers are unavailable (slower, but works). */
class InlineHost implements HostLike {
  onmessage: ((e: MessageEvent<FromWorker>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  private dead = false;
  private handle = createSimHost((msg) => {
    if (!this.dead) setTimeout(() => this.onmessage?.({ data: msg } as MessageEvent<FromWorker>), 0);
  });
  postMessage(msg: ToWorker) {
    setTimeout(() => { if (!this.dead) this.handle(msg); }, 0);
  }
  terminate() {
    this.handle({ type: 'run', running: false, speed: 1 });
    this.dead = true;
  }
}

function spawnHost(): HostLike {
  try {
    return new SimWorker() as unknown as HostLike;
  } catch {
    return new InlineHost();
  }
}

type Tab = 'groups' | 'overview' | 'charts' | 'events' | 'policy' | 'people' | 'forecast' | 'chronicle';
const TABS: { id: Tab; label: string }[] = [
  { id: 'groups', label: 'Groups' },
  { id: 'overview', label: 'Politics' },
  { id: 'charts', label: 'Trends' },
  { id: 'events', label: 'Events' },
  { id: 'policy', label: 'Policy' },
  { id: 'people', label: 'People' },
  { id: 'forecast', label: 'Forecast' },
  { id: 'chronicle', label: 'News' },
];

const SPEEDS = [
  { v: 1, label: '1 month/s' },
  { v: 3, label: '3 months/s' },
  { v: 6, label: '6 months/s' },
  { v: 12, label: '1 year/s' },
  { v: 36, label: '3 years/s' },
  { v: 1000, label: 'Max speed' },
];

const KPI_KEYS = ['pop', 'gdppc', 'unemployment', 'lifeExp', 'tfr', 'happy', 'griev', 'democracy', 'psi', 'extrem'] as const;

export class App {
  private root: HTMLElement;
  private worker!: HostLike;
  private ready = false;
  private partySig = '';
  private hello = false;
  private inline = false;
  private scenario!: ScenarioConfig;
  private settlements: Settlement[] = [];
  private map!: PopulationMap;
  private state: FrameState | null = null;
  private histT: number[] = [];
  private hist: Record<string, number[]> = {};
  private news: NewsItem[] = [];
  private pyramid: { male: number[]; female: number[] } | null = null;
  private compass: number[] | null = null;
  private person: PersonInfo | null = null;
  private selected = -1;
  private timeline: ScheduledEvent[] = [];
  private running = false;
  private speed = 6;
  private lens = 'faith';
  private tab: Tab = 'groups';
  private lastPanelUpdate = 0;
  private lastKpiUpdate = 0;
  private perf = { msPerTick: 0, ticksPerSecond: 0 };
  private forecastWorker: HostLike | null = null;
  private forecast: ForecastResult | null = null;
  private forecastProgress = '';
  private chartGroup = 'Population';
  private customSeries: string[] = ['happy', 'itrust', 'toler'];
  private newsFilter = 'all';
  private fcReq: ForecastRequest = { years: 25, runs: 10, sample: 12000, randomEvents: true, intervention: null };
  private fcIntervention = { id: '', intensity: 1, target: {} as Target };
  // dom refs
  private els: Record<string, HTMLElement> = {};
  private panelBody!: HTMLElement;
  private panelCache: Partial<Record<Tab, { el: HTMLElement; update: () => void }>> = {};

  constructor(root: HTMLElement) {
    this.root = root;
  }

  // ---------------------------------------------------------------- lifecycle
  start(scenario: ScenarioConfig) {
    this.scenario = scenario;
    this.histT = [];
    this.hist = {};
    this.news = [];
    this.person = null;
    this.selected = -1;
    this.forecast = null;
    this.panelCache = {};
    this.state = null;
    this.running = false;
    this.buildShell();
    this.worker?.terminate();
    this.ready = false;
    this.hello = false;
    this.launchHost(this.inline ? new InlineHost() : spawnHost());
    // if the worker cannot start (blocked by the page's security policy), fall back to the main thread
    setTimeout(() => {
      if (!this.hello && !this.ready && !this.inline) this.fallBackToInline();
    }, 3000);
  }

  private launchHost(host: HostLike) {
    this.worker = host;
    this.inline = host instanceof InlineHost;
    host.onmessage = (e: MessageEvent<FromWorker>) => this.onMessage(e.data);
    host.onerror = (e) => {
      if (!this.ready && !this.inline) this.fallBackToInline();
      else toast(`Simulation error: ${e.message}`);
    };
    this.send({ type: 'init', scenario: this.scenario });
    this.send({ type: 'lens', id: this.lens });
  }

  private fallBackToInline() {
    this.worker.terminate();
    toast('Background threads are unavailable here, so the simulation runs on the main thread (slower).');
    this.launchHost(new InlineHost());
  }

  private send(msg: ToWorker) {
    this.worker.postMessage(msg);
  }

  private onMessage(msg: FromWorker) {
    switch (msg.type) {
      case 'hello':
        this.hello = true;
        break;
      case 'ready':
        this.ready = true;
        this.settlements = msg.settlements;
        this.map.settlements = msg.settlements;
        this.map.nCities = msg.nCities;
        this.scenario = msg.scenario;
        this.histT = [...msg.historyT];
        this.hist = Object.fromEntries(Object.entries(msg.history).map(([k, v]) => [k, [...v]]));
        this.applyLensPalette();
        this.setRunning(true);
        break;
      case 'frame': {
        this.state = msg.state;
        this.perf = msg.perf;
        this.timeline = msg.timeline;
        for (const row of msg.historyRows) {
          this.histT.push(row.t);
          const len = this.histT.length;
          for (const [k, v] of Object.entries(row.values)) {
            let arr = this.hist[k];
            if (!arr) { arr = new Array(len - 1).fill(NaN); this.hist[k] = arr; }
            arr.push(v);
          }
        }
        if (msg.news.length) {
          this.news.push(...msg.news);
          if (this.news.length > 3000) this.news.splice(0, this.news.length - 3000);
          this.flashNews(msg.news);
        }
        if (msg.pyramid) this.pyramid = msg.pyramid;
        if (msg.compass) this.compass = msg.compass;
        if (msg.person !== undefined) {
          this.person = msg.person;
          if (msg.person && msg.person.alive) {
            const i = msg.person.slot;
            const pos = msg.positions;
            this.map.selected = i * 2 + 1 < pos.length ? { x: (pos[2 * i] / 65535) * 1600, y: (pos[2 * i + 1] / 65535) * 1000 } : null;
          } else this.map.selected = null;
        }
        this.map.settlementPop = msg.state.settlementPop;
        this.map.settlementProtest = msg.state.settlementProtest;
        this.map.setData(msg.positions, msg.values, msg.state.live);
        if (this.lens === 'vote') {
          const sig = msg.state.S.parties.map((p) => p.name + p.color).join('|');
          if (sig !== this.partySig) { this.partySig = sig; this.applyLensPalette(); }
        }
        this.send({ type: 'ack' });
        this.onFrame();
        break;
      }
      case 'picked':
        this.selected = msg.slot;
        if (msg.slot >= 0) { this.setTab('people'); }
        break;
      case 'snapshot': {
        this.forecastWorker?.terminate();
        this.forecastWorker = this.inline ? new InlineHost() : spawnHost();
        this.forecastWorker.onmessage = (e: MessageEvent<FromWorker>) => this.onMessage(e.data);
        const transfer: Transferable[] = [msg.snap.friends.buffer as ArrayBuffer, ...Object.values(msg.snap.fields).map((v) => v.buffer as ArrayBuffer)];
        this.forecastWorker.postMessage({ type: 'runForecast', snap: msg.snap, request: msg.request } satisfies ToWorker, transfer);
        this.forecastProgress = 'Starting…';
        this.refreshPanel(true);
        break;
      }
      case 'forecast-progress':
        this.forecastProgress = `Simulating future ${msg.done} of ${msg.total}…`;
        this.refreshPanel(true);
        break;
      case 'forecast-result':
        this.forecast = msg.result;
        this.forecastProgress = '';
        this.forecastWorker?.terminate();
        this.forecastWorker = null;
        this.panelCache.forecast = undefined;
        this.refreshPanel(true);
        toast('Forecast ready.');
        break;
      case 'error':
        console.error(msg.message);
        toast('The simulation hit an error. Details are in the browser console.');
        break;
    }
  }

  // ---------------------------------------------------------------- shell
  private buildShell() {
    clear(this.root);
    const speedSel = h('select', { id: 'speed', 'aria-label': 'Simulation speed' }) as HTMLSelectElement;
    for (const s of SPEEDS) speedSel.append(h('option', { value: s.v, selected: s.v === this.speed }, s.label));
    speedSel.addEventListener('change', () => { this.speed = Number(speedSel.value); this.send({ type: 'run', running: this.running, speed: this.speed }); });
    const playBtn = h('button', { class: 'btn primary play', id: 'play', onclick: () => this.setRunning(!this.running), 'aria-label': 'Play or pause' }, 'Pause');
    this.els.play = playBtn;
    const lensSel = h('select', { id: 'lens', 'aria-label': 'Color people by' }) as HTMLSelectElement;
    const groups = [...new Set(LENSES.map((l) => l.group))];
    for (const g of groups) {
      const og = h('optgroup', { label: g });
      for (const l of LENSES.filter((x) => x.group === g)) og.append(h('option', { value: l.id, selected: l.id === this.lens }, l.label));
      lensSel.append(og);
    }
    lensSel.addEventListener('change', () => this.setLens(lensSel.value));
    this.els.date = h('div', { class: 'date', 'aria-live': 'off' }, '—');
    this.els.regime = h('span', { class: 'chip' }, '—');
    this.els.realTag = this.scenario.real ? h('span', { class: 'chip real', title: `Started from researched data for ${this.scenario.real.name}, compiled ${this.scenario.real.asOf}` }, `Real data · ${this.scenario.real.asOf.slice(0, 4)}`) : h('span', {});
    this.els.society = h('span', { class: 'society-name' }, this.scenario.society.name);
    this.els.perf = h('span', { class: 'perf' }, '');
    const topbar = h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, h('span', { class: 'logo', 'aria-hidden': 'true' }), h('span', {}, 'Human Society')),
      h('div', { class: 'title' }, this.els.society, this.els.regime, this.els.realTag),
      this.els.date,
      h('div', { class: 'transport' },
        playBtn,
        h('button', { class: 'btn', onclick: () => this.step(1), title: 'Advance one month (→)' }, '+1 month'),
        h('button', { class: 'btn', onclick: () => this.step(12), title: 'Advance one year' }, '+1 year'),
        speedSel,
      ),
      h('div', { class: 'top-actions' },
        h('button', { class: 'btn ghost', onclick: () => this.newSociety() }, 'New society'),
        h('button', { class: 'btn ghost icon', onclick: () => cycleTheme(), title: 'Switch light / dark theme', 'aria-label': 'Switch theme' }, '◐'),
      ),
    );
    this.map = new PopulationMap({ onPick: (x, y, r) => this.send({ type: 'pick', x, y, radius: r }) });
    this.els.legend = h('div', { class: 'legend-box' });
    this.els.ticker = h('div', { class: 'ticker', 'aria-live': 'polite' });
    const mapEl = h('div', { class: 'map' },
      this.map.el,
      h('div', { class: 'map-tools' },
        h('label', { class: 'lens-label', for: 'lens' }, 'Color by'),
        lensSel,
      ),
      this.els.ticker,
      this.els.legend,
      h('div', { class: 'zoom' },
        h('button', { class: 'btn icon', onclick: () => this.map.zoomBy(1.4), 'aria-label': 'Zoom in' }, '+'),
        h('button', { class: 'btn icon', onclick: () => this.map.zoomBy(1 / 1.4), 'aria-label': 'Zoom out' }, '−'),
        h('button', { class: 'btn icon', onclick: () => this.map.resetView(), 'aria-label': 'Reset view' }, '⤢'),
      ),
      this.els.perf,
      this.map.gpu ? null : h('div', { class: 'gpu-note' }, 'WebGL2 unavailable: drawing on the CPU.'),
    );
    this.els.kpis = h('div', { class: 'kpis' });
    for (const k of KPI_KEYS) {
      const d = SERIES_BY_KEY[k];
      const tile = h('div', { class: 'kpi', title: d.help ?? '' },
        h('div', { class: 'kpi-label' }, d.label),
        h('div', { class: 'kpi-value' }, '—'),
        h('div', { class: 'kpi-delta' }, ''),
        h('canvas', { class: 'kpi-spark', 'aria-hidden': 'true' }),
      );
      tile.dataset.key = k;
      this.els.kpis.append(tile);
    }
    const tabBar = h('div', { class: 'tabs', role: 'tablist' });
    for (const t of TABS) {
      tabBar.append(h('button', { role: 'tab', id: `tab-${t.id}`, 'aria-selected': t.id === this.tab ? 'true' : 'false', class: 'tab' + (t.id === this.tab ? ' on' : ''), onclick: () => this.setTab(t.id) }, t.label));
    }
    this.els.tabs = tabBar;
    this.panelBody = h('div', { class: 'panel-body', role: 'tabpanel' });
    const app = h('div', { class: 'app' },
      topbar,
      h('div', { class: 'workspace' },
        h('section', { class: 'stage' }, mapEl, this.els.kpis),
        h('aside', { class: 'panel' }, tabBar, this.panelBody),
      ),
    );
    this.root.append(app);
    this.applyLensPalette();
    this.renderPanel();
    document.onkeydown = (e) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === ' ') { e.preventDefault(); this.setRunning(!this.running); }
      if (e.key === 'ArrowRight') this.step(1);
    };
  }

  private setRunning(on: boolean) {
    this.running = on;
    this.els.play.textContent = on ? 'Pause' : 'Play';
    this.els.play.classList.toggle('paused', !on);
    this.send({ type: 'run', running: on, speed: this.speed });
  }

  private step(months: number) {
    this.setRunning(false);
    this.send({ type: 'step', months });
  }

  private newSociety() {
    this.setRunning(false);
    openSetup(document.body, this.scenario, (s) => this.start(s), () => {});
  }

  private setTab(t: Tab) {
    this.tab = t;
    for (const b of this.els.tabs.querySelectorAll('button')) {
      const on = b.id === `tab-${t}`;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    this.renderPanel();
  }

  private setLens(id: string) {
    this.lens = id;
    this.send({ type: 'lens', id });
    this.applyLensPalette();
  }

  private lensCategories(): { colors: string[]; labels: string[] } | null {
    const def = LENS_BY_ID[this.lens];
    if (def.kind !== 'categorical') return null;
    switch (this.lens) {
      case 'faith': return { colors: this.scenario.population.faiths.map((f) => f.color), labels: this.scenario.population.faiths.map((f) => f.name) };
      case 'occupation': return { colors: OCC_COLORS, labels: OCC_NAMES };
      case 'camp': return { colors: [...CAMPS.map((c) => c.color), '#4b5563'], labels: [...CAMPS.map((c) => c.label), 'Children'] };
      case 'vote': {
        const parties = this.state?.S.parties ?? [];
        return { colors: parties.map((p) => p.color), labels: parties.map((p) => p.name) };
      }
      case 'protest': return { colors: PROTEST_COLORS, labels: ['Not protesting', 'Protesting peacefully', 'Rioting / violent'] };
      case 'love': return { colors: ['#4b5563', '#6b7280', '#e87ba4', '#ff4d6d', '#9085e9'], labels: LOVE_LABELS };
      case 'disease': return { colors: DISEASE_COLORS, labels: ['Never infected', 'Infected now', 'Recovered'] };
    }
    return null;
  }

  private applyLensPalette() {
    const cats = this.lensCategories();
    this.map.setPalette(lensPalette(this.lens, cats?.colors));
    const def = LENS_BY_ID[this.lens];
    const box = this.els.legend;
    clear(box);
    box.append(h('div', { class: 'lg-title' }, def.label));
    if (cats) {
      const list = h('div', { class: 'lg-cats' });
      const skip = this.lens === 'occupation' ? [] : [];
      cats.labels.forEach((l, i) => { if (!skip.includes(i as never)) list.append(h('span', { class: 'lg' }, h('i', { style: `background:${cats.colors[i]}` }), l)); });
      box.append(list);
    } else {
      box.append(h('div', { class: 'lg-ramp', style: `background:${cssRamp(this.lens)}` }), h('div', { class: 'lg-ends' }, h('span', {}, def.low ?? ''), h('span', {}, def.high ?? '')));
    }
  }

  // ---------------------------------------------------------------- per-frame updates
  private onFrame() {
    const st = this.state!;
    const now = performance.now();
    this.els.date.innerHTML = `<span class="yr">${st.year}</span><span class="mo">${MONTHS[st.month]}</span>`;
    this.els.regime.textContent = st.S.regimeLabel;
    this.els.regime.className = 'chip ' + (st.S.democracy >= 0.5 ? 'dem' : st.S.democracy >= 0.3 ? 'hyb' : 'aut');
    const tpsLabel = this.perf.ticksPerSecond ? ` · ${this.perf.ticksPerSecond.toFixed(1)} months/s` : '';
    this.els.perf.textContent = `${compact(st.latest.pop)} people · ${this.perf.msPerTick.toFixed(0)} ms per month${tpsLabel}`;
    if (now - this.lastKpiUpdate > 300) { this.lastKpiUpdate = now; this.updateKpis(); }
    if (now - this.lastPanelUpdate > 450) { this.lastPanelUpdate = now; this.refreshPanel(false); }
  }

  private flashNews(items: NewsItem[]) {
    const important = items.filter((n) => n.level >= 2);
    if (!important.length) return;
    const n = important[important.length - 1];
    const yr = this.scenario.society.startYear + Math.floor(n.t / 12);
    const el = h('div', { class: `tick-item cat-${n.cat}` }, h('b', {}, String(yr)), ' ', n.text);
    this.els.ticker.prepend(el);
    while (this.els.ticker.childElementCount > 3) this.els.ticker.lastElementChild?.remove();
    setTimeout(() => el.classList.add('fade'), 7000);
    setTimeout(() => el.remove(), 8000);
  }

  private updateKpis() {
    const st = this.state;
    if (!st) return;
    const n = this.histT.length;
    const yearAgo = Math.max(0, n - 13);
    for (const tile of this.els.kpis.children) {
      const k = (tile as HTMLElement).dataset.key!;
      const d = SERIES_BY_KEY[k];
      const v = st.latest[k];
      (tile.children[1] as HTMLElement).textContent = fmtValue(v, d.fmt);
      const prev = this.hist[k]?.[yearAgo];
      const delta = tile.children[2] as HTMLElement;
      if (prev !== undefined && isFinite(prev) && isFinite(v) && n > 13) {
        const diff = v - prev;
        const rel = d.fmt === 'int' || d.fmt === 'money' ? `${diff >= 0 ? '+' : ''}${((diff / (Math.abs(prev) || 1)) * 100).toFixed(1)}%` : `${diff >= 0 ? '+' : '−'}${fmtValue(Math.abs(diff), d.fmt)}`;
        const good = d.good === undefined ? null : (diff >= 0) === d.good;
        delta.textContent = `${diff >= 0 ? '▲' : '▼'} ${rel} vs last year`;
        delta.className = 'kpi-delta ' + (Math.abs(diff) < 1e-9 || good === null ? '' : good ? 'up' : 'down');
      } else delta.textContent = '';
      const arr = this.hist[k] ?? [];
      const tail: number[] = [];
      for (let i = Math.max(0, arr.length - 120); i < arr.length; i += 3) tail.push(arr[i]);
      sparkline(tile.children[3] as HTMLCanvasElement, tail, cssVar('--accent'));
    }
  }

  // ---------------------------------------------------------------- panels
  private renderPanel() {
    clear(this.panelBody);
    let entry = this.panelCache[this.tab];
    if (!entry) {
      entry = this.buildPanel(this.tab);
      this.panelCache[this.tab] = entry;
    }
    this.panelBody.append(entry.el);
    entry.update();
  }

  private refreshPanel(force: boolean) {
    const entry = this.panelCache[this.tab];
    if (!entry) return this.renderPanel();
    if (force || this.tab !== 'events') entry.update();
  }

  private buildPanel(tab: Tab): { el: HTMLElement; update: () => void } {
    switch (tab) {
      case 'groups': return this.groupsPanel();
      case 'overview': return this.overviewPanel();
      case 'charts': return this.chartsPanel();
      case 'events': return this.eventsPanel();
      case 'policy': return this.policyPanel();
      case 'people': return this.peoplePanel();
      case 'forecast': return this.forecastPanel();
      case 'chronicle': return this.chroniclePanel();
    }
  }

  // ---------- Overview ----------
  private overviewPanel() {
    const el = h('div', { class: 'pane' });
    const update = () => {
      const st = this.state;
      clear(el);
      if (!st) { el.append(h('p', { class: 'empty' }, 'Generating the population…')); return; }
      const S = st.S;
      const L = st.latest;
      const stress = S.psi;
      const stressLabel = stress > 0.55 ? 'Critical' : stress > 0.4 ? 'High' : stress > 0.25 ? 'Elevated' : 'Low';
      const flags: HTMLElement[] = [];
      if (S.warActive) flags.push(h('span', { class: 'flag bad' }, 'At war'));
      if (S.conflict) flags.push(h('span', { class: 'flag bad' }, 'Civil conflict'));
      if (S.epiActive) flags.push(h('span', { class: 'flag warn' }, 'Epidemic'));
      if (S.protestFrac > 0.005) flags.push(h('span', { class: 'flag warn' }, `${(S.protestFrac * 100).toFixed(1)}% protesting`));
      if (S.debtRatio > 1) flags.push(h('span', { class: 'flag warn' }, `Debt ${(S.debtRatio * 100).toFixed(0)}% of GDP`));
      el.append(
        h('div', { class: 'card hero-card' },
          h('p', { class: 'eyebrow' }, `${st.year} · ${MONTHS[st.month]}`),
          h('h2', {}, S.regimeLabel),
          h('p', { class: 'muted' }, `Rulers: ${describeIdeology(S.ruling)}.`),
          flags.length ? h('div', { class: 'flags' }, ...flags) : null,
          h('div', { class: 'meters' },
            meterRow('Democracy', S.democracy, fmtValue(S.democracy, 'idx')),
            meterRow('Legitimacy', S.legitimacy, fmtValue(S.legitimacy, 'idx')),
            meterRow(`Political stress · ${stressLabel}`, stress, fmtValue(stress, 'idx'), stress > 0.4 ? 'warn' : ''),
            meterRow('Army & police loyalty', S.securityLoyalty, fmtValue(S.securityLoyalty, 'idx')),
          ),
          h('p', { class: 'help' }, 'Political stress follows Turchin\'s structural-demographic theory: popular discontent × competition among frustrated elites × a weak, indebted state.'),
        ),
      );
      // events
      if (st.events.length) {
        const list = h('div', { class: 'ev-list' });
        for (const e of st.events) {
          list.append(h('div', { class: 'ev-row' },
            h('div', { class: 'ev-name' }, h('span', { class: `dot cat-${e.category}` }), e.name, e.target ? h('span', { class: 'muted' }, ` · ${e.target}`) : null),
            meter(e.progress, 'thin'),
            h('div', { class: 'muted small' }, e.monthsLeft > 24 ? `${Math.round(e.monthsLeft / 12)} years left` : `${e.monthsLeft} months left`),
          ));
        }
        el.append(h('div', { class: 'card' }, h('h3', {}, 'Happening now'), list));
      }
      // leaders
      if (st.leaders.length) {
        const list = h('div', { class: 'leaders' });
        for (const l of st.leaders) list.append(leaderRow(l, st, () => this.selectLeader(l)));
        el.append(h('div', { class: 'card' }, h('h3', {}, 'Influential people'), list));
      }
      // parties
      if (S.parties.length) {
        const rows = h('div', { class: 'bars' });
        const order = S.parties.map((p, i) => i).sort((a, b) => S.parties[b].share - S.parties[a].share);
        for (const i of order) {
          const p = S.parties[i];
          const inGov = S.govParties.includes(i);
          rows.append(h('div', { class: 'bar-row' },
            h('div', { class: 'bar-label' }, h('i', { style: `background:${p.color}` }), p.name, inGov ? h('span', { class: 'badge', title: 'In government' }, 'gov') : null),
            h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: `width:${(p.share * 100).toFixed(1)}%;background:${p.color}` })),
            h('div', { class: 'bar-val' }, `${(p.share * 100).toFixed(0)}%`),
          ));
        }
        const elect = S.democracy >= 0.3 && S.nextElection > st.t
          ? `Next election in ${Math.max(0, Math.round((S.nextElection - st.t) / 12 * 10) / 10)} years.${S.democracy < 0.5 ? ' Elections are held but tilted toward the rulers.' : ''}`
          : S.democracy < 0.3 ? 'No real elections: these are hidden sympathies.' : '';
        el.append(h('div', { class: 'card' },
          h('h3', {}, S.democracy >= 0.3 ? 'Polls' : 'Political sympathies'),
          rows,
          S.lastElection ? h('p', { class: 'muted small' }, `Last election (${S.lastElection.year}): ${S.lastElection.headline}`) : null,
          h('p', { class: 'muted small' }, elect),
        ));
      }
      // faith groups
      const faiths = this.scenario.population.faiths;
      const frows = h('div', { class: 'faith-stats' });
      faiths.forEach((f, i) => {
        const fs = st.faithStats[i];
        frows.append(h('div', { class: 'fs-row' },
          h('div', { class: 'bar-label' }, h('i', { style: `background:${f.color}` }), f.name, h('span', { class: 'muted' }, ` ${(st.faithShares[i] * 100).toFixed(1)}%`)),
          h('div', { class: 'fs-cells' },
            cell('Devotion', fs?.relig ?? 0), cell('Grievance', fs?.griev ?? 0), cell('Tolerance', fs?.toler ?? 0),
            h('span', { class: 'fs-cell' }, h('span', { class: 'muted' }, 'Militants '), h('b', {}, compact(fs?.extremists ?? 0))),
          ),
        ));
      });
      el.append(h('div', { class: 'card' }, h('h3', {}, 'Faith communities'), frows));
      // society at a glance
      const glance = h('div', { class: 'glance' });
      for (const k of ['gini', 'poverty', 'edu', 'urban', 'married', 'itrust', 'strust', 'toler', 'relig', 'social', 'polarization', 'crime', 'homicide', 'suicide', 'immigrantShare', 'medianAge']) {
        const d = SERIES_BY_KEY[k];
        glance.append(h('div', { class: 'gl', title: d.help ?? '' }, h('span', { class: 'muted' }, d.label), h('b', {}, fmtValue(L[k], d.fmt))));
      }
      el.append(h('div', { class: 'card' }, h('h3', {}, 'Society at a glance'), glance));
      // occupations & deaths
      const occ = h('div', { class: 'bars compact' });
      const occTotal = st.occupations.reduce((a, b) => a + b, 0) || 1;
      st.occupations.forEach((v, i) => {
        if (v <= 0) return;
        occ.append(h('div', { class: 'bar-row' },
          h('div', { class: 'bar-label' }, h('i', { style: `background:${OCC_COLORS[i]}` }), OCC_NAMES[i]),
          h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: `width:${(v / occTotal * 100).toFixed(1)}%;background:${OCC_COLORS[i]}` })),
          h('div', { class: 'bar-val' }, `${(v / occTotal * 100).toFixed(0)}%`),
        ));
      });
      el.append(h('div', { class: 'card' }, h('h3', {}, 'What people do'), occ));
      const dtot = st.deathCauses.reduce((a, b) => a + b, 0);
      if (dtot > 0) {
        const dl = h('div', { class: 'glance' });
        st.deathCauses.forEach((v, i) => { if (v > 0) dl.append(h('div', { class: 'gl' }, h('span', { class: 'muted' }, DEATH_NAMES[i]), h('b', {}, `${(v / dtot * 100).toFixed(1)}%`))); });
        el.append(h('div', { class: 'card' }, h('h3', {}, 'Causes of death so far'), dl));
      }
    };
    return { el, update };
  }

  // ---------- Groups: who grows, and why ----------
  private groupsPanel() {
    const el = h('div', { class: 'pane' });
    const summary = h('div', { class: 'card hero-card' });
    const shareHost = h('div', {});
    const shareChart = new LineChart(shareHost, 190, { stacked: true, zeroBased: true });
    const tableWrap = h('div', { class: 'table-wrap' });
    const campBars = h('div', { class: 'bars' });
    const campHost = h('div', {});
    const campChart = new LineChart(campHost, 170, { stacked: true, zeroBased: true });
    const profiles = h('div', { class: 'profiles' });
    el.append(
      summary,
      h('div', { class: 'card' }, h('h3', {}, 'Share of the population'), shareHost),
      h('div', { class: 'card' },
        h('h3', {}, 'Why each group grows or shrinks'),
        h('p', { class: 'muted small' }, 'Per 1,000 members over the last full year. A group grows through more births than deaths (fertility and a young age structure), through people joining it, and through migration.'),
        tableWrap,
      ),
      h('div', { class: 'card' },
        h('h3', {}, 'Ideologies'),
        h('p', { class: 'muted small' }, 'Adults grouped by the views they lean to most. Change is shown since the simulation started.'),
        campBars, campHost,
      ),
      h('div', { class: 'card' }, h('h3', {}, 'The groups in this society'), profiles),
    );
    let profilesFor = '';
    const update = () => {
      const st = this.state;
      const faiths = this.scenario.population.faiths;
      if (!st) { clear(summary); summary.append(h('p', { class: 'empty' }, 'Generating the population…')); return; }
      const G = st.groups;
      const K = faiths.length;
      const startYear = this.scenario.society.startYear;
      const n = this.histT.length;
      const x = new Float64Array(n);
      for (let i = 0; i < n; i++) x[i] = startYear + this.histT[i] / 12;
      shareChart.set(x, faiths.map((f, i) => ({ label: f.name, values: this.hist['faith' + i] ?? [], color: f.color })), 'pct');
      campChart.set(x, CAMPS.map((c, k) => ({ label: c.label, values: this.hist['camp' + k] ?? [], color: c.color })), 'pct');
      // growth of each group's numbers over the last (up to) ten years
      const growth = groupGrowth(this.histT, this.hist, K);
      const shares = st.faithShares;
      const order = shares.map((_, i) => i).sort((a, b) => shares[b] - shares[a]);
      const leader = order[0];
      clear(summary);
      summary.append(h('p', { class: 'eyebrow' }, `${st.year} · ${MONTHS[st.month]}`));
      if (!growth) {
        summary.append(h('h2', {}, `${faiths[leader].name} ${pct1(shares[leader])}`), h('p', { class: 'muted' }, 'Let the simulation run a year or two to see which groups are growing.'));
      } else {
        const ranked = growth.rate.map((r, i) => i).filter((i) => shares[i] > 0.002).sort((a, b) => growth.rate[b] - growth.rate[a]);
        const fastest = ranked[0];
        const slowest = ranked[ranked.length - 1];
        const shareRate = (i: number) => growth.rate[i] - growth.total;
        summary.append(
          h('h2', {}, shareRate(fastest) > 0.001 ? `${faiths[fastest].name} are growing fastest` : 'Group shares are stable'),
          h('p', { class: 'muted' }, `${describeRate(faiths[fastest].name, growth.rate[fastest], G.tfr[fastest], G.medianAge[fastest])} ${slowest !== fastest ? describeRate(faiths[slowest].name, growth.rate[slowest], G.tfr[slowest], G.medianAge[slowest]) : ''}`),
        );
        const proj = projectShares(shares, growth.rate, growth.total, 200);
        const horizon = [25, 50];
        const outlook = h('div', { class: 'glance' });
        for (const yrs of horizon) {
          for (const i of order.slice(0, 4)) {
            outlook.append(h('div', { class: 'gl' }, h('span', { class: 'muted' }, `${faiths[i].name} in ${st.year + yrs}`), h('b', {}, pct1(proj.shares[yrs][i]))));
          }
        }
        const cross = proj.overtake;
        summary.append(
          h('h3', {}, `If the last ${growth.years} years' trends simply continued`),
          outlook,
          h('p', { class: 'muted small' }, cross
            ? `${faiths[cross.who].name} would overtake ${faiths[leader].name} as the largest group around ${st.year + cross.years}.`
            : `${faiths[leader].name} would stay the largest group for at least 200 years.`),
          h('p', { class: 'help' }, 'This straight-line extrapolation assumes today\'s birth, switching and migration rates never change. In reality fertility falls as people study longer and move to cities, so use the Forecast tab to simulate many full futures.'),
        );
      }
      // table of growth components
      clear(tableWrap);
      const signed = (v: number) => (isFinite(v) ? `${v > 0.05 ? '+' : v < -0.05 ? '−' : ''}${Math.abs(v).toFixed(1)}` : '–');
      const tone = (v: number) => (v > 0.5 ? 'pos' : v < -0.5 ? 'neg' : '');
      tableWrap.append(h('table', { class: 'odds groups-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Group'), h('th', {}, 'Share'), h('th', { title: 'Change in share since the simulation started (percentage points)' }, 'Since start'), h('th', { title: 'Children per woman' }, 'Children'), h('th', {}, 'Median age'), h('th', { title: 'Births minus deaths per 1,000 members' }, 'Births − deaths'), h('th', { title: 'People joining minus people leaving, per 1,000 members' }, 'Switching'), h('th', { title: 'Immigrants minus emigrants per 1,000 members' }, 'Migration'))),
        h('tbody', {}, ...order.map((i) => {
          const d = (shares[i] - (G.start[i] ?? 0)) * 100;
          return h('tr', {},
            h('td', {}, h('span', { class: 'bar-label' }, h('i', { style: `background:${faiths[i].color}` }), faiths[i].name)),
            h('td', {}, pct1(shares[i])),
            h('td', { class: tone(d * 2) }, `${d >= 0.05 ? '+' : d <= -0.05 ? '−' : ''}${Math.abs(d).toFixed(1)}`),
            h('td', {}, isFinite(G.tfr[i]) ? G.tfr[i].toFixed(2) : '–'),
            h('td', {}, isFinite(G.medianAge[i]) ? G.medianAge[i].toFixed(0) : '–'),
            h('td', { class: tone(G.natural[i]) }, signed(G.natural[i])),
            h('td', { class: tone(G.switching[i]) }, signed(G.switching[i])),
            h('td', { class: tone(G.migration[i]) }, signed(G.migration[i])),
          );
        })),
      ));
      // ideology camps
      clear(campBars);
      const camps = CAMPS.map((_, k) => st.latest['camp' + k] ?? 0);
      const corder = camps.map((_, k) => k).sort((a, b) => camps[b] - camps[a]);
      for (const k of corder) {
        const c = CAMPS[k];
        const d = (camps[k] - (G.campStart[k] ?? 0)) * 100;
        campBars.append(h('div', { class: 'bar-row camp-row', title: c.help },
          h('div', { class: 'bar-label' }, h('i', { style: `background:${c.color}` }), c.label),
          h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: `width:${(camps[k] * 100).toFixed(1)}%;background:${c.color}` })),
          h('div', { class: 'bar-val' }, `${(camps[k] * 100).toFixed(0)}%`),
          h('div', { class: 'bar-delta ' + (d > 0.5 ? 'pos' : d < -0.5 ? 'neg' : '') }, `${d >= 0.5 ? '▲' : d <= -0.5 ? '▼' : ''} ${Math.abs(d).toFixed(0)} pts`),
        ));
      }
      // profiles (rebuilt only when the numbers change meaningfully)
      const sig = faiths.map((_, i) => `${G.edu[i]?.toFixed(1)}|${G.wealth[i]?.toFixed(2)}`).join(',');
      if (sig !== profilesFor) {
        profilesFor = sig;
        clear(profiles);
        for (const i of order) {
          const f = faiths[i];
          const prof = f.profile ? FAITH_PROFILE_BY_ID[f.profile] : undefined;
          profiles.append(h('div', { class: 'profile' },
            h('div', { class: 'bar-label' }, h('i', { style: `background:${f.color}` }), h('b', {}, f.name), prof ? h('span', { class: 'muted' }, ` · ${prof.tradition}, ${prof.context}`) : h('span', { class: 'muted' }, ' · custom group')),
            h('div', { class: 'glance' },
              h('div', { class: 'gl' }, h('span', { class: 'muted' }, 'People'), h('b', {}, compact(G.members[i] ?? 0))),
              h('div', { class: 'gl' }, h('span', { class: 'muted' }, 'Schooling (adults)'), h('b', {}, isFinite(G.edu[i]) ? `${G.edu[i].toFixed(1)} yrs` : '–')),
              h('div', { class: 'gl' }, h('span', { class: 'muted' }, 'Wealth vs average'), h('b', {}, isFinite(G.wealth[i]) ? `${G.wealth[i].toFixed(2)}×` : '–')),
              h('div', { class: 'gl' }, h('span', { class: 'muted' }, 'Devotion'), h('b', {}, (st.faithStats[i]?.relig ?? 0).toFixed(2))),
            ),
            f.note ? h('p', { class: 'help' }, f.note) : null,
          ));
        }
      }
    };
    return { el, update };
  }

  private selectLeader(l: Leader) {
    const slot = l.ref >>> 8;
    this.send({ type: 'select', slot });
    this.selected = slot;
    this.setTab('people');
  }

  // ---------- Trends ----------
  private chartsPanel() {
    const el = h('div', { class: 'pane' });
    const groups: Record<string, { title: string; keys: string[]; fmt?: Fmt; zero?: boolean }[]> = {
      Population: [
        { title: 'Population', keys: ['pop'], zero: true },
        { title: 'Births and deaths per 1,000', keys: ['births', 'deaths'] },
        { title: 'Life expectancy', keys: ['lifeExp'] },
        { title: 'Children per woman', keys: ['tfr'] },
        { title: 'Schooling and cities', keys: ['urban', 'married'] },
      ],
      Economy: [
        { title: 'GDP per person', keys: ['gdppc'] },
        { title: 'Unemployment and inflation', keys: ['unemployment', 'inflation'] },
        { title: 'Inequality', keys: ['gini', 'wealthGini'] },
        { title: 'Poverty', keys: ['poverty', 'extremePoverty'] },
        { title: 'Public debt / GDP', keys: ['debtRatio'] },
      ],
      Wellbeing: [
        { title: 'Life satisfaction, health, mental health', keys: ['happy', 'health', 'mental'] },
        { title: 'Grievance and fear', keys: ['griev', 'fear'] },
        { title: 'Crime per 1,000', keys: ['crime'] },
        { title: 'Homicide and suicide per 100,000', keys: ['homicide', 'suicide'] },
      ],
      Values: [
        { title: 'Social and economic views', keys: ['social', 'econ', 'auth'] },
        { title: 'Trust', keys: ['itrust', 'strust'] },
        { title: 'Tolerance and nationalism', keys: ['toler', 'patriot'] },
        { title: 'Polarization', keys: ['polarization'] },
        { title: 'Consumerism', keys: ['consum'] },
      ],
      Faith: [
        { title: 'Religiosity and literal interpretation', keys: ['relig', 'strict'] },
        { title: 'Extremists (share of adults)', keys: ['extrem'] },
      ],
      Politics: [
        { title: 'Democracy, press freedom, repression', keys: ['democracy', 'pressFreedom', 'repression'] },
        { title: 'Legitimacy and political stress', keys: ['legitimacy', 'psi'] },
        { title: 'Share of adults protesting', keys: ['protest'] },
        { title: 'Welfare and taxes', keys: ['welfare', 'taxRate'] },
      ],
    };
    const chips = h('div', { class: 'chips' });
    const body = h('div', {});
    let charts: { chart: LineChart; keys: string[]; fmt: Fmt; special?: string }[] = [];
    let pyr: HTMLCanvasElement | null = null;
    let comp: HTMLCanvasElement | null = null;
    const build = () => {
      clear(chips);
      for (const g of [...Object.keys(groups), 'Custom']) {
        chips.append(h('button', { class: 'chip-btn' + (g === this.chartGroup ? ' on' : ''), 'aria-pressed': g === this.chartGroup ? 'true' : 'false', onclick: () => { this.chartGroup = g; build(); update(); } }, g));
      }
      clear(body);
      charts = [];
      pyr = null;
      comp = null;
      if (this.chartGroup === 'Custom') {
        const pick = h('div', { class: 'series-pick' });
        for (const d of SERIES) {
          const id = `cs-${d.key}`;
          const cb = h('input', { type: 'checkbox', id, checked: this.customSeries.includes(d.key) }) as HTMLInputElement;
          cb.addEventListener('change', () => {
            this.customSeries = cb.checked ? [...this.customSeries, d.key].slice(-4) : this.customSeries.filter((k) => k !== d.key);
            build(); update();
          });
          pick.append(h('label', { for: id, class: 'sp' }, cb, d.label));
        }
        const holder = h('div', { class: 'card' }, h('h3', {}, 'Your selection (up to 4)'));
        body.append(holder);
        // group selected series by format so each chart has one axis
        const byFmt = new Map<Fmt, string[]>();
        for (const k of this.customSeries) { const f = SERIES_BY_KEY[k].fmt; byFmt.set(f, [...(byFmt.get(f) ?? []), k]); }
        for (const [fmt, keys] of byFmt) {
          const c = h('div', {});
          holder.append(c);
          charts.push({ chart: new LineChart(c, 170), keys, fmt });
        }
        body.append(h('div', { class: 'card' }, h('h3', {}, 'Indicators'), pick));
        return;
      }
      if (this.chartGroup === 'Faith') {
        const c = h('div', {});
        body.append(h('div', { class: 'card' }, h('h3', {}, 'Faith groups (share of population)'), c));
        charts.push({ chart: new LineChart(c, 180, { stacked: true, zeroBased: true }), keys: [], fmt: 'pct', special: 'faith' });
      }
      if (this.chartGroup === 'Politics') {
        const c = h('div', {});
        body.append(h('div', { class: 'card' }, h('h3', {}, 'Party support'), c, h('p', { class: 'help' }, 'Parties form around clusters of voters, so their platforms and names can shift between elections.')));
        charts.push({ chart: new LineChart(c, 180, { zeroBased: true }), keys: [], fmt: 'pct', special: 'party' });
      }
      for (const spec of groups[this.chartGroup] ?? []) {
        const c = h('div', {});
        body.append(h('div', { class: 'card' }, h('h3', {}, spec.title), c));
        charts.push({ chart: new LineChart(c, 160, { zeroBased: spec.zero }), keys: spec.keys, fmt: spec.fmt ?? SERIES_BY_KEY[spec.keys[0]].fmt });
      }
      if (this.chartGroup === 'Population') {
        pyr = h('canvas', { class: 'pyramid', role: 'img', 'aria-label': 'Population pyramid' }) as HTMLCanvasElement;
        body.append(h('div', { class: 'card' }, h('h3', {}, 'Population pyramid'), pyr));
      }
      if (this.chartGroup === 'Values') {
        comp = h('canvas', { class: 'compass', role: 'img', 'aria-label': 'Opinion map of adults' }) as HTMLCanvasElement;
        body.append(h('div', { class: 'card' }, h('h3', {}, 'Opinion map'), comp, h('p', { class: 'help' }, 'Where adults stand on social and economic values. Brighter means more people; dots are the parties.')));
      }
    };
    el.append(chips, body);
    build();
    const update = () => {
      const n = this.histT.length;
      const start = this.scenario.society.startYear;
      const x = new Float64Array(n);
      for (let i = 0; i < n; i++) x[i] = start + this.histT[i] / 12;
      for (const c of charts) {
        if (c.special === 'faith') {
          c.chart.set(x, this.scenario.population.faiths.map((f, i) => ({ label: f.name, values: this.hist['faith' + i] ?? [], color: f.color })), 'pct');
        } else if (c.special === 'party') {
          const parties = this.state?.S.parties ?? [];
          c.chart.set(x, parties.map((p, i) => ({ label: p.name, values: this.hist['party' + i] ?? [], color: p.color })), 'pct');
        } else {
          c.chart.set(x, c.keys.map((k, i) => ({ label: SERIES_BY_KEY[k].label, values: this.hist[k] ?? [], color: seriesColor(i) })), c.fmt);
        }
      }
      if (pyr && this.pyramid) drawPyramid(pyr, this.pyramid.male, this.pyramid.female);
      if (comp && this.compass) drawCompass(comp, this.compass, (this.state?.S.parties ?? []).map((p) => ({ x: p.pos.social, y: p.pos.econ, color: p.color, name: p.name })));
    };
    return { el, update };
  }

  // ---------- Events ----------
  private eventsPanel() {
    const el = h('div', { class: 'pane' });
    let cat: EventCategory | 'all' = 'all';
    let query = '';
    const faiths = this.scenario.population.faiths;
    const listEl = h('div', { class: 'tpl-list' });
    const tlEl = h('div', { class: 'tl-list' });
    const renderList = () => {
      clear(listEl);
      const q = query.toLowerCase();
      for (const t of TEMPLATES) {
        if (cat !== 'all' && t.category !== cat) continue;
        if (q && !(`${t.name} ${t.description} ${t.history}`.toLowerCase().includes(q))) continue;
        listEl.append(this.templateCard(t));
      }
      if (!listEl.childElementCount) listEl.append(h('p', { class: 'empty' }, 'No events match. Try another word, or build your own below.'));
    };
    const renderTimeline = () => {
      clear(tlEl);
      const st = this.state;
      const upcoming = this.timeline.filter((e) => !e.fired);
      if (!upcoming.length) tlEl.append(h('p', { class: 'empty' }, 'Nothing scheduled. Use "Schedule" on any event to plan it for a future year.'));
      for (const ev of upcoming) {
        const name = ev.custom?.name ?? TEMPLATE_BY_ID[ev.templateId]?.name ?? ev.templateId;
        tlEl.append(h('div', { class: 'tl-item' },
          h('span', { class: 'tl-date' }, `${ev.year}`),
          h('span', { class: 'tl-name' }, name, ev.target?.faith !== undefined ? ` · ${faiths[ev.target.faith]?.name}` : ''),
          h('span', { class: 'tl-int' }, `×${ev.intensity.toFixed(1)}`),
          h('button', { class: 'btn ghost small', onclick: () => { this.send({ type: 'unschedule', uid: ev.uid }); this.timeline = this.timeline.filter((x) => x.uid !== ev.uid); renderTimeline(); } }, 'Remove'),
        ));
      }
      void st;
    };
    const catChips = h('div', { class: 'chips' });
    const renderChips = () => {
      clear(catChips);
      for (const [k, label] of [['all', 'All'], ...Object.entries(CATEGORY_LABELS)] as [EventCategory | 'all', string][]) {
        catChips.append(h('button', { class: 'chip-btn' + (k === cat ? ' on' : ''), 'aria-pressed': k === cat ? 'true' : 'false', onclick: () => { cat = k; renderChips(); renderList(); } }, label));
      }
    };
    const search = h('input', { type: 'search', placeholder: 'Search events, e.g. famine, radio, coup', 'aria-label': 'Search events' }) as HTMLInputElement;
    search.addEventListener('input', () => { query = search.value; renderList(); });
    const rnd = this.scenario.society;
    el.append(
      h('div', { class: 'card' },
        h('h3', {}, 'Change the course of history'),
        h('p', { class: 'muted' }, 'Every event is built from the same primitive forces: economic shocks, institutional change, deaths, migration, and pushes on what a target group feels and believes. The library encodes well-documented episodes; scale them, aim them at a group, trigger them now or schedule them.'),
        h('div', { class: 'row wrap' },
          toggle('Random events', rnd.randomEvents, (v) => { rnd.randomEvents = v; this.send({ type: 'randomEvents', on: v, rate: rnd.eventRate }); }),
          h('div', { class: 'grow' }, slider({ label: 'Frequency', min: 0.1, max: 3, step: 0.1, value: rnd.eventRate, fmt: (v) => `${v.toFixed(1)}×`, onInput: (v) => { rnd.eventRate = v; this.send({ type: 'randomEvents', on: rnd.randomEvents, rate: v }); } })),
        ),
      ),
      h('div', { class: 'card' }, h('h3', {}, 'Scheduled'), tlEl),
      h('div', { class: 'card' }, h('h3', {}, 'Event library'), search, catChips, listEl),
      this.customBuilder(() => renderTimeline()),
    );
    renderChips();
    renderList();
    renderTimeline();
    return { el, update: () => renderTimeline() };
  }

  private targetControls(target: Target, spec?: EventSpec): HTMLElement {
    const faiths = this.scenario.population.faiths;
    const wrap = h('div', { class: 'grid2 tight' });
    wrap.append(select('Aimed at faith group', [{ value: '', label: 'Everyone' }, ...faiths.map((f, i) => ({ value: String(i), label: f.name }))], target.faith !== undefined ? String(target.faith) : '', (v) => { if (v === '') delete target.faith; else target.faith = Number(v); }));
    const places = [{ value: '', label: 'Whole country' }, { value: '-2', label: 'A random place' }, ...this.settlements.slice(0, 40).map((s, i) => ({ value: String(i), label: s.name }))];
    wrap.append(select('Where', places, target.settlement !== undefined ? String(target.settlement) : '', (v) => { if (v === '') delete target.settlement; else target.settlement = Number(v); }));
    wrap.append(select('Who', [
      { value: '', label: 'All ages & classes' }, { value: 'young', label: 'Young (15–30)' }, { value: 'old', label: 'Older (50+)' },
      { value: 'poor', label: 'Poorest 40%' }, { value: 'rich', label: 'Richest 10%' }, { value: 'men', label: 'Men' }, { value: 'women', label: 'Women' },
    ], '', (v) => {
      delete target.minAge; delete target.maxAge; delete target.wealthClass; delete target.sex;
      if (v === 'young') { target.minAge = 15; target.maxAge = 30; }
      if (v === 'old') target.minAge = 50;
      if (v === 'poor') target.wealthClass = 0;
      if (v === 'rich') target.wealthClass = 2;
      if (v === 'men') target.sex = 1;
      if (v === 'women') target.sex = 0;
    }));
    void spec;
    return wrap;
  }

  private templateCard(t: EventSpec): HTMLElement {
    let intensity = 1;
    const target: Target = { ...(t.target ?? {}) };
    let year = (this.state?.year ?? this.scenario.society.startYear) + 1;
    let leaderStyle: LeaderStyle | null = t.leader?.style ?? null;
    const details = h('details', { class: 'tpl' });
    const effects = Object.entries(t.effects).filter(([, v]) => v).map(([k, v]) => {
      const d = EFFECTS[k as EffectKey];
      const val = d.mode === 'total' ? `${(v as number) > 0 ? '+' : ''}${v}${d.unit === '%' ? '%' : d.unit === 'Δ' ? '' : ' ' + d.unit}` : `${(v as number) > 0 ? '+' : ''}${v}`;
      return h('span', { class: 'eff' }, `${d.label} ${val}`);
    });
    details.append(
      h('summary', {}, h('span', { class: `dot cat-${t.category}` }), h('span', { class: 'tpl-name' }, t.name), h('span', { class: 'muted small' }, CATEGORY_LABELS[t.category])),
      h('div', { class: 'tpl-body' },
        h('p', {}, t.description),
        h('p', { class: 'history' }, h('b', {}, 'In history: '), t.history),
        effects.length ? h('div', { class: 'effs' }, ...effects) : null,
        t.leader ? h('p', { class: 'muted small' }, `Creates a public figure: ${LEADER_STYLES[t.leader.style].label.toLowerCase()} (charisma ${t.leader.charisma.toFixed(2)}).`) : null,
        h('p', { class: 'refs' }, 'Sources: ', t.refs.join('; ')),
        slider({ label: 'Intensity', min: 0.2, max: 2.5, step: 0.1, value: 1, fmt: (v) => `${v.toFixed(1)}×`, help: '1× ≈ the historical episode.', onInput: (v) => { intensity = v; } }),
        this.targetControls(target, t),
        t.leader ? select('Kind of person', Object.entries(LEADER_STYLES).map(([k, s]) => ({ value: k as LeaderStyle, label: s.label })), t.leader.style, (v) => { leaderStyle = v; }) : null,
        h('div', { class: 'row' },
          h('button', { class: 'btn primary', onclick: () => {
            const leader = t.leader && leaderStyle && leaderStyle !== t.leader.style ? { ...t.leader, style: leaderStyle, ideology: TEMPLATES.find((x) => x.leader?.style === leaderStyle)?.leader?.ideology } : undefined;
            this.send({ type: 'trigger', templateId: t.id, intensity, target: cleanTarget(target), leader });
            toast(`${t.name} triggered.`);
          } }, 'Trigger now'),
          numberInput('Year', year, this.state?.year ?? this.scenario.society.startYear, (this.state?.year ?? 2000) + 300, 1, (v) => { year = v; }),
          h('button', { class: 'btn', onclick: () => {
            const ev: ScheduledEvent = { uid: `s${Date.now()}${Math.random().toString(36).slice(2, 6)}`, templateId: t.id, year, month: 0, intensity, target: cleanTarget(target) };
            if (t.leader && leaderStyle) ev.leader = { ...t.leader, style: leaderStyle };
            this.send({ type: 'schedule', event: ev });
            this.timeline = [...this.timeline, ev];
            toast(`${t.name} scheduled for ${year}.`);
          } }, 'Schedule'),
        ),
      ),
    );
    return details;
  }

  private customBuilder(onScheduled: () => void): HTMLElement {
    const spec: EventSpec = { id: 'custom', name: 'My event', category: 'society', description: 'A custom event.', history: '', refs: [], duration: 24, shape: 'hump', effects: {} };
    const target: Target = {};
    let intensity = 1;
    let year = (this.state?.year ?? this.scenario.society.startYear) + 1;
    let leaderOn = false;
    const leader = { style: 'demagogue' as LeaderStyle, charisma: 0.8, reach: 0.8 };
    const groups: Record<EffectGroup, string> = { economy: 'Economy', institutions: 'Institutions & policy', population: 'Population & health', minds: 'Hearts & minds of the target group' };
    const effGroups = h('div', {});
    for (const [g, label] of Object.entries(groups) as [EffectGroup, string][]) {
      const box = h('details', { class: 'eff-group' }, h('summary', {}, label));
      const grid = h('div', { class: 'grid2 tight' });
      for (const k of EFFECT_KEYS.filter((x) => EFFECTS[x].group === g)) {
        const d = EFFECTS[k];
        grid.append(slider({ label: `${d.label} (${d.unit})`, min: d.min, max: d.max, step: d.step, value: 0, help: d.help || undefined, onInput: (v) => { if (v) spec.effects[k] = v; else delete spec.effects[k]; } }));
      }
      box.append(grid);
      effGroups.append(box);
    }
    const nameIn = h('input', { type: 'text', value: spec.name, 'aria-label': 'Event name' }) as HTMLInputElement;
    nameIn.addEventListener('input', () => { spec.name = nameIn.value || 'My event'; });
    const build = (): EventSpec => {
      const s: EventSpec = { ...spec, effects: { ...spec.effects } };
      if (leaderOn) s.leader = { style: leader.style, charisma: leader.charisma, reach: leader.reach, ideology: TEMPLATES.find((x) => x.leader?.style === leader.style)?.leader?.ideology };
      return s;
    };
    return h('details', { class: 'card builder' },
      h('summary', {}, h('h3', {}, 'Build your own event')),
      h('p', { class: 'muted' }, 'Compose any historical or imagined event from primitive forces. "Total" effects are spread over the duration; "push" effects act every month while it lasts.'),
      h('div', { class: 'field' }, h('label', {}, 'Name'), nameIn),
      h('div', { class: 'grid2 tight' },
        slider({ label: 'Duration', min: 1, max: 240, step: 1, value: spec.duration, fmt: (v) => (v >= 24 ? `${(v / 12).toFixed(1)} years` : `${v} months`), onInput: (v) => { spec.duration = v; } }),
        select('Shape over time', [
          { value: 'pulse', label: 'Sudden shock' }, { value: 'hump', label: 'Rise and fall' }, { value: 'ramp', label: 'Gradual build-up' },
          { value: 'sustained', label: 'Constant' }, { value: 'decay', label: 'Strong then fading' },
        ], spec.shape, (v) => { spec.shape = v as Shape; }),
        slider({ label: 'Intensity', min: 0.2, max: 2.5, step: 0.1, value: 1, fmt: (v) => `${v.toFixed(1)}×`, onInput: (v) => { intensity = v; } }),
      ),
      this.targetControls(target),
      effGroups,
      h('details', { class: 'eff-group' },
        h('summary', {}, 'Add an influential person'),
        toggle('This event brings a charismatic figure', false, (v) => { leaderOn = v; }),
        select('Kind of person', Object.entries(LEADER_STYLES).map(([k, s]) => ({ value: k as LeaderStyle, label: s.label })), leader.style, (v) => { leader.style = v; }),
        slider({ label: 'Charisma', min: 0.1, max: 1, step: 0.05, value: leader.charisma, fmt: (v) => v.toFixed(2), onInput: (v) => { leader.charisma = v; } }),
        slider({ label: 'Reach', min: 0, max: 1, step: 0.05, value: leader.reach, fmt: (v) => v.toFixed(2), low: 'Local', high: 'National', onInput: (v) => { leader.reach = v; } }),
      ),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => {
          const s = build();
          this.send({ type: 'trigger', templateId: 'custom', custom: s, intensity, target: cleanTarget(target) });
          toast(`${s.name} triggered.`);
        } }, 'Trigger now'),
        numberInput('Year', year, this.state?.year ?? this.scenario.society.startYear, 3000, 1, (v) => { year = v; }),
        h('button', { class: 'btn', onclick: () => {
          const s = build();
          const ev: ScheduledEvent = { uid: `c${Date.now()}`, templateId: 'custom', custom: s, year, month: 0, intensity, target: cleanTarget(target) };
          this.send({ type: 'schedule', event: ev });
          this.timeline = [...this.timeline, ev];
          onScheduled();
          toast(`${s.name} scheduled for ${year}.`);
        } }, 'Schedule'),
      ),
    );
  }

  // ---------- Policy ----------
  private policyPanel() {
    const el = h('div', { class: 'pane' });
    const sliders: { key: string; el: HTMLElement & { setValue?: (v: number) => void }; get: (st: FrameState) => number }[] = [];
    const add = (key: string, label: string, low: string, high: string, get: (st: FrameState) => number, opts: { min?: number; max?: number; step?: number; fmt?: (v: number) => string } = {}) => {
      const st = this.state;
      const s = slider({ label, min: opts.min ?? 0, max: opts.max ?? 1, step: opts.step ?? 0.01, value: st ? get(st) : 0, low, high, fmt: opts.fmt ?? ((v) => v.toFixed(2)), onInput: (v) => this.send({ type: 'policy', key, value: v }) });
      sliders.push({ key, el: s, get });
      return s;
    };
    const S = (st: FrameState) => st.S;
    const pe = this.state?.S.politicsEndogenous ?? this.scenario.society.politicsEndogenous;
    el.append(
      this.scenario.real ? h('div', { class: 'card' },
        h('h3', {}, `Started from real data for ${this.scenario.real.name}`),
        h('p', { class: 'muted small' }, `The starting point was locked to researched data compiled ${this.scenario.real.asOf}. Anything you change here is a what-if experiment from that point on.`),
      ) : '',
      h('div', { class: 'card' },
        h('h3', {}, 'Who decides policy?'),
        toggle('Rulers set policy themselves', pe, (v) => this.send({ type: 'policy', key: 'politicsEndogenous', value: v })),
        h('p', { class: 'help' }, 'On: governments move taxes, welfare, the press and the use of force toward their own ideology over about four years, so your changes may be undone. Off: you are the government.'),
      ),
      h('div', { class: 'card' }, h('h3', {}, 'Institutions'),
        add('democracy', 'Democracy', 'Dictatorship', 'Full democracy', (st) => S(st).democracy),
        add('ruleOfLaw', 'Rule of law', 'Corrupt', 'Clean', (st) => S(st).ruleOfLaw),
        add('pressFreedom', 'Press freedom', 'Censored', 'Free', (st) => S(st).pressFreedom),
        add('repression', 'Repression of dissent', 'None', 'Brutal', (st) => S(st).repression),
        add('securityLoyalty', 'Army & police loyalty', 'Wavering', 'Loyal', (st) => S(st).securityLoyalty),
      ),
      h('div', { class: 'card' }, h('h3', {}, 'Economy & services'),
        add('marketFreedom', 'Market freedom', 'Planned', 'Free market', (st) => S(st).marketFreedom),
        add('taxRate', 'Tax rate', '0%', '60%', (st) => S(st).taxRate, { max: 0.6, fmt: (v) => `${Math.round(v * 100)}%` }),
        add('progressivity', 'Tax progressivity', 'Flat', 'Progressive', (st) => S(st).progressivity),
        add('welfare', 'Welfare & pensions', 'None', 'Generous', (st) => S(st).welfare),
        add('eduAccess', 'Access to education', 'Few', 'Everyone', (st) => S(st).eduAccess),
        add('healthSpend', 'Public health spending', 'Minimal', 'Universal', (st) => S(st).healthSpend),
        add('military', 'Military strength', 'Small', 'Large', (st) => S(st).military),
        add('policing', 'Policing', 'Light', 'Heavy', (st) => S(st).policing),
      ),
      h('div', { class: 'card' }, h('h3', {}, 'Society'),
        add('genderEquality', 'Gender equality', 'Patriarchal', 'Equal', (st) => S(st).genderEquality),
        add('contraception', 'Access to contraception', 'None', 'Universal', (st) => S(st).contraception),
        add('familyPlanning', 'Family-planning programmes', 'None', 'Strong', (st) => st.latest.familyPlanning ?? 0),
        add('minorityBias', 'Discrimination against minorities', 'None', 'Severe', (st) => S(st).minorityBias),
        add('immigration', 'Openness to immigrants', 'Closed', 'Open', (st) => S(st).immigration),
        add('collectivism', 'Collectivism', 'Individualist', 'Collectivist', (st) => S(st).collectivism),
        add('socialMedia', 'Social media use', 'None', 'Everyone', (st) => S(st).socialMedia, { fmt: (v) => `${Math.round(v * 100)}%` }),
        select('State and religion', [
          { value: 'neutral', label: 'Neutral' }, { value: 'favor', label: 'Favours one faith' }, { value: 'theocracy', label: 'Clerical rule' }, { value: 'suppress', label: 'Suppresses religion' },
        ], this.state?.S.religiousPolicy ?? 'neutral', (v) => this.send({ type: 'policy', key: 'religiousPolicy', value: v })),
        select('Favoured faith', this.scenario.population.faiths.map((f, i) => ({ value: String(i), label: f.name })), String(this.state?.S.favoredFaith ?? 0), (v) => this.send({ type: 'policy', key: 'favoredFaith', value: Number(v) })),
      ),
      h('div', { class: 'card' }, h('h3', {}, 'Trends pushed by media, schools and the state'),
        ...([
          ['consumerism', 'Consumerism', 'Frugality', 'Consumerism'],
          ['patriotism', 'Patriotism', 'Cosmopolitan', 'Patriotic'],
          ['religiosity', 'Religion', 'Secularize', 'Revival'],
          ['liberalism', 'Social values', 'Traditional', 'Liberal'],
          ['capitalism', 'Economy', 'Socialist', 'Capitalist'],
          ['authority', 'Authority', 'Question it', 'Obey it'],
          ['tolerance', 'Tolerance', 'Suspicion', 'Acceptance'],
        ] as const).map(([k, label, lo, hi]) => add(`trend.${k}`, label, lo, hi, (st) => st.S.trends[k], { min: -1, max: 1, step: 0.05, fmt: (v) => (v > 0 ? '+' : '') + v.toFixed(2) })),
      ),
    );
    const update = () => {
      const st = this.state;
      if (!st) return;
      for (const s of sliders) s.el.setValue?.(s.get(st));
    };
    return { el, update };
  }

  // ---------- People ----------
  private peoplePanel() {
    const el = h('div', { class: 'pane' });
    const update = () => {
      clear(el);
      const p = this.person;
      if (!p) {
        el.append(h('div', { class: 'card empty-state' },
          h('h3', {}, 'Meet the people'),
          h('p', {}, 'Click any dot on the map to meet that person: their personality, beliefs, family, friends and fortunes. Follow them to read their life story as it unfolds.'),
          h('button', { class: 'btn primary', onclick: () => this.randomPerson() }, 'Show me someone at random'),
        ));
        return;
      }
      const link = (s: { slot: number; name: string; alive?: boolean }) => h('button', { class: 'link', onclick: () => { this.send({ type: 'select', slot: s.slot }); } }, s.name + (s.alive === false ? ' †' : ''));
      el.append(h('div', { class: 'card person' },
        h('div', { class: 'person-head' },
          h('div', {},
            h('h2', {}, p.name, p.alive ? '' : ' †'),
            h('p', { class: 'muted' }, `${p.sex}, ${Math.floor(p.age)} · ${p.occupation} · ${p.settlement.replace(' (capital)', '')}`),
            h('p', { class: 'muted' }, h('i', { class: 'swatch', style: `background:${p.faithColor}` }), ` ${p.faith} · ${p.education.toFixed(0)} years of school · income $${compact(p.incomeYear)}/yr · wealth $${compact(p.wealth)}`),
          ),
          h('div', { class: 'col' },
            toggle('Follow their life', p.following, (v) => this.send({ type: 'follow', slot: p.slot, on: v })),
            h('button', { class: 'btn ghost small', onclick: () => this.randomPerson() }, 'Someone else'),
          ),
        ),
        p.flags.length ? h('div', { class: 'flags' }, ...p.flags.map((f) => h('span', { class: 'flag' }, f))) : null,
        p.leader ? h('p', { class: 'note' }, `Public figure: ${LEADER_STYLES[p.leader.style].label}. Charisma ${p.leader.charisma.toFixed(2)}, reach ${p.leader.reach.toFixed(2)}${p.leader.inPower ? ', currently in power' : ''}.`) : null,
        h('h3', {}, 'Personality'), traitBars(p.traits),
        h('h3', {}, 'Beliefs & values'), traitBars(p.values),
        h('h3', {}, 'How they are doing'), traitBars(p.state),
        h('h3', {}, 'Family & friends'),
        h('div', { class: 'family' },
          h('div', {}, h('span', { class: 'muted' }, 'Partner: '), p.partner ? link(p.partner) : 'none', p.partner && p.partner.alive ? h('span', { class: 'muted' }, ` · bond ${p.bond.toFixed(2)}`) : null),
          h('div', {}, h('span', { class: 'muted' }, 'Parents: '), ...(p.parents.length ? p.parents.map((x, i) => [i ? ', ' : '', link(x)]).flat() : ['unknown'])),
          h('div', {}, h('span', { class: 'muted' }, 'Children: '), ...(p.children.length ? p.children.map((x, i) => [i ? ', ' : '', link({ ...x, alive: true }), ` (${Math.floor(x.age)})`]).flat() : ['none'])),
          h('div', {}, h('span', { class: 'muted' }, 'Friends: '), ...(p.friends.length ? p.friends.map((x, i) => [i ? ', ' : '', link(x)]).flat() : ['none'])),
        ),
        h('h3', {}, 'Life story'),
        p.log.length
          ? h('ol', { class: 'life' }, ...[...p.log].reverse().map((e) => h('li', {}, h('b', {}, String(this.scenario.society.startYear + Math.floor(e.t / 12))), ' ', e.text)))
          : h('p', { class: 'muted' }, p.following ? 'Nothing has happened yet. Keep the simulation running.' : 'Turn on "Follow their life" to record what happens to them from now on.'),
      ));
    };
    return { el, update };
  }

  private randomPerson() {
    const st = this.state;
    if (!st) return;
    const x = 200 + Math.random() * 1200, y = 150 + Math.random() * 700;
    const s = this.settlements[Math.floor(Math.random() * Math.min(this.settlements.length, 12))];
    this.send({ type: 'pick', x: s ? s.x + (Math.random() - 0.5) * s.spread : x, y: s ? s.y + (Math.random() - 0.5) * s.spread : y, radius: 60 });
  }

  // ---------- Forecast ----------
  private forecastPanel() {
    const el = h('div', { class: 'pane' });
    const req = this.fcReq;
    const iv = this.fcIntervention;
    const ivTarget = iv.target;
    let metric = 'faith0';
    const status = h('p', { class: 'muted', 'aria-live': 'polite' });
    const results = h('div', {});
    const ivOpts = [{ value: '', label: 'No intervention (baseline only)' }, ...Object.entries(CATEGORY_LABELS).flatMap(([c, label]) => TEMPLATES.filter((t) => t.category === c).map((t) => ({ value: t.id, label: `${label} — ${t.name}` })))];
    const controls = h('div', { class: 'card' },
      h('h3', {}, 'Predict the future'),
      h('p', { class: 'muted' }, 'One run is one possible history. The forecast copies today\'s society, then plays out many futures with different luck, and shows the range of outcomes. Add an intervention to see how one change shifts the odds.'),
      h('div', { class: 'grid2 tight' },
        slider({ label: 'Years ahead', min: 5, max: 80, step: 1, value: req.years, onInput: (v) => { req.years = v; } }),
        slider({ label: 'Number of futures', min: 4, max: 40, step: 1, value: req.runs, onInput: (v) => { req.runs = v; } }),
        slider({ label: 'People per future', min: 3000, max: 60000, step: 1000, value: req.sample, fmt: (v) => compact(v), help: 'A representative sample (families kept together). More people = less noise, slower.', onInput: (v) => { req.sample = v; } }),
        toggle('Random events in the futures', req.randomEvents, (v) => { req.randomEvents = v; }),
      ),
      select('What if…', ivOpts, iv.id, (v) => { iv.id = v; }),
      slider({ label: 'Intervention intensity', min: 0.2, max: 2.5, step: 0.1, value: iv.intensity, fmt: (v) => `${v.toFixed(1)}×`, onInput: (v) => { iv.intensity = v; } }),
      this.targetControls(ivTarget),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => {
        req.intervention = iv.id ? { templateId: iv.id, intensity: iv.intensity, target: cleanTarget(ivTarget) } : null;
        this.forecast = null;
        this.forecastProgress = 'Copying the society…';
        this.send({ type: 'forecast', request: { ...req } });
        update();
      } }, 'Run forecast')),
      status,
    );
    el.append(controls, results);
    const update = () => {
      status.textContent = this.forecastProgress;
      clear(results);
      const r = this.forecast;
      if (!r) {
        if (!this.forecastProgress) results.append(h('p', { class: 'empty' }, 'No forecast yet. Forecasts run in the background while the simulation continues.'));
        return;
      }
      const branches = [r.baseline, ...(r.intervention ? [r.intervention] : [])];
      const labels: Record<string, string> = {
        revolution: 'Revolution', coup: 'Military coup', civilWar: 'Civil war', war: 'War with a neighbour', terror: 'Terror attacks',
        recession: 'At least one recession', democracyEnd: 'A democracy at the end', autocracyEnd: 'A dictatorship at the end', popDecline: 'Population shrinks',
      };
      const table = h('table', { class: 'odds' },
        h('thead', {}, h('tr', {}, h('th', {}, `Chance within ${r.years} years`), ...branches.map((b) => h('th', {}, b.label)))),
        h('tbody', {}, ...Object.keys(labels).map((k) => h('tr', {}, h('td', {}, labels[k]), ...branches.map((b) => h('td', {}, `${Math.round((b.outcomes[k] ?? 0) * 100)}%`))))),
      );
      // which groups and ideologies grow
      const end = r.years;
      const endYear = r.startYear + r.years;
      const range = (b: number[] | undefined) => (b ? `${pct1(b[1])} (${pct1(b[0]).replace('%', '')}–${pct1(b[2])})` : '–');
      const p = (v: number | undefined) => `${Math.round((v ?? 0) * 100)}%`;
      const gOrder = r.faithStart.map((_, i) => i).sort((a, b) => r.faithStart[b] - r.faithStart[a]);
      // one value per branch: the baseline, and below it the value with the intervention
      const both = (fn: (b: typeof branches[number]) => string): HTMLElement | string => branches.length === 1 ? fn(branches[0])
        : h('span', { class: 'two' }, h('span', {}, fn(branches[0])), h('span', { class: 'alt' }, fn(branches[1])));
      const overtakeText = (b: typeof branches[number], i: number) => { const o = b.faithOvertake[i]; return o && o.prob > 0 ? `${p(o.prob)}${o.medianYear ? ` (~${o.medianYear})` : ''}` : '–'; };
      const groupTable = h('table', { class: 'odds groups-table' },
        h('thead', {}, h('tr', {},
          h('th', {}, 'Group'), h('th', {}, 'Today'),
          h('th', { title: 'Median share, with the range 8 in 10 futures fall into' }, `In ${endYear}`),
          h('th', { title: 'Share of futures in which the group\'s share grows' }, 'Grows'),
          h('th', { title: 'Share of futures in which it is the largest group at the end' }, 'Largest'),
          h('th', { title: 'Share of futures in which it holds over half the population at the end' }, 'Majority'),
          h('th', { title: 'Share of futures in which it overtakes today\'s largest group, and the median year' }, 'Overtakes'),
        )),
        h('tbody', {}, ...gOrder.map((i) => h('tr', {},
          h('td', {}, h('span', { class: 'bar-label' }, h('i', { style: `background:${r.faithColors[i]}` }), r.faithNames[i])),
          h('td', {}, pct1(r.faithStart[i])),
          h('td', {}, both((b) => range(b.bands['faith' + i]?.[end]))),
          h('td', {}, both((b) => p(b.faithGrows[i]))),
          h('td', {}, both((b) => p(b.faithLargest[i]))),
          h('td', {}, both((b) => p(b.faithMajority[i]))),
          h('td', {}, both((b) => overtakeText(b, i))),
        ))),
      );
      const cOrder = r.campStart.map((_, k) => k).sort((a, b) => r.campStart[b] - r.campStart[a]);
      const campTable = h('table', { class: 'odds groups-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Ideology'), h('th', {}, 'Today'), h('th', {}, `In ${endYear}`), h('th', { title: 'Share of futures in which this camp is the largest at the end' }, 'Leads at the end'))),
        h('tbody', {}, ...cOrder.map((k) => h('tr', {},
          h('td', {}, h('span', { class: 'bar-label' }, h('i', { style: `background:${CAMPS[k].color}` }), CAMPS[k].label)),
          h('td', {}, pct1(r.campStart[k])),
          h('td', {}, both((b) => range(b.bands['camp' + k]?.[end]))),
          h('td', {}, both((b) => p(b.campLargest[k]))),
        ))),
      );
      results.append(
        h('div', { class: 'card' },
          h('h3', {}, `Which groups grow by ${endYear}`),
          h('p', { class: 'muted small' }, `${r.runs} futures, each with ${compact(r.sample)} representative people. Shares are medians with the range 8 in 10 futures fall into; the other columns are shares of futures.${branches.length > 1 ? ' In each cell the top line is the baseline and the coloured line is with the intervention.' : ''}`),
          h('div', { class: 'table-wrap' }, groupTable),
        ),
        h('div', { class: 'card' }, h('h3', {}, `Which ideology leads by ${endYear}`), h('div', { class: 'table-wrap' }, campTable)),
        h('div', { class: 'card' },
          h('h3', {}, `${r.runs} futures from ${r.startYear} to ${endYear}`),
          h('p', { class: 'muted small' }, `Percentages are shares of futures.`),
          h('div', { class: 'table-wrap' }, table),
        ),
      );
      const metricChips = h('div', { class: 'chips' });
      const fanHost = h('div', {});
      const fan = new FanChart(fanHost, 170);
      const metricLabel = (k: string) => k.startsWith('faith') ? r.faithNames[Number(k.slice(5))] : k.startsWith('camp') ? CAMPS[Number(k.slice(4))].label : SERIES_BY_KEY[k]?.label ?? k;
      const metricKeys = [...r.faithNames.map((_, i) => 'faith' + i), ...CAMPS.map((_, k) => 'camp' + k), ...FORECAST_KEYS];
      if (!metricKeys.includes(metric)) metric = 'faith0';
      const draw = () => {
        clear(metricChips);
        for (const k of metricKeys) {
          metricChips.append(h('button', { class: 'chip-btn' + (k === metric ? ' on' : ''), 'aria-pressed': k === metric ? 'true' : 'false', onclick: () => { metric = k; draw(); } }, metricLabel(k)));
        }
        const fmt = metric.startsWith('faith') || metric.startsWith('camp') ? 'pct1' : SERIES_BY_KEY[metric]?.fmt ?? 'num2';
        fan.set(r.baseline.years, branches.map((b, i) => ({ label: b.label, bands: b.bands[metric], color: seriesColor(i === 0 ? 0 : 1) })), fmt);
      };
      results.append(h('div', { class: 'card' }, h('h3', {}, 'Range of outcomes'), h('p', { class: 'muted small' }, 'Line: the median future. Band: 8 in 10 futures fall inside it.'), metricChips, fanHost));
      draw();
      for (const b of branches) {
        const regimes = Object.entries(b.regimes).sort((a, c) => c[1] - a[1]);
        results.append(h('div', { class: 'card' },
          h('h3', {}, `${b.label}: how it often goes`),
          h('div', { class: 'glance' }, ...regimes.map(([k, v]) => h('div', { class: 'gl' }, h('span', { class: 'muted' }, `Ends as ${k.toLowerCase()}`), h('b', {}, `${Math.round(v * 100)}%`)))),
          h('ul', { class: 'top-events' }, ...b.topEvents.slice(0, 8).map((e) => h('li', {}, h('b', {}, `${Math.round(e.share * 100)}%`), ' of futures: ', e.text))),
        ));
      }
    };
    return { el, update };
  }

  // ---------- Chronicle ----------
  private chroniclePanel() {
    const el = h('div', { class: 'pane' });
    const chips = h('div', { class: 'chips' });
    const list = h('ol', { class: 'chronicle' });
    const cats = [['all', 'All'], ['politics', 'Politics'], ['economy', 'Economy'], ['conflict', 'Conflict'], ['health', 'Health'], ['faith', 'Faith'], ['people', 'People'], ['society', 'Society'], ['nature', 'Nature']];
    const renderChips = () => {
      clear(chips);
      for (const [k, label] of cats) chips.append(h('button', { class: 'chip-btn' + (k === this.newsFilter ? ' on' : ''), 'aria-pressed': k === this.newsFilter ? 'true' : 'false', onclick: () => { this.newsFilter = k; renderChips(); update(); } }, label));
    };
    renderChips();
    el.append(h('div', { class: 'card' }, h('h3', {}, 'Chronicle'), h('p', { class: 'muted' }, 'Everything notable that has happened, newest first.'), chips, list));
    let shown = -1;
    const update = () => {
      if (shown === this.news.length && list.dataset.filter === this.newsFilter) return;
      shown = this.news.length;
      list.dataset.filter = this.newsFilter;
      clear(list);
      const start = this.scenario.society.startYear;
      const items = this.news.filter((n) => this.newsFilter === 'all' || n.cat === this.newsFilter).slice(-300).reverse();
      for (const n of items) list.append(h('li', { class: `lvl${n.level} cat-${n.cat}` }, h('span', { class: 'when' }, `${start + Math.floor(n.t / 12)} · ${MONTHS[n.t % 12]}`), h('span', { class: 'what' }, n.text)));
      if (!items.length) list.append(h('li', { class: 'empty' }, 'Nothing yet.'));
    };
    return { el, update };
  }
}

// ------------------------------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pct1(v: number): string {
  return isFinite(v) ? `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%` : '–';
}

function describeRate(name: string, rate: number, tfr: number, medianAge: number): string {
  const r = `${rate >= 0 ? '+' : '−'}${Math.abs(rate * 100).toFixed(1)}% a year`;
  const why = [isFinite(tfr) ? `${tfr.toFixed(1)} children per woman` : '', isFinite(medianAge) ? `median age ${medianAge.toFixed(0)}` : ''].filter(Boolean).join(', ');
  return `${name}: ${r}${why ? ` (${why})` : ''}.`;
}

/** Yearly growth rate of each group's numbers (and of the whole population) over the last ten years of history. */
function groupGrowth(histT: number[], hist: Record<string, number[]>, K: number): { rate: number[]; total: number; years: number } | null {
  const n = histT.length;
  if (n < 2) return null;
  const tNow = histT[n - 1];
  if (tNow < 24) return null;
  let j = n - 1;
  while (j > 0 && histT[j - 1] >= tNow - 120) j--;
  const years = (tNow - histT[j]) / 12;
  if (years < 2) return null;
  const pop = hist.pop ?? [];
  const p0 = pop[j], p1 = pop[n - 1];
  if (!(p0 > 0 && p1 > 0)) return null;
  const rate: number[] = [];
  for (let f = 0; f < K; f++) {
    const s = hist['faith' + f] ?? [];
    const a = s[j] * p0, b = s[n - 1] * p1;
    rate.push(a > 0 && b > 0 ? Math.pow(b / a, 1 / years) - 1 : b > 0 ? 0.05 : -0.05);
  }
  return { rate, total: Math.pow(p1 / p0, 1 / years) - 1, years: Math.round(years) };
}

/** Straight-line extrapolation of group shares at constant growth rates. */
function projectShares(shares: number[], rate: number[], _total: number, years: number): { shares: number[][]; overtake: { who: number; years: number } | null } {
  const out: number[][] = [];
  let cur = [...shares];
  const leader = shares.indexOf(Math.max(...shares));
  let overtake: { who: number; years: number } | null = null;
  for (let y = 0; y <= years; y++) {
    out.push(cur);
    if (!overtake) {
      for (let i = 0; i < cur.length; i++) if (i !== leader && cur[i] > cur[leader]) { overtake = { who: i, years: y }; break; }
    }
    const next = cur.map((s, i) => s * (1 + rate[i]));
    const tot = next.reduce((a, b) => a + b, 0) || 1;
    cur = next.map((v) => v / tot);
  }
  return { shares: out, overtake };
}

function meterRow(label: string, v: number, text: string, cls = ''): HTMLElement {
  const m = meter(v, cls);
  return h('div', { class: 'meter-row' }, h('div', { class: 'meter-head' }, h('span', {}, label), h('b', {}, text)), m);
}

function cell(label: string, v: number): HTMLElement {
  return h('span', { class: 'fs-cell' }, h('span', { class: 'muted' }, `${label} `), h('b', {}, v.toFixed(2)));
}

function traitBars(obj: Record<string, number>): HTMLElement {
  const box = h('div', { class: 'traits' });
  for (const [k, v] of Object.entries(obj)) {
    const m = meter(v, 'thin');
    box.append(h('div', { class: 'trait' }, h('span', {}, k), m, h('b', {}, v.toFixed(2))));
  }
  return box;
}

function leaderRow(l: Leader, st: FrameState, onClick: () => void): HTMLElement {
  const years = Math.max(0, Math.round((st.t - l.start) / 12));
  return h('button', { class: 'leader', onclick: onClick },
    h('span', { class: 'leader-name' }, l.name, l.inPower ? h('span', { class: 'badge' }, 'in power') : null),
    h('span', { class: 'muted small' }, `${LEADER_STYLES[l.style].label} · ${years} yrs active · reach ${Math.round(l.reach * 100)}%`),
  );
}

function cleanTarget(t: Target): Target | undefined {
  const out: Target = {};
  for (const [k, v] of Object.entries(t)) if (v !== undefined && v !== '') (out as Record<string, unknown>)[k] = v;
  return Object.keys(out).length ? out : undefined;
}

export function cycleTheme() {
  const root = document.documentElement;
  const cur = root.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : cur === 'light' ? null : 'dark';
  if (next) root.setAttribute('data-theme', next); else root.removeAttribute('data-theme');
  try { if (next) localStorage.setItem('hs-theme', next); else localStorage.removeItem('hs-theme'); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event('themechange'));
}

void setMeter;
