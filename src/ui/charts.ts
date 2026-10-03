// Small canvas charts, theme-aware (colors come from CSS tokens at draw time).
// Line charts and fan charts get a hover crosshair + tooltip; every multi-series chart has a legend.

import { cssVar, h } from './dom';
import { fmtValue, type Fmt } from '../sim/stats';

export function seriesColor(i: number): string {
  return cssVar(`--series-${(i % 8) + 1}`) || '#3987e5';
}

interface Base {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
}

function setup(host: HTMLElement, height: number): Base & { tip: HTMLElement } {
  const wrap = h('div', { class: 'chart-wrap' });
  wrap.style.height = `${height}px`;
  const canvas = h('canvas', { class: 'chart', role: 'img' });
  const tip = h('div', { class: 'chart-tip', hidden: true });
  wrap.append(canvas, tip);
  host.append(wrap);
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx, w: 0, h: height, tip };
}

function size(b: Base): number {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = b.canvas.getBoundingClientRect();
  b.w = Math.max(50, rect.width);
  b.h = Math.max(40, rect.height);
  if (b.canvas.width !== Math.round(b.w * dpr) || b.canvas.height !== Math.round(b.h * dpr)) {
    b.canvas.width = Math.round(b.w * dpr);
    b.canvas.height = Math.round(b.h * dpr);
  }
  b.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  b.ctx.clearRect(0, 0, b.w, b.h);
  return dpr;
}

