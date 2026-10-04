// Structure-of-arrays storage for millions of people.
// Each attribute lives in its own typed array, indexed by "slot". About 150 bytes per person,
// so 1M people ≈ 150 MB and the hot loop stays cache-friendly.
//
// References between people (partner, parents, friends) are packed as slot*256 + generation.
// When someone dies their slot is recycled with a new generation, so stale references are
// detected instead of silently pointing at a stranger.

import { FRIEND_SLOTS } from './constants';

const F32_FIELDS = [
  'x', 'y', 'health', 'mental', 'mood', 'happy', 'esteem', 'wealth', 'income', 'edu',
  'relig', 'strict', 'toler', 'extrem', 'social', 'econ', 'auth', 'patriot', 'consum',
  'itrust', 'strust', 'griev', 'fear', 'bond',
] as const;
const U8_FIELDS = [
  'alive', 'gen', 'sex', 'faith', 'occ', 'kids', 'O', 'C', 'E', 'A', 'N', 'cog', 'emp',
  'aggr', 'looks', 'protest', 'vote', 'flags', 'disease', 'coreS', 'coreE', 'coreA', 'coreP',
] as const;
const U16_FIELDS = ['cell', 'home'] as const;
const I32_FIELDS = ['birth', 'mother', 'father', 'partner', 'lastBirth', 'deathTick', 'uid'] as const;

export type F32Field = (typeof F32_FIELDS)[number];
export type U8Field = (typeof U8_FIELDS)[number];

export class AgentStore {
  cap = 0;
  /** High-water mark: slots [0, n) have been used at least once. */
  n = 0;
  live = 0;
  nextUid = 1;

  // Float32 attributes
  x!: Float32Array; y!: Float32Array;
  health!: Float32Array; mental!: Float32Array; mood!: Float32Array; happy!: Float32Array;
  esteem!: Float32Array; wealth!: Float32Array; income!: Float32Array; edu!: Float32Array;
  relig!: Float32Array; strict!: Float32Array; toler!: Float32Array; extrem!: Float32Array;
  social!: Float32Array; econ!: Float32Array; auth!: Float32Array; patriot!: Float32Array;
  consum!: Float32Array; itrust!: Float32Array; strust!: Float32Array; griev!: Float32Array;
  fear!: Float32Array; bond!: Float32Array;
  // Uint8 attributes
  alive!: Uint8Array; gen!: Uint8Array; sex!: Uint8Array; faith!: Uint8Array; occ!: Uint8Array;
  kids!: Uint8Array; O!: Uint8Array; C!: Uint8Array; E!: Uint8Array; A!: Uint8Array; N!: Uint8Array;
  cog!: Uint8Array; emp!: Uint8Array; aggr!: Uint8Array; looks!: Uint8Array; protest!: Uint8Array;
  vote!: Uint8Array; flags!: Uint8Array; disease!: Uint8Array;
  /** Social, economic, authority and national views formed in youth (1..255; 0 = not yet formed). */
  coreS!: Uint8Array; coreE!: Uint8Array; coreA!: Uint8Array; coreP!: Uint8Array;
  // Uint16
  cell!: Uint16Array; home!: Uint16Array;
  // Int32
  birth!: Int32Array; mother!: Int32Array; father!: Int32Array; partner!: Int32Array;
  lastBirth!: Int32Array; deathTick!: Int32Array; uid!: Int32Array;
  friends!: Int32Array;

  // FIFO ring of free (dead) slots, oldest first.
  private ring!: Int32Array;
  private head = 0;
  private count = 0;

  constructor(cap: number) {
    this.resize(Math.max(1024, cap));
  }

  private resize(newCap: number): void {
    const self = this as unknown as Record<string, ArrayLike<number> & { set?: unknown }>;
    const copy = <T extends Float32Array | Uint8Array | Uint16Array | Int32Array>(
      old: T | undefined, make: (n: number) => T, len: number,
    ): T => {
      const a = make(len);
      if (old) a.set(old.subarray(0, Math.min(old.length, len)) as never);
      return a;
    };
    for (const f of F32_FIELDS) self[f] = copy(self[f] as Float32Array | undefined, (k) => new Float32Array(k), newCap);
    for (const f of U8_FIELDS) self[f] = copy(self[f] as Uint8Array | undefined, (k) => new Uint8Array(k), newCap);
    for (const f of U16_FIELDS) self[f] = copy(self[f] as Uint16Array | undefined, (k) => new Uint16Array(k), newCap);
    for (const f of I32_FIELDS) self[f] = copy(self[f] as Int32Array | undefined, (k) => new Int32Array(k), newCap);
    const oldFriends = this.friends;
    this.friends = new Int32Array(newCap * FRIEND_SLOTS).fill(-1);
    if (oldFriends) this.friends.set(oldFriends);
    // rebuild free ring preserving order
    const newRing = new Int32Array(newCap);
    if (this.ring) {
      for (let k = 0; k < this.count; k++) newRing[k] = this.ring[(this.head + k) % this.ring.length];
    }
    this.ring = newRing;
    this.head = 0;
    this.cap = newCap;
  }

