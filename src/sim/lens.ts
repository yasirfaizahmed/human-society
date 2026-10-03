// "Lenses" color every dot by one attribute. Values are packed into a byte per person:
// 0 = not drawn, 1..255 = palette index. Categorical lenses use small indices; continuous
// lenses spread over 1..255 and are colored with a sequential or diverging ramp.

export type LensKind = 'categorical' | 'sequential' | 'diverging';

export interface LensDef {
  id: string;
  label: string;
  kind: LensKind;
  /** For continuous lenses: what the low and high ends mean. */
  low?: string;
  high?: string;
  group: string;
}

export const LENSES: LensDef[] = [
  { id: 'faith', label: 'Faith group', kind: 'categorical', group: 'Identity' },
  { id: 'occupation', label: 'Occupation', kind: 'categorical', group: 'Identity' },
  { id: 'age', label: 'Age', kind: 'sequential', low: '0', high: '90+', group: 'Identity' },
  { id: 'vote', label: 'Party supported', kind: 'categorical', group: 'Politics' },
  { id: 'protest', label: 'Protest & unrest', kind: 'categorical', group: 'Politics' },
  { id: 'social', label: 'Social values', kind: 'diverging', low: 'Traditional', high: 'Progressive', group: 'Politics' },
  { id: 'econ', label: 'Economic views', kind: 'diverging', low: 'Redistribute', high: 'Free market', group: 'Politics' },
  { id: 'auth', label: 'Desire for strong leader', kind: 'sequential', low: 'Low', high: 'High', group: 'Politics' },
  { id: 'patriot', label: 'Nationalism', kind: 'sequential', low: 'Low', high: 'High', group: 'Politics' },
  { id: 'itrust', label: 'Trust in institutions', kind: 'sequential', low: 'Low', high: 'High', group: 'Politics' },
  { id: 'wealth', label: 'Wealth', kind: 'sequential', low: 'Poorest', high: 'Richest', group: 'Economy' },
  { id: 'income', label: 'Income', kind: 'sequential', low: 'Lowest', high: 'Highest', group: 'Economy' },
  { id: 'education', label: 'Education', kind: 'sequential', low: 'None', high: '20 yrs', group: 'Economy' },
  { id: 'consum', label: 'Consumerism', kind: 'sequential', low: 'Frugal', high: 'Materialist', group: 'Economy' },
  { id: 'happy', label: 'Life satisfaction', kind: 'diverging', low: 'Miserable', high: 'Thriving', group: 'Wellbeing' },
  { id: 'mood', label: 'Mood', kind: 'diverging', low: 'Low', high: 'High', group: 'Wellbeing' },
  { id: 'health', label: 'Physical health', kind: 'sequential', low: 'Ill', high: 'Healthy', group: 'Wellbeing' },
  { id: 'mental', label: 'Mental health', kind: 'sequential', low: 'Struggling', high: 'Well', group: 'Wellbeing' },
  { id: 'esteem', label: 'Self-image', kind: 'diverging', low: 'Inferiority', high: 'Superiority', group: 'Wellbeing' },
  { id: 'griev', label: 'Grievance', kind: 'sequential', low: 'Content', high: 'Aggrieved', group: 'Wellbeing' },
  { id: 'fear', label: 'Fear', kind: 'sequential', low: 'Safe', high: 'Afraid', group: 'Wellbeing' },
  { id: 'relig', label: 'Religiosity', kind: 'sequential', low: 'Secular', high: 'Devout', group: 'Faith & values' },
  { id: 'strict', label: 'Interpretation', kind: 'diverging', low: 'Flexible', high: 'Literal', group: 'Faith & values' },
  { id: 'toler', label: 'Tolerance', kind: 'sequential', low: 'Hostile', high: 'Accepting', group: 'Faith & values' },
  { id: 'extrem', label: 'Extremism', kind: 'sequential', low: 'Peaceful', high: 'Militant', group: 'Faith & values' },
  { id: 'empathy', label: 'Empathy', kind: 'sequential', low: 'Low', high: 'High', group: 'Personality' },
  { id: 'aggression', label: 'Aggression', kind: 'sequential', low: 'Calm', high: 'Aggressive', group: 'Personality' },
  { id: 'openness', label: 'Openness', kind: 'sequential', low: 'Closed', high: 'Open', group: 'Personality' },
  { id: 'cognition', label: 'Thinking capacity', kind: 'sequential', low: 'Low', high: 'High', group: 'Personality' },
  { id: 'love', label: 'Love & partnership', kind: 'categorical', group: 'Personality' },
  { id: 'disease', label: 'Epidemic', kind: 'categorical', group: 'Wellbeing' },
];

