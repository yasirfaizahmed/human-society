// GPU renderer for the population. Every person is one point sprite; positions arrive from the
// worker as normalized uint16 pairs and lens values as one byte each, so a million people cost
// 5 MB per frame to upload and a single draw call to render.

import { WORLD_H, WORLD_W } from '../sim/constants';
import type { Settlement } from '../sim/world';

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
layout(location=1) in uint a_val;
uniform vec2 u_center;
uniform vec2 u_scale;
uniform float u_size;
uniform sampler2D u_pal;
flat out vec4 v_col;
void main() {
  if (a_val == 0u) { gl_Position = vec4(2.0, 2.0, 0.0, 1.0); gl_PointSize = 0.0; v_col = vec4(0.0); return; }
  vec2 w = a_pos * vec2(${WORLD_W.toFixed(1)}, ${WORLD_H.toFixed(1)});
  vec2 p = (w - u_center) * u_scale;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
  v_col = texelFetch(u_pal, ivec2(int(a_val), 0), 0);
  gl_PointSize = u_size * (v_col.a < 0.6 ? 0.8 : 1.0);
}`;

const FS = `#version 300 es
precision mediump float;
flat in vec4 v_col;
uniform float u_alpha;
uniform float u_round;
out vec4 o;
void main() {
  if (u_round > 0.5) {
    vec2 d = gl_PointCoord - 0.5;
    float r = dot(d, d);
    if (r > 0.25) discard;
    float edge = smoothstep(0.25, 0.16, r);
    o = vec4(v_col.rgb, v_col.a * u_alpha * edge);
  } else {
    o = vec4(v_col.rgb, v_col.a * u_alpha);
  }
}`;

export interface MapCallbacks {
  onPick: (x: number, y: number, radius: number) => void;
}

export class PopulationMap {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private overlay: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private prog: WebGLProgram | null = null;
  private posBuf: WebGLBuffer | null = null;
  private valBuf: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private palTex: WebGLTexture | null = null;
  private count = 0;
  private uni: Record<string, WebGLUniformLocation | null> = {};
  // view
  cx = WORLD_W / 2;
  cy = WORLD_H / 2;
  zoom = 1;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private live = 1;
  // data kept for the 2D fallback and overlay
  private positions: Uint16Array | null = null;
  private values: Uint8Array | null = null;
  private palette: Uint8Array = new Uint8Array(256 * 4);
  settlements: Settlement[] = [];
  nCities = 0;
  settlementPop: number[] = [];
  settlementProtest: number[] = [];
  selected: { x: number; y: number } | null = null;
  private dirty = true;
  private raf = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private dragStart: { x: number; y: number; cx: number; cy: number } | null = null;
  private moved = false;
  private pinchDist = 0;
  private cb: MapCallbacks;
  readonly gpu: boolean;

  constructor(cb: MapCallbacks) {
    this.cb = cb;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'map-gl';
    this.overlay = document.createElement('canvas');
    this.overlay.className = 'map-overlay';
    this.el = document.createElement('div');
    this.el.className = 'map-canvas-wrap';
    this.el.append(this.canvas, this.overlay);
    this.gpu = this.initGL();
    if (!this.gpu) this.ctx2d = this.canvas.getContext('2d');
    this.bindInput();
    new ResizeObserver(() => this.resize()).observe(this.el);
    const frame = () => {
      if (this.dirty) this.draw();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
  }

  private initGL(): boolean {
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = this.canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, alpha: true });
    } catch {
      gl = null;
    }
    if (!gl) return false;
    const compile = (type: number, src: string) => {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    try {
      const p = gl.createProgram()!;
      gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
      this.prog = p;
    } catch (e) {
      console.warn('WebGL2 shader failed, using 2D fallback', e);
      return false;
    }
    this.gl = gl;
    for (const u of ['u_center', 'u_scale', 'u_size', 'u_pal', 'u_alpha', 'u_round']) this.uni[u] = gl.getUniformLocation(this.prog!, u);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.UNSIGNED_SHORT, true, 0, 0);
    this.valBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.valBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribIPointer(1, 1, gl.UNSIGNED_BYTE, 0, 0);
    gl.bindVertexArray(null);
    this.palTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return true;
  }

  setPalette(pal: Uint8Array) {
    this.palette = pal;
    const gl = this.gl;
    if (gl) {
      gl.bindTexture(gl.TEXTURE_2D, this.palTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pal);
    }
    this.dirty = true;
  }

  setData(positions: Uint16Array, values: Uint8Array, live: number) {
    this.positions = positions;
    this.values = values;
    this.count = values.length;
    this.live = Math.max(1, live);
    const gl = this.gl;
    if (gl) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.valBuf);
      gl.bufferData(gl.ARRAY_BUFFER, values, gl.DYNAMIC_DRAW);
    }
    this.dirty = true;
  }

  invalidate() {
    this.dirty = true;
  }

  private resize() {
    const r = this.el.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    for (const c of [this.canvas, this.overlay]) {
      c.width = Math.round(this.w * this.dpr);
      c.height = Math.round(this.h * this.dpr);
    }
    this.dirty = true;
  }

  /** Pixels per world unit at the current zoom. */
  private ppu(): number {
    return Math.min(this.w / WORLD_W, this.h / WORLD_H) * this.zoom;
  }

  worldFromScreen(sx: number, sy: number): { x: number; y: number } {
    const k = this.ppu();
    return { x: this.cx + (sx - this.w / 2) / k, y: this.cy + (sy - this.h / 2) / k };
  }

  private screenFromWorld(x: number, y: number): { x: number; y: number } {
    const k = this.ppu();
    return { x: (x - this.cx) * k + this.w / 2, y: (y - this.cy) * k + this.h / 2 };
  }

  zoomBy(f: number, sx = this.w / 2, sy = this.h / 2) {
    const before = this.worldFromScreen(sx, sy);
    this.zoom = Math.max(0.6, Math.min(80, this.zoom * f));
    const after = this.worldFromScreen(sx, sy);
    this.cx += before.x - after.x;
    this.cy += before.y - after.y;
    this.dirty = true;
  }

  resetView() {
    this.cx = WORLD_W / 2;
    this.cy = WORLD_H / 2;
    this.zoom = 1;
    this.dirty = true;
  }

  focus(x: number, y: number, zoom?: number) {
    this.cx = x;
    this.cy = y;
    if (zoom) this.zoom = zoom;
    this.dirty = true;
  }

  private dotSize(): number {
    // keep the map filled at any population: spacing between people shrinks with density
    const spacing = Math.sqrt((WORLD_W * WORLD_H * 0.35) / this.live);
    return Math.max(1.0, Math.min(14, spacing * this.ppu() * 0.85)) * this.dpr;
  }

  private draw() {
    this.dirty = false;
    const size = this.dotSize();
    const alpha = Math.max(0.35, Math.min(0.95, 1.05 - Math.log10(this.live / 5000) * 0.18));
    if (this.gl) {
      const gl = this.gl;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (this.count > 0) {
        gl.useProgram(this.prog);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        const k = this.ppu();
        gl.uniform2f(this.uni.u_center, this.cx, this.cy);
        gl.uniform2f(this.uni.u_scale, (2 * k) / this.w, (2 * k) / this.h);
        gl.uniform1f(this.uni.u_size, size);
        gl.uniform1f(this.uni.u_alpha, alpha);
        gl.uniform1f(this.uni.u_round, size > 2.5 ? 1 : 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.palTex);
        gl.uniform1i(this.uni.u_pal, 0);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.POINTS, 0, this.count);
        gl.bindVertexArray(null);
      }
    } else if (this.ctx2d && this.positions && this.values) {
      this.draw2D(size, alpha);
    }
    this.drawOverlay();
  }

  /** CPU fallback: splat pixels into an ImageData buffer. */
  private draw2D(size: number, alpha: number) {
    const ctx = this.ctx2d!;
    const W = this.canvas.width, H = this.canvas.height;
    const img = ctx.createImageData(W, H);
    const d = img.data;
    const pos = this.positions!, val = this.values!, pal = this.palette;
    const k = this.ppu() * this.dpr;
    const ox = W / 2 - this.cx * k, oy = H / 2 - this.cy * k;
    const kx = (WORLD_W / 65535) * k, ky = (WORLD_H / 65535) * k;
    const r = Math.max(0, Math.round(size / 2 - 0.5));
    const a = Math.round(alpha * 255);
    for (let i = 0; i < val.length; i++) {
      const v = val[i];
      if (!v) continue;
      const px = (pos[2 * i] * kx + ox) | 0, py = (pos[2 * i + 1] * ky + oy) | 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = py + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = px + dx;
          if (xx < 0 || xx >= W) continue;
          const o = (yy * W + xx) * 4;
          d[o] = pal[v * 4]; d[o + 1] = pal[v * 4 + 1]; d[o + 2] = pal[v * 4 + 2]; d[o + 3] = Math.max(d[o + 3], Math.round((a * pal[v * 4 + 3]) / 255));
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  private drawOverlay() {
    const ctx = this.overlay.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    const k = this.ppu();
    // protest hotspots: rings scaled by number of protesters
    for (let s = 0; s < this.settlements.length; s++) {
      const pr = this.settlementProtest[s] ?? 0;
      const pop = this.settlementPop[s] ?? 0;
      if (pr <= 0 || pop <= 0) continue;
      const share = pr / pop;
      const urbanSt = s < this.nCities;
      if (share < (urbanSt ? 0.005 : 0.02) || pr < 3) continue;
      const st = this.settlements[s];
      const p = this.screenFromWorld(st.x, st.y);
      const rad = Math.max(urbanSt ? 12 : 7, st.spread * k * 1.15);
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 96, 64, ${Math.min(0.7, 0.18 + share * 5)})`;
      ctx.lineWidth = 1.25 + Math.min(2.5, share * 22);
      ctx.setLineDash(urbanSt ? [] : [3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // settlement labels (cities always, villages when zoomed in)
    ctx.font = '500 11px "IBM Plex Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let s = 0; s < this.settlements.length; s++) {
      const st = this.settlements[s];
      const urban = s < this.nCities;
      if (!urban && this.zoom < 3.5) continue;
      const p = this.screenFromWorld(st.x, st.y);
      if (p.x < -50 || p.y < -20 || p.x > this.w + 50 || p.y > this.h + 20) continue;
      const label = st.name.replace(' (capital)', '');
      const y = p.y - Math.max(8, st.spread * k * 0.7) - 4;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(5, 8, 16, 0.85)';
      ctx.fillStyle = urban ? 'rgba(235, 232, 220, 0.92)' : 'rgba(200, 205, 220, 0.7)';
      ctx.font = urban ? (s === 0 ? '600 12px "IBM Plex Sans", system-ui, sans-serif' : '500 11px "IBM Plex Sans", system-ui, sans-serif') : '400 10px "IBM Plex Sans", system-ui, sans-serif';
      ctx.strokeText(s === 0 ? `★ ${label}` : label, p.x, y);
      ctx.fillText(s === 0 ? `★ ${label}` : label, p.x, y);
    }
    // selected person
    if (this.selected) {
      const p = this.screenFromWorld(this.selected.x, this.selected.y);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(242,181,68,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  private bindInput() {
    const el = this.overlay;
    el.style.touchAction = 'none';
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      this.zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect();
      this.pointers.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
      if (this.pointers.size === 1) {
        this.dragStart = { x: e.clientX, y: e.clientY, cx: this.cx, cy: this.cy };
        this.moved = false;
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDist > 0) this.zoomBy(d / this.pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
        this.pinchDist = d;
        this.moved = true;
        return;
      }
      if (!this.dragStart) return;
      const dx = e.clientX - this.dragStart.x, dy = e.clientY - this.dragStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) this.moved = true;
      const k = this.ppu();
      this.cx = this.dragStart.cx - dx / k;
      this.cy = this.dragStart.cy - dy / k;
      this.dirty = true;
    });
    const end = (e: PointerEvent) => {
      const wasSingle = this.pointers.size === 1;
      this.pointers.delete(e.pointerId);
      if (wasSingle && !this.moved && this.dragStart) {
        const r = el.getBoundingClientRect();
        const w = this.worldFromScreen(e.clientX - r.left, e.clientY - r.top);
        this.cb.onPick(w.x, w.y, Math.max(1.5, 14 / this.ppu()));
      }
      if (this.pointers.size === 0) this.dragStart = null;
      this.pinchDist = 0;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('keydown', (e) => {
      if (e.key === '+' || e.key === '=') this.zoomBy(1.25);
      if (e.key === '-') this.zoomBy(0.8);
    });
  }
}