function niceTicks(lo: number, hi: number, n = 4): number[] {
  if (!isFinite(lo) || !isFinite(hi)) return [];
  if (hi - lo < 1e-9) { hi = lo + 1; }
  const raw = (hi - lo) / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

const FONT = '11px "IBM Plex Sans", system-ui, sans-serif';
const MONO = '10.5px "IBM Plex Mono", ui-monospace, monospace';

export interface LineSeries {
  label: string;
  values: ArrayLike<number>;
  color?: string;
  dashed?: boolean;
}

/** Multi-series time chart with crosshair. x values are fractional years. */
export class LineChart {
  private b: Base & { tip: HTMLElement };
  private legend: HTMLElement;
  private x: ArrayLike<number> = [];
  private series: LineSeries[] = [];
  private fmt: Fmt = 'num2';
  private hover = -1;
  private y0 = 0;
  private y1 = 1;
  private pad = { l: 48, r: 12, t: 10, b: 22 };
  private zeroBased: boolean;
  private stacked: boolean;

  constructor(host: HTMLElement, height = 180, opts: { zeroBased?: boolean; stacked?: boolean } = {}) {
    this.b = setup(host, height);
    this.legend = h('div', { class: 'legend' });
    host.append(this.legend);
    this.zeroBased = !!opts.zeroBased;
    this.stacked = !!opts.stacked;
    this.b.canvas.addEventListener('pointermove', (e) => {
      const r = this.b.canvas.getBoundingClientRect();
      this.hover = this.indexAt(e.clientX - r.left);
      this.draw();
    });
    this.b.canvas.addEventListener('pointerleave', () => { this.hover = -1; this.b.tip.hidden = true; this.draw(); });
    new ResizeObserver(() => this.draw()).observe(this.b.canvas);
  }

  set(x: ArrayLike<number>, series: LineSeries[], fmt: Fmt) {
    this.x = x;
    this.series = series;
    this.fmt = fmt;
    this.legend.replaceChildren(
      ...(series.length >= 2 ? series.map((s, i) => h('span', { class: 'lg' }, h('i', { style: `background:${s.color ?? seriesColor(i)}` }), s.label)) : []),
    );
    this.draw();
  }

  private indexAt(px: number): number {
    const n = this.x.length;
    if (n < 2) return -1;
    const { l, r } = this.pad;
    const t = (px - l) / (this.b.w - l - r);
    const x0 = this.x[0], x1 = this.x[n - 1];
    const xv = x0 + t * (x1 - x0);
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.x[m] < xv) lo = m; else hi = m; }
    return Math.abs(this.x[lo] - xv) < Math.abs(this.x[hi] - xv) ? lo : hi;
  }

  draw() {
    const b = this.b;
    size(b);
    const ctx = b.ctx;
    const n = this.x.length;
    const { l, r, t, b: pb } = this.pad;
    const W = b.w - l - r, H = b.h - t - pb;
    const ink2 = cssVar('--fg-2'), muted = cssVar('--muted'), grid = cssVar('--line-soft'), axis = cssVar('--line');
    if (n < 2) {
      ctx.fillStyle = muted;
      ctx.font = FONT;
      ctx.fillText('Collecting data…', l, t + 20);
      return;
    }
    let lo = Infinity, hi = -Infinity;
    if (this.stacked) {
      lo = 0; hi = 0;
      for (let i = 0; i < n; i++) { let s = 0; for (const se of this.series) s += se.values[i] || 0; hi = Math.max(hi, s); }
    } else {
      for (const s of this.series) for (let i = 0; i < n; i++) { const v = s.values[i]; if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (this.zeroBased) lo = Math.min(0, lo);
    const span = hi - lo || Math.abs(hi) || 1;
    lo -= this.zeroBased ? 0 : span * 0.08;
    hi += span * 0.08;
    this.y0 = lo; this.y1 = hi;
    const X = (i: number) => l + ((this.x[i] - this.x[0]) / (this.x[n - 1] - this.x[0] || 1)) * W;
    const Y = (v: number) => t + H - ((v - lo) / (hi - lo)) * H;
    // grid
    ctx.font = MONO;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of niceTicks(lo, hi, 4)) {
      const y = Math.round(Y(v)) + 0.5;
      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(l, y); ctx.lineTo(l + W, y); ctx.stroke();
      ctx.fillStyle = muted;
      ctx.fillText(fmtValue(v, this.fmt), l - 6, y);
    }
    // x axis (years)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xt = niceTicks(this.x[0], this.x[n - 1], Math.max(2, Math.floor(W / 70)));
    for (const v of xt) {
      if (v < this.x[0] || v > this.x[n - 1]) continue;
      const x = l + ((v - this.x[0]) / (this.x[n - 1] - this.x[0] || 1)) * W;
      ctx.fillStyle = muted;
      ctx.fillText(String(Math.round(v)), x, t + H + 6);
    }
    ctx.strokeStyle = axis;
    ctx.beginPath(); ctx.moveTo(l, t + H + 0.5); ctx.lineTo(l + W, t + H + 0.5); ctx.stroke();
    // series
    const step = Math.max(1, Math.floor(n / (W * 1.5)));
    if (this.stacked) {
      const base = new Float64Array(n);
      this.series.forEach((s, si) => {
        const col = s.color ?? seriesColor(si);
        ctx.beginPath();
        for (let i = 0; i < n; i += step) ctx.lineTo(X(i), Y(base[i] + (s.values[i] || 0)));
        ctx.lineTo(X(n - 1), Y(base[n - 1] + (s.values[n - 1] || 0)));
        for (let i = n - 1; i >= 0; i -= step) ctx.lineTo(X(i), Y(base[i]));
        ctx.lineTo(X(0), Y(base[0]));
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = cssVar('--surface');
        ctx.lineWidth = 1;
        ctx.stroke();
        for (let i = 0; i < n; i++) base[i] += s.values[i] || 0;
      });
    } else {
      this.series.forEach((s, si) => {
        const col = s.color ?? seriesColor(si);
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.setLineDash(s.dashed ? [5, 4] : []);
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < n; i += step) {
          const v = s.values[i];
          if (!isFinite(v)) { started = false; continue; }
          if (!started) { ctx.moveTo(X(i), Y(v)); started = true; } else ctx.lineTo(X(i), Y(v));
        }
        const lv = s.values[n - 1];
        if (isFinite(lv)) ctx.lineTo(X(n - 1), Y(lv));
        ctx.stroke();
        ctx.setLineDash([]);
        if (isFinite(lv)) {
          ctx.beginPath();
          ctx.arc(X(n - 1), Y(lv), 4, 0, Math.PI * 2);
          ctx.fillStyle = col;
          ctx.fill();
          ctx.strokeStyle = cssVar('--surface');
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });
    }
    // hover
    if (this.hover >= 0 && this.hover < n) {
      const x = X(this.hover);
      ctx.strokeStyle = ink2;
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(x + 0.5, t); ctx.lineTo(x + 0.5, t + H); ctx.stroke();
      ctx.globalAlpha = 1;
      const rows = this.series.map((s, si) => {
        const v = s.values[this.hover];
        return `<div class="tr"><i style="background:${s.color ?? seriesColor(si)}"></i><span>${s.label}</span><b>${fmtValue(v, this.fmt)}</b></div>`;
      });
      const yr = this.x[this.hover];
      const month = Math.round((yr - Math.floor(yr)) * 12);
      b.tip.innerHTML = `<div class="th">${Math.floor(yr)}${month ? ' · month ' + (month + 1) : ''}</div>${rows.join('')}`;
      b.tip.hidden = false;
      const tw = b.tip.offsetWidth;
      b.tip.style.left = `${Math.min(b.w - tw - 4, Math.max(4, x + 10))}px`;
      b.tip.style.top = `${t}px`;
    }
  }
}