export const LENS_BY_ID: Record<string, LensDef> = Object.fromEntries(LENSES.map((l) => [l.id, l]));

// Categorical palettes (index 1..) — validated categorical order from the dataviz palette.
export const CAT = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

export const OCC_COLORS = [
  '#6b7280', // child
  '#9ec5f4', // student
  '#e66767', // unemployed
  '#c98500', // manual
  '#3987e5', // skilled
  '#199e70', // professional
  '#9085e9', // owner
  '#f5d76e', // elite
  '#8a8f98', // retired
  '#d55181', // homemaker
  '#8f6d3f', // soldier
  '#ff3b30', // prisoner
];

export const PROTEST_COLORS = ['#4b5563', '#f5b301', '#ff3b30'];
export const LOVE_COLORS = ['#4b5563', '#6b7280', '#e87ba4', '#ff4d6d', '#9085e9'];
export const LOVE_LABELS = ['Child', 'Single', 'Partnered', 'Deeply in love', 'Widowed / separated'];
export const DISEASE_COLORS = ['#4b5563', '#ff3b30', '#3987e5'];

/** Sequential ramp (dark-surface friendly: deep blue → bright cyan-white). */
export const SEQ_STOPS = ['#1c3f7a', '#2a68c2', '#3f93e8', '#7dc2f5', '#d6f0ff'];
/** Diverging ramp: warm (low) ↔ neutral ↔ cool (high). */
export const DIV_STOPS = ['#e34948', '#ec835a', '#8b8a84', '#5598e7', '#2a78d6'];
/** Extremism uses a heat ramp so militants pop out. */
export const HEAT_STOPS = ['#2b2d42', '#5c4d7d', '#b5446e', '#f26430', '#ffd23f'];

function hexToRgb(h: string): [number, number, number] {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rampAt(stops: string[], t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = hexToRgb(stops[i]), b = hexToRgb(stops[i + 1]);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** 256-entry RGBA palette for a lens. `cats` overrides categorical colors (faiths, parties). */
export function lensPalette(id: string, cats?: string[]): Uint8Array {
  const pal = new Uint8Array(256 * 4);
  const def = LENS_BY_ID[id];
  const put = (i: number, rgb: [number, number, number], a = 255) => {
    pal[i * 4] = rgb[0]; pal[i * 4 + 1] = rgb[1]; pal[i * 4 + 2] = rgb[2]; pal[i * 4 + 3] = a;
  };
  if (def.kind === 'categorical') {
    const colors = cats ?? (id === 'occupation' ? OCC_COLORS : id === 'protest' ? PROTEST_COLORS : id === 'love' ? LOVE_COLORS : id === 'disease' ? DISEASE_COLORS : CAT);
    for (let i = 1; i < 256; i++) put(i, hexToRgb(colors[(i - 1) % colors.length]));
    if (id === 'protest' || id === 'disease') put(1, hexToRgb(colors[0]), 150);
  } else {
    const stops = id === 'extrem' || id === 'griev' || id === 'fear' ? HEAT_STOPS : def.kind === 'diverging' ? DIV_STOPS : SEQ_STOPS;
    for (let i = 1; i < 256; i++) put(i, rampAt(stops, (i - 1) / 254));
  }
  return pal;
}

export function cssRamp(id: string): string {
  const def = LENS_BY_ID[id];
  const stops = id === 'extrem' || id === 'griev' || id === 'fear' ? HEAT_STOPS : def.kind === 'diverging' ? DIV_STOPS : SEQ_STOPS;
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