  /** Make sure `extra` new people can be created during the coming tick without reallocating. */
  ensureHeadroom(extra: number): boolean {
    if (this.n + extra <= this.cap) return false;
    this.resize(Math.ceil(Math.max(this.cap * 1.5, this.n + extra + 1024)));
    return true;
  }

  /** Allocate a slot. Slots that died in the last two ticks are not reused yet. */
  alloc(tick: number): number {
    if (this.count > 0) {
      const s = this.ring[this.head];
      if (this.deathTick[s] < tick - 1) {
        this.head = (this.head + 1) % this.ring.length;
        this.count--;
        this.gen[s] = (this.gen[s] + 1) & 255;
        this.reset(s);
        return s;
      }
    }
    if (this.n < this.cap) {
      const s = this.n++;
      this.reset(s);
      return s;
    }
    return -1;
  }

  private reset(s: number): void {
    const self = this as unknown as Record<string, Float32Array | Uint8Array | Uint16Array | Int32Array>;
    for (const f of F32_FIELDS) self[f][s] = 0;
    for (const f of U8_FIELDS) if (f !== 'gen') self[f][s] = 0;
    for (const f of U16_FIELDS) self[f][s] = 0;
    for (const f of I32_FIELDS) self[f][s] = 0;
    this.mother[s] = -1; this.father[s] = -1; this.partner[s] = -1; this.lastBirth[s] = -100000;
    const b = s * FRIEND_SLOTS;
    for (let k = 0; k < FRIEND_SLOTS; k++) this.friends[b + k] = -1;
    this.alive[s] = 1;
    this.uid[s] = this.nextUid++;
    this.live++;
  }

  kill(s: number, tick: number): void {
    if (!this.alive[s]) return;
    this.alive[s] = 0;
    this.deathTick[s] = tick;
    this.protest[s] = 0;
    this.live--;
    const tail = (this.head + this.count) % this.ring.length;
    this.ring[tail] = s;
    this.count++;
  }

  /**
   * Re-order living people so that slot k holds old slot order[k] (k < count). Dead slots are dropped,
   * generations reset to 0. Returns oldSlot → newSlot (or -1). Caller must remap stored references.
   */
  permute(order: Int32Array, count: number): Int32Array {
    const self = this as unknown as Record<string, Float32Array | Uint8Array | Uint16Array | Int32Array>;
    const map = new Int32Array(this.n).fill(-1);
    for (let k = 0; k < count; k++) map[order[k]] = k;
    const perm = <T extends Float32Array | Uint8Array | Uint16Array | Int32Array>(old: T): T => {
      const a = new (old.constructor as { new (n: number): T })(old.length);
      for (let k = 0; k < count; k++) a[k] = old[order[k]];
      return a;
    };
    for (const f of F32_FIELDS) self[f] = perm(self[f] as Float32Array);
    for (const f of U8_FIELDS) self[f] = perm(self[f] as Uint8Array);
    for (const f of U16_FIELDS) self[f] = perm(self[f] as Uint16Array);
    for (const f of I32_FIELDS) self[f] = perm(self[f] as Int32Array);
    const fr = new Int32Array(this.friends.length).fill(-1);
    for (let k = 0; k < count; k++) {
      const o = order[k] * FRIEND_SLOTS;
      for (let q = 0; q < FRIEND_SLOTS; q++) fr[k * FRIEND_SLOTS + q] = this.friends[o + q];
    }
    this.friends = fr;
    this.gen.fill(0);
    this.n = count;
    this.live = count;
    this.head = 0;
    this.count = 0;
    return map;
  }

  ref(s: number): number {
    return s * 256 + this.gen[s];
  }

  /** Resolve a packed reference to a living person's slot, or -1. */
  deref(r: number): number {
    if (r < 0) return -1;
    const s = r >>> 8;
    if (s >= this.n || this.gen[s] !== (r & 255) || !this.alive[s]) return -1;
    return s;
  }

  /** Resolve a reference even if the person has died (returns -1 only if the slot was recycled). */
  derefAny(r: number): number {
    if (r < 0) return -1;
    const s = r >>> 8;
    if (s >= this.n || this.gen[s] !== (r & 255)) return -1;
    return s;
  }

  ageYears(s: number, tick: number): number {
    return (tick - this.birth[s]) / 12;
  }

  /** Approximate bytes per person (for the memory estimate shown in the UI). */
  static bytesPerAgent(): number {
    return F32_FIELDS.length * 4 + U8_FIELDS.length + U16_FIELDS.length * 2 + I32_FIELDS.length * 4 + FRIEND_SLOTS * 4 + 4 + 13;
  }

  /** Copy a list of fields of the given slots (used to build forecast snapshots). */
  static fieldNames() {
    return { F32_FIELDS, U8_FIELDS, U16_FIELDS, I32_FIELDS };
  }
}
