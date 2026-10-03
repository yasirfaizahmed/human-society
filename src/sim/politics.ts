// Parties, elections and regime ideology.
//
// Parties are not hard-coded: before each election, they are found by clustering voters'
// positions (k-means on social, economic, authority, religious and national values). Parties
// therefore follow the electorate, the way Downs (1957) described office-seeking competition.

import type { Ideology } from './config';
import { RNG } from './rng';

export interface Party {
  id: number;
  name: string;
  color: string;
  pos: Ideology;
  share: number;
  /** Charismatic leader attached to the party (leader id) or -1. */
  leader: number;
}

export interface ElectionResult {
  tick: number;
  year: number;
  turnout: number;
  shares: number[];
  names: string[];
  colors: string[];
  coalition: number[];
  headline: string;
}

export const PARTY_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'];

export const IDEO_DIMS = ['social', 'econ', 'auth', 'relig', 'patriot'] as const;

export function ideoDist(a: Ideology, b: Ideology): number {
  return (
    Math.abs(a.social - b.social) * 1.0 +
    Math.abs(a.econ - b.econ) * 1.0 +
    Math.abs(a.auth - b.auth) * 0.8 +
    Math.abs(a.relig - b.relig) * 0.8 +
    Math.abs(a.patriot - b.patriot) * 0.7
  ) / 4.3;
}

/** Name a party from its platform. */
export function partyName(p: Ideology, taken: Set<string>): string {
  const cands: string[] = [];
  if (p.relig > 0.68 && p.social < 0.4) cands.push('Faith & Family Party', 'Party of the Righteous Path', 'Covenant Party');
  if (p.patriot > 0.68 && p.auth > 0.6) cands.push('National Front', 'Homeland Movement', 'Party of Order');
  if (p.econ < 0.33 && p.auth > 0.62) cands.push('Workers\' Vanguard', 'People\'s Unity Party');
  if (p.econ < 0.38) cands.push('Labour Party', 'Social Democrats', 'Workers\' Alliance');
  if (p.social > 0.62 && p.econ > 0.55) cands.push('Liberal Party', 'Free Citizens', 'Reform Party');
  if (p.social > 0.62) cands.push('Progressive Alliance', 'Greens & Progressives', 'Future Party');
  if (p.econ > 0.62 && p.social < 0.45) cands.push('Conservative Party', 'Tradition & Enterprise', 'Civic Conservative Union');
  if (p.econ > 0.6) cands.push('Free Market Party', 'Enterprise Party');
  if (p.social < 0.38) cands.push('Conservative Party', 'Heritage Party');
  cands.push('Centre Party', 'Moderate Union', 'Civic Platform', 'Common Ground');
  for (const c of cands) if (!taken.has(c)) return c;
  return 'Independent List ' + (taken.size + 1);
}

/** Simple k-means over ideology vectors, seeded with the previous party positions. */
export function clusterParties(points: Float32Array, n: number, k: number, prev: Ideology[], rng: RNG): Ideology[] {
  const D = 5;
  const cent = new Float64Array(k * D);
  for (let c = 0; c < k; c++) {
    if (prev[c]) {
      cent[c * D] = prev[c].social; cent[c * D + 1] = prev[c].econ; cent[c * D + 2] = prev[c].auth;
      cent[c * D + 3] = prev[c].relig; cent[c * D + 4] = prev[c].patriot;
    } else {
      const r = rng.int(n);
      for (let d = 0; d < D; d++) cent[c * D + d] = points[r * D + d];
    }
  }
  const assign = new Int32Array(n);
  const sums = new Float64Array(k * D);
  const counts = new Int32Array(k);
  for (let iter = 0; iter < 12; iter++) {
    sums.fill(0); counts.fill(0);
    for (let i = 0; i < n; i++) {
      let best = 0, bd = 1e9;
      for (let c = 0; c < k; c++) {
        let d = 0;
        for (let q = 0; q < D; q++) {
          const v = points[i * D + q] - cent[c * D + q];
          d += v * v;
        }
        if (d < bd) { bd = d; best = c; }
      }
      assign[i] = best;
      counts[best]++;
      for (let q = 0; q < D; q++) sums[best * D + q] += points[i * D + q];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) for (let q = 0; q < D; q++) cent[c * D + q] = sums[c * D + q] / counts[c];
      else { const r = rng.int(n); for (let q = 0; q < D; q++) cent[c * D + q] = points[r * D + q]; }
    }
  }
  const out: Ideology[] = [];
  for (let c = 0; c < k; c++) {
    // Parties sit slightly more extreme than their average voter (activists pull them outward).
    const pull = (v: number) => Math.max(0, Math.min(1, 0.5 + (v - 0.5) * 1.15));
    out.push({ social: pull(cent[c * D]), econ: pull(cent[c * D + 1]), auth: pull(cent[c * D + 2]), relig: pull(cent[c * D + 3]), patriot: pull(cent[c * D + 4]) });
  }
  return out;
}

export function describeIdeology(p: Ideology): string {
  const parts: string[] = [];
  parts.push(p.social < 0.38 ? 'traditionalist' : p.social > 0.62 ? 'progressive' : 'socially moderate');
  parts.push(p.econ < 0.38 ? 'left-wing' : p.econ > 0.62 ? 'pro-market' : 'mixed-economy');
  if (p.auth > 0.65) parts.push('authoritarian');
  else if (p.auth < 0.35) parts.push('libertarian');
  if (p.relig > 0.7) parts.push('religious');
  else if (p.relig < 0.2) parts.push('secular');
  if (p.patriot > 0.72) parts.push('nationalist');
  return parts.join(', ');
}