/** Population pyramid: 5-year bands, men left, women right. */
export function drawPyramid(canvas: HTMLCanvasElement, male: number[], female: number[]) {
  const b = { canvas, ctx: canvas.getContext('2d')!, w: 0, h: 0 };
  size(b);
  const ctx = b.ctx;
  const n = male.length;
  const max = Math.max(1, ...male, ...female);
  const mid = b.w / 2, pad = 30, H = b.h - 16;
  const bh = H / n;
  ctx.font = MONO;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const y = H - (i + 1) * bh + 1;
    const wm = (male[i] / max) * (mid - pad - 4);
    const wf = (female[i] / max) * (mid - pad - 4);
    ctx.fillStyle = seriesColor(0);
    ctx.fillRect(mid - pad / 2 - wm, y, wm, bh - 2);
    ctx.fillStyle = seriesColor(1);
    ctx.fillRect(mid + pad / 2, y, wf, bh - 2);
    if (i % 2 === 0) { ctx.fillStyle = cssVar('--muted'); ctx.fillText(i === n - 1 ? '100+' : String(i * 5), mid, y + bh / 2); }
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = cssVar('--fg-2');
  ctx.font = FONT;
  ctx.fillText('Men', 4, b.h - 6);
  ctx.textAlign = 'right';
  ctx.fillText('Women', b.w - 4, b.h - 6);
}

