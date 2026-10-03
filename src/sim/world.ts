// Geography: a territory with cities (Zipf-distributed sizes) and rural villages.
// Positions only matter for who meets whom: neighbours share a grid cell.

import { CELL, GRID_W, WORLD_H, WORLD_W } from './constants';
import { RNG } from './rng';

export interface Settlement {
  name: string;
  x: number;
  y: number;
  /** Spatial spread (std-dev) of homes around the centre. */
  spread: number;
  urban: boolean;
  /** Relative attractiveness for migrants (jobs, size). */
  weight: number;
  pop: number;
}

const SYL_A = ['Al', 'Bar', 'Cor', 'Dal', 'El', 'Far', 'Gal', 'Har', 'Is', 'Jor', 'Kal', 'Lor', 'Mar', 'Nor', 'Or', 'Per', 'Qas', 'Ros', 'Sal', 'Tar', 'Ul', 'Var', 'Wen', 'Yar', 'Zan', 'Ash', 'Bel', 'Dun', 'Kir', 'Mir'];
const SYL_B = ['a', 'e', 'i', 'o', 'u', 'ar', 'en', 'is', 'on', 'ul', 'am', 'ir'];
const SYL_C = ['dor', 'ham', 'ville', 'stad', 'abad', 'pur', 'grad', 'ton', 'burg', 'mere', 'kent', 'shan', 'via', 'ra', 'lin', 'mont', 'ia', 'sk', 'ford', 'qal'];

export function makeName(rng: RNG): string {
  return SYL_A[rng.int(SYL_A.length)] + (rng.next() < 0.5 ? SYL_B[rng.int(SYL_B.length)] : '') + SYL_C[rng.int(SYL_C.length)];
}

const FIRST_F = ['Amina', 'Sara', 'Leila', 'Maria', 'Hana', 'Nadia', 'Elena', 'Fatima', 'Ines', 'Yara', 'Zoe', 'Mei', 'Asha', 'Noor', 'Lina', 'Rosa', 'Aya', 'Clara', 'Dina', 'Iris', 'Maya', 'Ruth', 'Salma', 'Tara', 'Vera'];
const FIRST_M = ['Omar', 'Adam', 'Yusuf', 'Daniel', 'Ali', 'Ivan', 'Samir', 'Leo', 'Karim', 'Tomas', 'Hassan', 'Ravi', 'Jonas', 'Idris', 'Elias', 'Malik', 'Noah', 'Rami', 'Taro', 'Victor', 'Bilal', 'Arun', 'Marco', 'Zayd', 'Felix'];
const LAST = ['Haddad', 'Novak', 'Rahman', 'Silva', 'Okafor', 'Kim', 'Petrov', 'Nasser', 'Costa', 'Ibrahim', 'Larsen', 'Mehta', 'Farouk', 'Moreau', 'Tanaka', 'Aziz', 'Varga', 'Osei', 'Kaya', 'Lund', 'Qureshi', 'Rossi', 'Sato', 'Yilmaz', 'Mendes', 'Bakr', 'Horvat', 'Iyer', 'Khan', 'Weber'];

/** Deterministic person name from their unique id (no memory needed). */
export function personName(uid: number, sex: number): string {
  const h = Math.imul(uid ^ 0x5bd1e995, 0x27d4eb2d) >>> 0;
  const first = sex ? FIRST_M[h % FIRST_M.length] : FIRST_F[h % FIRST_F.length];
  const last = LAST[(h >>> 8) % LAST.length];
  return `${first} ${last}`;
}

export class World {
  settlements: Settlement[] = [];
  nCities = 0;

  constructor(rng: RNG, cities: number, urbanShare: number) {
    const margin = 90;
    const placed: { x: number; y: number }[] = [];
    const farEnough = (x: number, y: number, d: number) => placed.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 > d * d);
    // Cities: Zipf sizes (Gabaix 1999). The capital is near the centre.
    let zipfTotal = 0;
    for (let k = 1; k <= cities; k++) zipfTotal += 1 / k;
    for (let k = 0; k < cities; k++) {
      let x = WORLD_W / 2, y = WORLD_H / 2;
      for (let t = 0; t < 200; t++) {
        x = k === 0 ? WORLD_W * (0.4 + rng.next() * 0.2) : margin + rng.next() * (WORLD_W - 2 * margin);
        y = k === 0 ? WORLD_H * (0.4 + rng.next() * 0.2) : margin + rng.next() * (WORLD_H - 2 * margin);
        if (farEnough(x, y, 170)) break;
      }
      placed.push({ x, y });
      const share = 1 / (k + 1) / zipfTotal;
      this.settlements.push({
        name: k === 0 ? makeName(rng) + ' (capital)' : makeName(rng),
        x, y,
        spread: 14 + 70 * Math.sqrt(share * Math.max(0.05, urbanShare)),
        urban: true,
        weight: share,
        pop: 0,
      });
    }
    this.nCities = cities;
    // Villages spread over the countryside.
    const villages = 70;
    for (let v = 0; v < villages; v++) {
      let x = 0, y = 0;
      for (let t = 0; t < 60; t++) {
        x = 30 + rng.next() * (WORLD_W - 60);
        y = 30 + rng.next() * (WORLD_H - 60);
        if (farEnough(x, y, 45)) break;
      }
      placed.push({ x, y });
      this.settlements.push({ name: makeName(rng), x, y, spread: 9 + rng.next() * 9, urban: false, weight: (0.5 + rng.next()) / villages, pop: 0 });
    }
  }

  /** Pick a settlement index: urban with probability `urbanProb`, weighted by size. */
  pick(rng: RNG, urbanProb: number): number {
    const urban = rng.next() < urbanProb;
    const lo = urban ? 0 : this.nCities;
    const hi = urban ? this.nCities : this.settlements.length;
    let tot = 0;
    for (let i = lo; i < hi; i++) tot += this.settlements[i].weight;
    let r = rng.next() * tot;
    for (let i = lo; i < hi; i++) {
      r -= this.settlements[i].weight;
      if (r <= 0) return i;
    }
    return hi - 1;
  }

  /** Random home position near a settlement. */
  place(rng: RNG, s: number, out: { x: number; y: number }): void {
    const st = this.settlements[s];
    // Mixture: dense core + wider suburbs.
    const sp = rng.next() < 0.6 ? st.spread * 0.55 : st.spread * 1.25;
    let x = st.x + rng.normal() * sp;
    let y = st.y + rng.normal() * sp;
    if (x < 1) x = 1 + rng.next() * 5; else if (x > WORLD_W - 1) x = WORLD_W - 1 - rng.next() * 5;
    if (y < 1) y = 1 + rng.next() * 5; else if (y > WORLD_H - 1) y = WORLD_H - 1 - rng.next() * 5;
    out.x = x;
    out.y = y;
  }
}

export function cellOf(x: number, y: number): number {
  return ((y / CELL) | 0) * GRID_W + ((x / CELL) | 0);
}
