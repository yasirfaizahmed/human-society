// Tiny DOM helpers — no framework needed.

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

export function clear(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

let idN = 0;
export const uid = (p = 'id') => `${p}-${++idN}`;

export interface SliderOpts {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  help?: string;
  fmt?: (v: number) => string;
  low?: string;
  high?: string;
  onInput: (v: number) => void;
  id?: string;
}

/** A labelled range slider with a live value readout. */
export function slider(o: SliderOpts): HTMLElement {
  const id = o.id ?? uid('s');
  const fmt = o.fmt ?? ((v: number) => (o.step >= 1 ? String(Math.round(v)) : v.toFixed(o.step < 0.05 ? 2 : 1)));
  const out = h('output', { class: 'sl-val', for: id }, fmt(o.value));
  const input = h('input', { type: 'range', id, min: o.min, max: o.max, step: o.step, value: o.value }) as HTMLInputElement;
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = fmt(v);
    o.onInput(v);
  });
  const wrap = h('div', { class: 'sl' },
    h('div', { class: 'sl-head' }, h('label', { for: id }, o.label), out),
    input,
    o.low || o.high ? h('div', { class: 'sl-ends' }, h('span', {}, o.low ?? ''), h('span', {}, o.high ?? '')) : null,
    o.help ? h('p', { class: 'help' }, o.help) : null,
  );
  (wrap as HTMLElement & { setValue?: (v: number) => void }).setValue = (v: number) => {
    if (document.activeElement === input) return;
    input.value = String(v);
    out.textContent = fmt(v);
  };
  return wrap;
}

export function select<T extends string>(label: string, options: { value: T; label: string }[], value: T, onChange: (v: T) => void, help?: string): HTMLElement {
  const id = uid('sel');
  const sel = h('select', { id }) as HTMLSelectElement;
  for (const o of options) sel.append(h('option', { value: o.value, selected: o.value === value }, o.label));
  sel.addEventListener('change', () => onChange(sel.value as T));
  return h('div', { class: 'field' }, h('label', { for: id }, label), sel, help ? h('p', { class: 'help' }, help) : null);
}

export function toggle(label: string, value: boolean, onChange: (v: boolean) => void, help?: string): HTMLElement {
  const id = uid('tg');
  const input = h('input', { type: 'checkbox', id, checked: value, role: 'switch' }) as HTMLInputElement;
  input.addEventListener('change', () => onChange(input.checked));
  return h('div', { class: 'toggle' }, input, h('label', { for: id }, label), help ? h('p', { class: 'help' }, help) : null);
}

export function textInput(label: string, value: string, onChange: (v: string) => void): HTMLElement {
  const id = uid('ti');
  const input = h('input', { type: 'text', id, value }) as HTMLInputElement;
  input.addEventListener('input', () => onChange(input.value));
  return h('div', { class: 'field' }, h('label', { for: id }, label), input);
}

export function numberInput(label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void, help?: string): HTMLElement {
  const id = uid('ni');
  const input = h('input', { type: 'number', id, value, min, max, step }) as HTMLInputElement;
  input.addEventListener('change', () => {
    const v = Math.max(min, Math.min(max, Number(input.value) || min));
    input.value = String(v);
    onChange(v);
  });
  return h('div', { class: 'field' }, h('label', { for: id }, label), input, help ? h('p', { class: 'help' }, help) : null);
}

export function meter(value: number, cls = ''): HTMLElement {
  const m = h('div', { class: 'meter ' + cls }, h('div', { class: 'meter-fill' }));
  (m.firstChild as HTMLElement).style.width = `${Math.max(0, Math.min(1, value)) * 100}%`;
  return m;
}

export function setMeter(m: HTMLElement, value: number) {
  (m.firstChild as HTMLElement).style.width = `${Math.max(0, Math.min(1, value)) * 100}%`;
}

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function toast(text: string) {
  let host = document.querySelector('.toasts');
  if (!host) { host = h('div', { class: 'toasts', 'aria-live': 'polite' }); document.body.append(host); }
  const t = h('div', { class: 'toast' }, text);
  host.append(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3800);
}