/** Opinion map: density of adults by social (x) and economic (y) values, with party positions. */
export function drawCompass(canvas: HTMLCanvasElement, grid: number[], parties: { x: number; y: number; color: string; name: string }[]) {
  const b = { canvas, ctx: canvas.getContext('2d')!, w: 0, h: 0 };
  size(b);
  const ctx = b.ctx;
  const N = 24;
  const pad = { l: 20, r: 6, t: 6, b: 20 };
  const W = b.w - pad.l - pad.r, H = b.h - pad.t - pad.b;
  const max = Math.max(1, ...grid);
  const c = hexRgb(cssVar('--accent-2') || '#7cb7ff');
  ctx.fillStyle = cssVar('--surface-2');
  ctx.fillRect(pad.l, pad.t, W, H);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = grid[y * N + x] / max;
    if (v <= 0) continue;
    ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${Math.min(1, 0.08 + Math.sqrt(v) * 0.92)})`;
    ctx.fillRect(pad.l + (x / N) * W, pad.t + H - ((y + 1) / N) * H, W / N + 0.5, H / N + 0.5);
  }
  ctx.strokeStyle = cssVar('--line');
  ctx.beginPath(); ctx.moveTo(pad.l + W / 2, pad.t); ctx.lineTo(pad.l + W / 2, pad.t + H); ctx.moveTo(pad.l, pad.t + H / 2); ctx.lineTo(pad.l + W, pad.t + H / 2); ctx.stroke();
  for (const p of parties) {
    const px = pad.l + p.x * W, py = pad.t + H - p.y * H;
    ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fillStyle = p.color; ctx.fill();
    ctx.strokeStyle = cssVar('--surface'); ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.fillStyle = cssVar('--muted');
  ctx.font = FONT;
  ctx.textAlign = 'left';
  ctx.fillText('Traditional', pad.l, b.h - 5);
  ctx.textAlign = 'right';
  ctx.fillText('Progressive', pad.l + W, b.h - 5);
  ctx.save();
  ctx.translate(11, pad.t + H);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'left';
  ctx.fillText('Redistribute', 0, 0);
  ctx.textAlign = 'right';
  ctx.fillText('Free market', H, 0);
  ctx.restore();
}

export function sparkline(canvas: HTMLCanvasElement, values: number[], color: string) {
  const b = { canvas, ctx: canvas.getContext('2d')!, w: 0, h: 0 };
  size(b);
  const ctx = b.ctx;
  const v = values.filter((x) => isFinite(x));
  if (v.length < 2) return;
  let lo = Math.min(...v), hi = Math.max(...v);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const X = (i: number) => 1 + (i / (v.length - 1)) * (b.w - 6);
  const Y = (x: number) => b.h - 3 - ((x - lo) / (hi - lo)) * (b.h - 6);
  ctx.beginPath();
  v.forEach((x, i) => (i ? ctx.lineTo(X(i), Y(x)) : ctx.moveTo(X(i), Y(x))));
  ctx.lineTo(X(v.length - 1), b.h);
  ctx.lineTo(X(0), b.h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.12;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  v.forEach((x, i) => (i ? ctx.lineTo(X(i), Y(x)) : ctx.moveTo(X(i), Y(x))));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(X(v.length - 1), Y(v[v.length - 1]), 2.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/** Forecast fan: p10–p90 band + median line per branch. */
export class FanChart {
  private b: Base & { tip: HTMLElement };
  private legend: HTMLElement;
  private years: number[] = [];
  private branches: { label: string; bands: number[][]; color: string }[] = [];
  private fmt: Fmt = 'num2';
  private hover = -1;

  constructor(host: HTMLElement, height = 150) {
    this.b = setup(host, height);
    this.legend = h('div', { class: 'legend' });
    host.append(this.legend);
    this.b.canvas.addEventListener('pointermove', (e) => {
      const r = this.b.canvas.getBoundingClientRect();
      const t = (e.clientX - r.left - 48) / (this.b.w - 60);
      this.hover = Math.round(t * (this.years.length - 1));
      this.draw();
    });
    this.b.canvas.addEventListener('pointerleave', () => { this.hover = -1; this.b.tip.hidden = true; this.draw(); });
    new ResizeObserver(() => this.draw()).observe(this.b.canvas);
  }

  set(years: number[], branches: { label: string; bands: number[][]; color: string }[], fmt: Fmt) {
    this.years = years;
    this.branches = branches;
    this.fmt = fmt;
    this.legend.replaceChildren(...(branches.length >= 2 ? branches.map((br) => h('span', { class: 'lg' }, h('i', { style: `background:${br.color}` }), br.label)) : []));
    this.draw();
  }

  draw() {
    const b = this.b;
    size(b);
    const ctx = b.ctx;
    const n = this.years.length;
    if (n < 2) return;
    const pad = { l: 48, r: 12, t: 8, b: 20 };
    const W = b.w - pad.l - pad.r, H = b.h - pad.t - pad.b;
    let lo = Infinity, hi = -Infinity;
    for (const br of this.branches) for (const v of br.bands) for (const x of v) if (isFinite(x)) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
    if (!isFinite(lo)) return;
    const span = hi - lo || Math.abs(hi) || 1;
    lo -= span * 0.08; hi += span * 0.08;
    const X = (i: number) => pad.l + (i / (n - 1)) * W;
    const Y = (v: number) => pad.t + H - ((v - lo) / (hi - lo)) * H;
    ctx.font = MONO;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of niceTicks(lo, hi, 3)) {
      const y = Math.round(Y(v)) + 0.5;
      ctx.strokeStyle = cssVar('--line-soft');
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + W, y); ctx.stroke();
      ctx.fillStyle = cssVar('--muted');
      ctx.fillText(fmtValue(v, this.fmt), pad.l - 6, y);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const i of [0, Math.floor((n - 1) / 2), n - 1]) { ctx.fillStyle = cssVar('--muted'); ctx.fillText(String(this.years[i]), X(i), pad.t + H + 5); }
    for (const br of this.branches) {
      ctx.beginPath();
      br.bands.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v[2])) : ctx.moveTo(X(i), Y(v[2]))));
      for (let i = n - 1; i >= 0; i--) ctx.lineTo(X(i), Y(br.bands[i][0]));
      ctx.closePath();
      ctx.fillStyle = br.color;
      ctx.globalAlpha = 0.16;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      br.bands.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v[1])) : ctx.moveTo(X(i), Y(v[1]))));
      ctx.strokeStyle = br.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (this.hover >= 0 && this.hover < n) {
      const x = X(this.hover);
      ctx.strokeStyle = cssVar('--fg-2');
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(x + 0.5, pad.t); ctx.lineTo(x + 0.5, pad.t + H); ctx.stroke();
      ctx.globalAlpha = 1;
      b.tip.innerHTML = `<div class="th">${this.years[this.hover]}</div>` + this.branches.map((br) => {
        const v = br.bands[this.hover];
        return `<div class="tr"><i style="background:${br.color}"></i><span>${br.label}</span><b>${fmtValue(v[1], this.fmt)}</b></div><div class="tr sub"><span>likely range</span><b>${fmtValue(v[0], this.fmt)} – ${fmtValue(v[2], this.fmt)}</b></div>`;
      }).join('');
      b.tip.hidden = false;
      b.tip.style.left = `${Math.min(b.w - b.tip.offsetWidth - 4, Math.max(4, x + 10))}px`;
      b.tip.style.top = `${pad.t}px`;
    }
  }
}

function hexRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '');
  const v = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
