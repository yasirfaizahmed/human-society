// The simulation engine. One tick = one month.
//
// Each month every person: may die (age, health, poverty, epidemics, violence), studies or works,
// earns, pays tax, spends and saves, meets family/friends/neighbours and is influenced by them,
// absorbs media, community norms and charismatic leaders, updates happiness, mental health,
// self-image, grievance and fear, may radicalize, protest, commit crime, marry, divorce, have
// children, move to a city or emigrate.
//
// Macro forces (economy, government, institutions, events) set the conditions; aggregated
// individual behaviour (votes, protests, taxes, births) feeds back into them.
//
// See docs/MODEL.md for the reasoning and sources behind every mechanism.

import { AgentStore } from './agents';
import { normalizeScenario, type Ideology, type ScenarioConfig, type Trends } from './config';
import {
  CELL, DEATH, DIS, F, FRIEND_SLOTS, GRID_H, GRID_W, MAX_FAITHS, NCELLS, OCC, OCC_NAMES, PROTEST, WAGE_MULT,
} from './constants';
import {
  EFFECTS, PUSH_DIMS, REGIMES, TEMPLATES, TEMPLATE_BY_ID, resolveScheduled, shapeLevel, shapeWeights,
  type EffectKey, type EventSpec, type LeaderSpec, type LeaderStyle, type MigrantProfile, type RegimeKind,
  type StateView, type Target,
} from './events';
import { PARTY_COLORS, clusterParties, describeIdeology, ideoDist, partyName, type ElectionResult, type Party } from './politics';
import { RNG, clamp, clamp01, hash01, lerp } from './rng';
import { giniSorted, lifeExpectancy } from './stats';
import { World, cellOf, personName } from './world';

// ------------------------------------------------------------------------------------------------
// Types
// ------------------------------------------------------------------------------------------------

export interface Leader {
  id: number;
  ref: number;
  name: string;
  style: LeaderStyle;
  charisma: number;
  reach: number;
  ideology: Ideology & { toler: number; extrem: number };
  home: number;
  faith: number;
  start: number;
  end: number;
  support: number;
  inPower: boolean;
  alive: boolean;
}

export interface ActiveEvent {
  uid: number;
  spec: EventSpec;
  start: number;
  intensity: number;
  target: Target;
  weights: number[];
  random: boolean;
  leaderId: number;
}

export interface NewsItem {
  t: number;
  text: string;
  cat: string;
  level: number;
}

export interface SocietyState {
  // economy
  prod: number;
  baseGrowth: number;
  gap: number;
  gdppc: number;
  gdpHist: number[];
  growth: number;
  inflation: number;
  unemployment: number;
  avgWage: number;
  wageUnit: number;
  rMonth: number;
  capShareAdj: number;
  automation: number;
  automationRecent: number;
  medBoost: number;
  debt: number;
  debtRatio: number;
  L0: number;
  dev: number;
  agrarian: number;
  subs: number;
  // institutions & policy
  democracy: number;
  ruleOfLaw: number;
  pressFreedom: number;
  repression: number;
  securityLoyalty: number;
  marketFreedom: number;
  taxRate: number;
  progressivity: number;
  welfare: number;
  eduAccess: number;
  healthSpend: number;
  military: number;
  policing: number;
  genderEquality: number;
  contraception: number;
  minorityBias: number;
  immigration: number;
  socialMedia: number;
  collectivism: number;
  religiousPolicy: 'neutral' | 'favor' | 'theocracy' | 'suppress';
  favoredFaith: number;
  H: number;
  legitimacy: number;
  ruling: Ideology;
  regimeLabel: string;
  regimeSince: number;
  trends: Trends;
  politicsEndogenous: boolean;
  // politics
  parties: Party[];
  govParties: number[];
  nextElection: number;
  lastElection: ElectionResult | null;
  headLeader: number;
  // stability
  protestFrac: number;
  violentFrac: number;
  protestMonths: number;
  violentMonths: number;
  calmMonths: number;
  psi: number;
  mmp: number;
  emp: number;
  sfd: number;
  aspirantBase: number;
  conflict: boolean;
  warActive: boolean;
  warMobil: number;
  warMonths: number;
  epiR: number;
  epiIFR: number;
  epiProfile: number;
  epiActive: boolean;
  infected: number;
}

const OCC_PRESTIGE = [0.3, 0.5, 0.35, 0.5, 0.7, 0.95, 0.9, 1.3, 0.7, 0.6, 0.8, 0.25];
const IS_EMPLOYED = [0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 0];
const FERTILITY_SHAPE = [0.55, 0.95, 1.0, 0.9, 0.65, 0.3, 0.06]; // 15-19 … 45-49

// Accumulators reset every tick.
class Acc {
  alive = 0; adults = 0; children = 0; employed = 0; unemployed = 0; laborForce = 0;
  skill = 0; posWealth = 0; taxes = 0; transfers = 0;
  happy = 0; health = 0; mental = 0; griev = 0; fear = 0; itrust = 0; strust = 0; toler = 0;
  social = 0; econ = 0; auth = 0; patriot = 0; consum = 0; esteem = 0; relig = 0; strict = 0;
  social2 = 0; econ2 = 0; extremists = 0; edu25 = 0; n25 = 0; partnered = 0; urban = 0; immigrants = 0;
  protesters = 0; violent = 0; pSocial = 0; pEcon = 0; pAuth = 0; pRelig = 0; pPatriot = 0; pStrict = 0; pExtrem = 0;
  crimes = 0; homicides = 0; suicides = 0; births = 0; deaths = 0; emigrants = 0; terror = 0;
  soldiers = 0; soldierTrust = 0; elites = 0; aspirants = 0; frustrated = 0; youth = 0;
  infected = 0; marriages = 0; divorces = 0; conversions = 0; repressionKills = 0; warDeaths = 0; sampled = 0;
  empSum = 0; empN = 0;
  faith = new Float64Array(MAX_FAITHS);
  faithN = new Float64Array(MAX_FAITHS);
  faithRelig = new Float64Array(MAX_FAITHS);
  faithGriev = new Float64Array(MAX_FAITHS);
  faithExtrem = new Float64Array(MAX_FAITHS);
  faithToler = new Float64Array(MAX_FAITHS);
  faithWealth = new Float64Array(MAX_FAITHS);
  votes = new Float64Array(8);
  occ = new Float64Array(12);
  medianAgeHist = new Float64Array(101);
  reset() {
    for (const k of Object.keys(this) as (keyof Acc)[]) {
      const v = this[k];
      if (typeof v === 'number') (this as unknown as Record<string, number>)[k] = 0;
      else if (v instanceof Float64Array) v.fill(0);
    }
  }
}

export interface PersonInfo {
  slot: number;
  uid: number;
  name: string;
  alive: boolean;
  age: number;
  sex: string;
  faith: string;
  faithColor: string;
  occupation: string;
  settlement: string;
  education: number;
  incomeYear: number;
  wealth: number;
  traits: Record<string, number>;
  values: Record<string, number>;
  state: Record<string, number>;
  partner: { slot: number; name: string; alive: boolean } | null;
  bond: number;
  parents: { slot: number; name: string; alive: boolean }[];
  children: { slot: number; name: string; age: number }[];
  friends: { slot: number; name: string }[];
  flags: string[];
  log: { t: number; text: string }[];
  following: boolean;
  leader: Leader | null;
}

// ------------------------------------------------------------------------------------------------

export class Simulation {
  cfg: ScenarioConfig;
  A: AgentStore;
  rng: RNG;
  world: World;
  t = 0;
  S!: SocietyState;
  K: number;
  faithShareNow: Float64Array;
  secularFaith = -1;
  majorityFaith = 0;

  // spatial index
  cellStart = new Int32Array(NCELLS + 1);
  cellList = new Int32Array(1024);
  // cell aggregates (prev = read this tick, next = written this tick)
  cN = new Int32Array(NCELLS); nN = new Int32Array(NCELLS);
  cSocial = new Float32Array(NCELLS); nSocial = new Float32Array(NCELLS);
  cRelig = new Float32Array(NCELLS); nRelig = new Float32Array(NCELLS);
  cPatriot = new Float32Array(NCELLS); nPatriot = new Float32Array(NCELLS);
  cConsum = new Float32Array(NCELLS); nConsum = new Float32Array(NCELLS);
  cToler = new Float32Array(NCELLS); nToler = new Float32Array(NCELLS);
  cWealth = new Float32Array(NCELLS); nWealth = new Float32Array(NCELLS);
  cProtest = new Int32Array(NCELLS); nProtest = new Int32Array(NCELLS);
  cInf = new Int32Array(NCELLS); nInf = new Int32Array(NCELLS);
  cFaith = new Int32Array(NCELLS * MAX_FAITHS); nFaith = new Int32Array(NCELLS * MAX_FAITHS);
  cCrime = new Float32Array(NCELLS); crimeNow = new Int32Array(NCELLS);
  estate = new Float32Array(1024);

  acc = new Acc();
  // per-tick derived values
  private gomp = new Float64Array(121);
  private childMu = 0;
  private eqIncQ = new Float64Array(33);
  private wealthQ = new Float64Array(33);
  private sampleInc = new Float64Array(4096);
  private sampleWealth = new Float64Array(4096);
  private sampleN = 0;
  private sampleStride = 1;
  private sampleCounter = 0;
  private meanCounter = 0;
  private meanStride = 1;
  private globalProtest = 0;
  private visibility = 0.5;
  private findRate = 0.1;
  private meanEmployability = 0.8;
  private sepRate = 0.012;
  private uTarget = 0.06;
  private erosion = 0;
  private realWage = 1;
  private propaganda = 0;
  private repEff = 0;
  private policingEff = 0;
  private eliteSlots = 1;
  private eliteCount = 0;
  private automationShock = 0;
  private redistPool = 0;
  private redistGive = 0;
  private redistTake = 0;
  private wealthTop = 1e18;
  private wealthMedian = 0;
  private concession = 0;
  private revolutionaryBoost = 0;
  private honeymoon = 0;
  private lastProtestNews = -100;
  private warCasualty = 0;
  private warFear = 0;
  private conflictFear = 0;
  private epiFear = 0;
  private globalInfFrac = 0;
  private lockdown = 0;
  private meanSocial = 0.5;
  private meanEcon = 0.5;
  private ustar = 0.5;
  private ifrScale = 1;
  // event effects compiled for the agent loop
  private gPush = new Float32Array(PUSH_DIMS.length);
  private gActive = false;
  private gMort = 0; private gMortProfile = 0; private gEmig = 0; private gWealthLoss = 0;
  private gSeed = 0; private gCrime = 0; private gUrban = 0;
  private fEffs: CompiledEffect[] = [];
  private growthAdd = 0; private inflAdd = 0; private unempAdd = 0; private gapShock = 0;
  private propagandaAdd = 0; private warMobilTarget = 0;
  private leaderPos: Leader[] = [];

  events: ActiveEvent[] = [];
  leaders: Leader[] = [];
  news: NewsItem[] = [];
  newsSince = 0;
  private nextEventUid = 1;
  private nextLeaderId = 1;
  logs = new Map<number, { t: number; text: string }[]>();

  // life table & fertility accumulators (reset each year)
  private deathsByAge = new Float64Array(101);
  private exposure = new Float64Array(101);
  private birthsByAge = new Float64Array(35);
  private womenByAge = new Float64Array(35);
  lifeExp = 0;
  tfr = 0;
  medianAge = 0;
  pyramid = { male: new Float64Array(21), female: new Float64Array(21) };
  deathCauses = new Float64Array(9);
  latest: Record<string, number> = {};
  popScale = 1;
  private popYearBirths = 0;
  private popYearDeaths = 0;
  private yearCrimes = 0;
  private yearHomicides = 0;
  private yearSuicides = 0;
  private prevRates = { births: 0, deaths: 0, crime: 0, homicide: 0, suicide: 0 };
  private ideoSample = new Float32Array(5 * 4000);
  compass = new Float32Array(24 * 24);
  settlementPop: Float64Array;
  settlementProtest: Float64Array;

  constructor(scenario: ScenarioConfig, opts: { skipInit?: boolean } = {}) {
    this.cfg = normalizeScenario(scenario);
    const P = this.cfg.population;
    this.K = P.faiths.length;
    this.secularFaith = P.faiths.findIndex((f) => f.secular);
    this.rng = new RNG(this.cfg.society.seed >>> 0);
    this.world = new World(this.rng, P.cities, P.urbanShare);
    this.faithShareNow = new Float64Array(MAX_FAITHS);
    this.settlementPop = new Float64Array(this.world.settlements.length);
    this.settlementProtest = new Float64Array(this.world.settlements.length);
    this.A = new AgentStore(Math.ceil(P.size * 1.15) + 2048);
    this.ensureAux();
    if (!opts.skipInit) this.init();
  }

  get year(): number {
    return this.cfg.society.startYear + Math.floor(this.t / 12);
  }

  get month(): number {
    return this.t % 12;
  }

  private ensureAux() {
    if (this.cellList.length < this.A.cap) this.cellList = new Int32Array(this.A.cap);
    if (this.estate.length < this.A.cap) {
      const e = new Float32Array(this.A.cap);
      e.set(this.estate);
      this.estate = e;
    }
  }

  // ==============================================================================================
  // Initialization
  // ==============================================================================================

  private init() {
    const Sc = this.cfg.society;
    const P = this.cfg.population;
    const dev = devIndex(Sc.gdpPerCapita);
    this.S = {
      prod: 1, baseGrowth: Sc.techGrowth / 100, gap: 0, gdppc: Sc.gdpPerCapita, gdpHist: [], growth: 0,
      inflation: 0.02 * (1 - clamp01(1.2 - dev * 1.4)), unemployment: 0.05, avgWage: 0, wageUnit: 0, rMonth: 0.004,
      capShareAdj: 0, automation: 0, automationRecent: 0, medBoost: 0, debt: 0, debtRatio: 0.5 * dev, L0: 1, dev, agrarian: clamp01(1.1 - dev * 1.5), subs: 0,
      democracy: Sc.democracy, ruleOfLaw: Sc.ruleOfLaw, pressFreedom: Sc.pressFreedom, repression: Sc.repression,
      securityLoyalty: Sc.securityLoyalty, marketFreedom: Sc.marketFreedom, taxRate: Sc.taxRate, progressivity: Sc.progressivity,
      welfare: Sc.welfare, eduAccess: Sc.eduAccess, healthSpend: Sc.healthSpend, military: Sc.military, policing: Sc.policing,
      genderEquality: Sc.genderEquality, contraception: clamp01(0.85 * dev + 0.2 * Sc.genderEquality),
      minorityBias: Sc.minorityBias, immigration: Sc.immigration ?? 0.4, socialMedia: Sc.socialMedia, collectivism: Sc.collectivism,
      religiousPolicy: Sc.religiousPolicy, favoredFaith: Sc.favoredFaith, H: 0.5, legitimacy: 0.5,
      ruling: { ...Sc.ruling }, regimeLabel: '', regimeSince: 0, trends: { ...Sc.trends }, politicsEndogenous: Sc.politicsEndogenous,
      parties: [], govParties: [], nextElection: 0, lastElection: null, headLeader: -1,
      protestFrac: 0, violentFrac: 0, protestMonths: 0, violentMonths: 0, calmMonths: 0, psi: 0, mmp: 0, emp: 1, sfd: 0, aspirantBase: 0,
      conflict: false, warActive: false, warMobil: 0, warMonths: 0,
      epiR: 0, epiIFR: 0, epiProfile: 0, epiActive: false, infected: 0,
    };
    this.S.debt = this.S.debtRatio * Sc.gdpPerCapita * P.size;
    this.S.regimeLabel = regimeLabelFor(this.S.democracy, this.S.ruling);
    this.updateHealthcare();
    this.updateMortalityTables();
    this.S.subs = subsistence(Sc.gdpPerCapita) / 12;

    const N = P.size;
    const rng = this.rng;
    const A = this.A;
    // ---- age distribution: stable population with growth g and current survival ----
    const g = lerp(-0.012, 0.034, P.ageStructure);
    const surv = new Float64Array(101);
    let l = 1;
    for (let a = 0; a <= 100; a++) {
      surv[a] = l;
      const mu = a < 5 ? this.childMu * (a < 1 ? 3 : 0.4) + this.gomp[a] : this.gomp[a];
      l *= Math.exp(-mu);
    }
    const cdf = new Float64Array(101);
    let tot = 0;
    for (let a = 0; a <= 100; a++) { tot += Math.exp(-g * a) * surv[a]; cdf[a] = tot; }
    for (let a = 0; a <= 100; a++) cdf[a] /= tot;
    const sampleAge = () => {
      const r = rng.next();
      let lo = 0, hi = 100;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < r) lo = mid + 1; else hi = mid; }
      return lo + rng.next();
    };

    // ---- faith heartlands: minorities cluster geographically ----
    const sets = this.world.settlements;
    const faithAff: number[][] = P.faiths.map((f, fi) => {
      if (fi === 0 && !f.secular) return sets.map(() => 1);
      const hx = rng.next() * 1600, hy = rng.next() * 1000;
      return sets.map((s) => 1 + (f.secular ? 0.5 : 3) * Math.exp(-((s.x - hx) ** 2 + (s.y - hy) ** 2) / (2 * 320 ** 2)));
    });
    const pickSettlement = (f: number) => {
      const urban = rng.next() < P.urbanShare;
      const lo = urban ? 0 : this.world.nCities;
      const hi = urban ? this.world.nCities : sets.length;
      let t2 = 0;
      for (let s = lo; s < hi; s++) t2 += sets[s].weight * faithAff[f][s];
      let r = rng.next() * t2;
      for (let s = lo; s < hi; s++) { r -= sets[s].weight * faithAff[f][s]; if (r <= 0) return s; }
      return hi - 1;
    };
    const faithCdf: number[] = [];
    { let c = 0; for (const f of P.faiths) { c += f.share; faithCdf.push(c); } }
    const pickFaith = () => { const r = rng.next(); for (let k = 0; k < faithCdf.length; k++) if (r <= faithCdf[k]) return k; return faithCdf.length - 1; };

    const nrm = () => rng.normal();
    const u8 = (v: number) => Math.round(clamp01(v) * 255);
    const spread = P.valueSpread;
    const pos = { x: 0, y: 0 };
    const ge = Sc.genderEquality;
    const retireAge = 60 + 5 * dev;
    const adultsByAge: number[][] = [];
    for (let a = 0; a <= 100; a++) adultsByAge.push([]);
    const singlesMen: number[][] = [];
    for (let a = 0; a <= 100; a++) singlesMen.push([]);
    const children: number[] = [];

    for (let k = 0; k < N; k++) {
      const s = A.alloc(0);
      const age = sampleAge();
      A.birth[s] = -Math.round(age * 12);
      const male = rng.next() < 0.5 ? 1 : 0;
      A.sex[s] = male;
      const f = pickFaith();
      A.faith[s] = f;
      const st = pickSettlement(f);
      A.home[s] = st;
      this.world.place(rng, st, pos);
      this.setPos(s, pos.x, pos.y);
      const O = clamp01(P.openness + 0.15 * nrm());
      const C = clamp01(P.conscientiousness + 0.15 * nrm());
      const E = clamp01(P.extraversion + 0.15 * nrm());
      const Ag = clamp01(P.agreeableness + 0.15 * nrm());
      const Nn = clamp01(P.neuroticism + 0.15 * nrm() + (male ? -0.04 : 0.04));
      A.O[s] = u8(O); A.C[s] = u8(C); A.E[s] = u8(E); A.A[s] = u8(Ag); A.N[s] = u8(Nn);
      const cog = clamp01(0.5 + 0.16 * nrm());
      A.cog[s] = u8(cog);
      A.emp[s] = u8(0.5 * Ag + 0.5 * (P.empathy + 0.15 * nrm()) + (male ? -0.04 : 0.04));
      A.aggr[s] = u8(P.aggression + 0.25 * (0.5 - Ag) + 0.15 * (Nn - 0.5) + (male ? 0.08 : -0.06) + 0.12 * nrm());
      A.looks[s] = u8(0.5 + 0.16 * nrm());
      // education by cohort
      const cohortEdu = Math.max(0, P.education - 0.11 * Math.max(0, age - 30) * (1 - dev * 0.7) * (P.education / 12));
      let finalEdu = clamp(cohortEdu + 3 * nrm() + 4 * (cog - 0.5), 0, 21);
      if (!male) finalEdu *= 1 - 0.35 * (1 - ge);
      if (age < 6) A.edu[s] = 0;
      else if (age - 6 < finalEdu && age < 26) { A.edu[s] = age - 6; A.occ[s] = OCC.STUDENT; }
      else A.edu[s] = finalEdu;
      // values
      const fg = P.faiths[f];
      const relig = fg.secular ? clamp01(0.05 + 0.05 * nrm()) : clamp01(fg.religiosity + 0.16 * nrm());
      A.relig[s] = relig;
      A.strict[s] = clamp01(fg.strictness + 0.15 * nrm());
      A.toler[s] = clamp01(fg.tolerance * P.tolerance + 0.12 * nrm() + 0.12 * (O - 0.5) + 0.1 * (Ag - 0.5));
      A.social[s] = clamp01(P.socialValues + spread * 0.24 * nrm() - 0.22 * (relig - 0.5) + 0.012 * (A.edu[s] - 10) + (age < 35 ? 0.05 : age > 60 ? -0.05 : 0));
      A.econ[s] = clamp01(P.economicValues + spread * 0.22 * nrm());
      A.auth[s] = clamp01(P.authoritarianism + 0.15 * nrm() + 0.15 * (A.strict[s] - 0.5) - 0.12 * (O - 0.5));
      A.patriot[s] = clamp01(P.patriotism + 0.15 * nrm() + (age > 50 ? 0.05 : 0));
      A.consum[s] = clamp01(P.materialism + 0.15 * nrm() - 0.1 * (relig - 0.5));
      A.itrust[s] = clamp01(P.institutionalTrust + 0.15 * nrm());
      A.strust[s] = clamp01(P.socialTrust + 0.15 * nrm());
      A.extrem[s] = clamp01(0.015 + Math.abs(0.03 * nrm()));
      A.griev[s] = clamp01(0.2 + 0.1 * nrm());
      A.health[s] = clamp(expectedHealth(age) * P.health / 0.75 + 0.07 * nrm(), 0.05, 1);
      A.mental[s] = clamp(0.72 - 0.2 * (Nn - 0.5) + 0.08 * nrm(), 0.05, 1);
      A.happy[s] = clamp01(0.6 + 0.1 * nrm());
      A.mood[s] = 0;
      A.esteem[s] = clamp(0.1 * nrm(), -1, 1);
      // occupation
      if (age < 6) A.occ[s] = OCC.CHILD;
      else if (A.occ[s] !== OCC.STUDENT) {
        if (age < 15) A.occ[s] = OCC.CHILD;
        else if (age >= retireAge && rng.next() < 0.3 + 0.7 * Sc.welfare + 0.3 * dev) A.occ[s] = OCC.RETIRED;
        else if (!male && rng.next() < (1 - ge) * 0.75 * (0.6 + 0.4 * (1 - A.social[s]))) A.occ[s] = OCC.HOMEMAKER;
        else if (rng.next() < 0.06) A.occ[s] = OCC.UNEMPLOYED;
        else A.occ[s] = this.chooseTier(s, true);
      }
      if (!male && age >= 15 && age < 50) A.lastBirth[s] = -Math.round(rng.next() * 40);
      if (age >= 18) {
        adultsByAge[Math.min(100, age | 0)].push(s);
        if (male) singlesMen[Math.min(100, age | 0)].push(s);
      } else children.push(s);
    }
    // ---- couples ----
    const coll = Sc.collectivism;
    for (let a = 18; a <= 95; a++) {
      for (const w of adultsByAge[a]) {
        if (A.sex[w] !== 0) continue;
        const pMarried = (a < 22 ? 0.35 + 0.35 * coll : a < 30 ? 0.6 + 0.2 * coll : a < 70 ? 0.72 + 0.15 * coll : 0.45) * (1 - 0.15 * P.socialValues);
        if (rng.next() > pMarried) continue;
        let found = -1;
        for (let tries = 0; tries < 10 && found < 0; tries++) {
          const ma = Math.min(100, a + Math.round(-1 + rng.next() * 8));
          const list = singlesMen[ma];
          if (!list.length) continue;
          const idx = rng.int(list.length);
          const m = list[idx];
          const interfaith = A.faith[m] !== A.faith[w];
          if (interfaith && rng.next() > 0.12 + 0.3 * A.toler[w] * (1 - A.relig[w])) continue;
          if (tries < 7 && A.home[m] !== A.home[w] && rng.next() < 0.7) continue;
          list[idx] = list[list.length - 1];
          list.pop();
          found = m;
        }
        if (found >= 0) {
          this.marry(w, found, 0.45 + 0.4 * rng.next(), true);
        }
      }
    }
    // ---- children → mothers ----
    const womenByAge: number[][] = adultsByAge.map((list) => list.filter((s) => A.sex[s] === 0));
    for (const c of children) {
      const ca = (-A.birth[c]) / 12;
      let mother = -1;
      for (let tries = 0; tries < 8 && mother < 0; tries++) {
        const ma = Math.round(ca + 19 + rng.next() * 18);
        if (ma > 100) continue;
        const list = womenByAge[ma];
        if (!list.length) continue;
        const m = list[rng.int(list.length)];
        if (A.kids[m] >= 7) continue;
        mother = m;
      }
      if (mother < 0) continue;
      this.linkChild(c, mother, true);
    }
    // young adults also have living parents (not co-resident)
    for (let a = 18; a < 32; a++) {
      for (const s of adultsByAge[a]) {
        if (rng.next() > 0.75) continue;
        const ma = Math.round(a + 20 + rng.next() * 16);
        if (ma > 100) continue;
        const list = womenByAge[ma];
        if (!list.length) continue;
        const m = list[rng.int(list.length)];
        if (A.kids[m] >= 7 || A.faith[m] !== A.faith[s]) continue;
        this.linkChild(s, m, false);
      }
    }
    // ---- wealth: lognormal with requested inequality, scaled by occupation ----
    const sigma = Math.SQRT2 * invNormCdf((clamp(P.wealthInequality, 0.2, 0.95) + 1) / 2);
    let wsum = 0, nAdults = 0;
    for (let s = 0; s < A.n; s++) {
      const age = -A.birth[s] / 12;
      if (age < 18) { A.wealth[s] = 0; continue; }
      const o = A.occ[s];
      const om = o === OCC.ELITE ? 6 : o === OCC.OWNER ? 2.5 : o === OCC.PROFESSIONAL ? 1.4 : o === OCC.LABORER ? 0.6 : o === OCC.UNEMPLOYED ? 0.3 : o === OCC.RETIRED ? 1.2 : 1;
      const w = Math.exp(sigma * nrm() - sigma * sigma / 2) * om * (0.4 + Math.min(1.6, age / 40));
      A.wealth[s] = rng.next() < 0.08 ? -w * 0.1 : w;
      wsum += A.wealth[s];
      nAdults++;
    }
    const meanW = 3.5 * Sc.gdpPerCapita;
    const scale = meanW / Math.max(1e-9, wsum / Math.max(1, nAdults));
    for (let s = 0; s < A.n; s++) A.wealth[s] *= scale;
    // elites: the richest well-educated
    // economic views lean right with wealth (self-interest)
    this.computeQuantiles(true);
    for (let s = 0; s < A.n; s++) {
      const wp = this.pct(this.wealthQ, A.wealth[s]);
      A.econ[s] = clamp01(A.econ[s] + 0.14 * (wp - 0.5));
    }
    this.rebuildGrid();
    this.aggregateCellsOnly();
    this.seedAspirants();
    // ---- initial economy calibration (after elites exist) ----
    let leff = 0, emp = 0, pw = 0;
    for (let s = 0; s < A.n; s++) {
      if (IS_EMPLOYED[A.occ[s]]) { leff += this.skill(s); emp++; }
      if (A.wealth[s] > 0) pw += A.wealth[s];
    }
    this.S.L0 = Math.max(1, leff);
    this.S.prod = (Sc.gdpPerCapita * A.live) / Math.max(1, leff);
    this.acc.skill = leff;
    this.acc.employed = emp;
    this.acc.alive = A.live;
    this.lastLeff = leff;
    this.lastEmployed = emp;
    this.lastPosWealth = Math.max(1, pw);
    this.S.gdpHist = new Array(12).fill(Sc.gdpPerCapita);
    this.formParties(true);
    this.S.nextElection = this.S.democracy >= 0.45 ? 12 * Math.max(1, Math.round(this.cfg.society.electionYears * this.rng.next())) : 0;
    this.addNews(`${this.cfg.society.name} begins in ${this.cfg.society.startYear}: ${compactInt(A.live)} people, ${this.S.regimeLabel.toLowerCase()}.`, 'society', 1);
    this.computeQuantiles(false);
    this.collectStats(true);
  }

  private lastLeff = 1;
  private lastEmployed = 1;
  private lastPosWealth = 1;

  private seedAspirants() {
    const A = this.A;
    let asp = 0, adults = 0;
    for (let s = 0; s < A.n; s++) {
      if (!A.alive[s]) continue;
      const age = (this.t - A.birth[s]) / 12;
      if (age >= 18) adults++;
      if (A.edu[s] >= 16 && age >= 25 && age < 56) asp++;
    }
    this.eliteSlots = Math.max(1, Math.round(adults * 0.015));
    // promote initial elites
    const cands: number[] = [];
    for (let s = 0; s < A.n; s++) if (A.alive[s] && (A.occ[s] === OCC.PROFESSIONAL || A.occ[s] === OCC.OWNER) && (this.t - A.birth[s]) / 12 > 30) cands.push(s);
    cands.sort((a, b) => this.eliteScore(b) - this.eliteScore(a));
    for (let k = 0; k < Math.min(this.eliteSlots, cands.length); k++) {
      A.occ[cands[k]] = OCC.ELITE;
      A.wealth[cands[k]] *= 3;
    }
    this.S.aspirantBase = Math.max(1, asp) / this.eliteSlots;
  }

  private eliteScore(s: number): number {
    const A = this.A;
    const S = this.S;
    let sc = 0.35 * this.pct(this.wealthQ, A.wealth[s]) + 0.25 * (A.cog[s] / 255) + 0.15 * Math.min(1, A.edu[s] / 18) + 0.15 * (A.E[s] / 255) + 0.1 * this.rng.next();
    if (S.religiousPolicy !== 'neutral' && S.religiousPolicy !== 'suppress' && A.faith[s] === S.favoredFaith) sc += 0.08;
    if (this.isMinority(A.faith[s])) sc -= 0.15 * S.minorityBias;
    // regimes promote loyalists
    sc -= 0.25 * (1 - S.democracy) * ideoDist(this.ideologyOf(s), S.ruling);
    return sc;
  }

  ideologyOf(s: number): Ideology {
    const A = this.A;
    return { social: A.social[s], econ: A.econ[s], auth: A.auth[s], relig: A.relig[s], patriot: A.patriot[s] };
  }

  isMinority(f: number): boolean {
    return f !== this.majorityFaith && f !== this.secularFaith && this.faithShareNow[f] < 0.4;
  }

  private linkChild(c: number, m: number, coreside: boolean) {
    const A = this.A;
    A.mother[c] = A.ref(m);
    A.kids[m]++;
    const p = A.deref(A.partner[m]);
    if (p >= 0) { A.father[c] = A.ref(p); A.kids[p]++; }
    if (coreside) {
      A.faith[c] = A.faith[m];
      A.home[c] = A.home[m];
      this.setPos(c, clampX(A.x[m] + (this.rng.next() - 0.5) * 1.2), clampY(A.y[m] + (this.rng.next() - 0.5) * 1.2));
      // children's values start close to their parents'
      const mix = (arr: Float32Array) => { arr[c] = clamp01(0.6 * arr[m] + 0.4 * arr[c]); };
      mix(A.relig); mix(A.social); mix(A.econ); mix(A.auth); mix(A.patriot); mix(A.strict); mix(A.toler); mix(A.itrust);
    }
  }

  private marry(a: number, b: number, bond: number, init = false) {
    const A = this.A;
    A.partner[a] = A.ref(b);
    A.partner[b] = A.ref(a);
    A.bond[a] = bond;
    A.bond[b] = bond;
    // the couple sets up one household (at the husband's or wife's place)
    const host = A.sex[a] === 1 ? a : b;
    const mover = host === a ? b : a;
    if (!init && this.rng.next() < 0.35) {
      this.relocate(host, A.home[host], true);
    }
    A.home[mover] = A.home[host];
    this.setPos(mover, clampX(A.x[host] + (this.rng.next() - 0.5) * 0.8), clampY(A.y[host] + (this.rng.next() - 0.5) * 0.8));
    if (!init) {
      this.acc.marriages++;
      // interfaith marriage: the less devout partner may convert
      if (A.faith[a] !== A.faith[b]) {
        const lo = A.relig[a] < A.relig[b] ? a : b;
        const hi = lo === a ? b : a;
        if (this.rng.next() < 0.1 + 0.35 * (A.relig[hi] - A.relig[lo]) + 0.15 * this.S.collectivism) this.convert(lo, A.faith[hi]);
      }
      if (A.flags[a] & F.FOLLOW) this.log(a, `Married ${personName(A.uid[b], A.sex[b])}.`);
      if (A.flags[b] & F.FOLLOW) this.log(b, `Married ${personName(A.uid[a], A.sex[a])}.`);
    }
  }

  private convert(s: number, f: number) {
    const A = this.A;
    if (A.faith[s] === f) return;
    const from = this.cfg.population.faiths[A.faith[s]].name;
    A.faith[s] = f;
    this.acc.conversions++;
    if (this.cfg.population.faiths[f].secular) A.relig[s] = Math.min(A.relig[s], 0.1);
    if (A.flags[s] & F.FOLLOW) this.log(s, `Left ${from} and joined ${this.cfg.population.faiths[f].name}.`);
  }

  setPos(s: number, x: number, y: number) {
    this.A.x[s] = x;
    this.A.y[s] = y;
    this.A.cell[s] = cellOf(x, y);
  }

  /** Move to a new home in settlement `st`, preferring neighbourhoods that suit them (Schelling). */
  relocate(s: number, st: number, keepPartner = false) {
    const A = this.A;
    const rng = this.rng;
    const pos = { x: 0, y: 0 };
    const f = A.faith[s];
    const pref = (1 - A.toler[s]) * (0.3 + 0.7 * A.relig[s]) + (this.isMinority(f) ? 0.4 * A.fear[s] + 0.3 * this.S.minorityBias : 0);
    const wp = this.pct(this.wealthQ, A.wealth[s]);
    let bx = 0, by = 0, best = -1e9;
    for (let k = 0; k < 4; k++) {
      this.world.place(rng, st, pos);
      const c = cellOf(pos.x, pos.y);
      const n = this.cN[c];
      const own = n > 0 ? this.cFaith[c * MAX_FAITHS + f] / n : 0.5;
      const cw = n > 0 ? this.cWealth[c] / n : this.wealthMedian;
      const rel = this.wealthMedian > 0 ? Math.log(Math.max(1, cw) / Math.max(1, this.wealthMedian)) : 0;
      const fit = -Math.abs(rel / 2 - (wp - 0.5) * 2);
      const score = pref * own + 0.3 * fit + rng.next() * 0.25;
      if (score > best) { best = score; bx = pos.x; by = pos.y; }
    }
    A.home[s] = st;
    this.setPos(s, bx, by);
    if (keepPartner) {
      const p = A.deref(A.partner[s]);
      if (p >= 0) { A.home[p] = st; this.setPos(p, clampX(bx + (rng.next() - 0.5) * 0.8), clampY(by + (rng.next() - 0.5) * 0.8)); }
    }
  }

  // ==============================================================================================
  // Main tick
  // ==============================================================================================

  /**
   * Re-order people in memory by neighbourhood (counting sort on grid cell) and drop dead slots.
   * Neighbours, families and friends then sit close together in memory, which makes the random
   * social contacts cache-friendly — the single biggest speed-up for million-person runs.
   */
  compact() {
    const A = this.A;
    const n = A.n;
    const start = new Int32Array(NCELLS + 1);
    for (let i = 0; i < n; i++) if (A.alive[i]) start[A.cell[i] + 1]++;
    for (let c = 0; c < NCELLS; c++) start[c + 1] += start[c];
    const count = start[NCELLS];
    const order = new Int32Array(count);
    const map = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      if (!A.alive[i]) continue;
      const k = start[A.cell[i]]++;
      order[k] = i;
      map[i] = k;
    }
    const remap = (r: number, deadValue: number) => {
      if (r < 0) return r;
      const s = r >>> 8;
      if (s >= n || A.gen[s] !== (r & 255)) return -1;
      if (!A.alive[s]) return deadValue;
      return map[s] * 256;
    };
    for (let i = 0; i < n; i++) {
      if (!A.alive[i]) continue;
      A.mother[i] = remap(A.mother[i], -1);
      A.father[i] = remap(A.father[i], -1);
      A.partner[i] = remap(A.partner[i], -2);
      const b = i * FRIEND_SLOTS;
      for (let k = 0; k < FRIEND_SLOTS; k++) A.friends[b + k] = remap(A.friends[b + k], -1);
    }
    for (const l of this.leaders) {
      const r = remap(l.ref, -1);
      l.ref = r;
      if (r < 0 && l.alive) l.alive = false;
    }
    A.permute(order, count);
    this.estate.fill(0);
    this.compactions++;
  }

  compactions = 0;

  tick() {
    this.t++;
    this.newsSince = this.news.length;
    const A = this.A;
    if (this.t % 12 === 1 && A.n > 2000) this.compact();
    if (A.ensureHeadroom(Math.ceil(A.live * 0.01) + 4096 + this.pendingMigrants)) this.ensureAux();
    this.rebuildGrid();
    this.macro();
    this.acc.reset();
    this.sampleN = 0;
    this.sampleStride = Math.max(1, Math.floor(A.live / 4096));
    this.sampleCounter = 0;
    this.meanStride = Math.max(1, Math.floor(A.live / 24000));
    this.meanCounter = 0;
    this.nN.fill(0); this.nSocial.fill(0); this.nRelig.fill(0); this.nPatriot.fill(0); this.nConsum.fill(0);
    this.nToler.fill(0); this.nWealth.fill(0); this.nProtest.fill(0); this.nInf.fill(0); this.nFaith.fill(0); this.crimeNow.fill(0);
    this.settlementPop.fill(0); this.settlementProtest.fill(0);
    this.redistPool = 0;
    const n = A.n;
    for (let i = 0; i < n; i++) {
      if (A.alive[i] && A.birth[i] !== this.t) this.step(i);
    }
    this.postLoop();
  }

  private rebuildGrid() {
    const A = this.A;
    const start = this.cellStart;
    start.fill(0);
    const n = A.n;
    for (let i = 0; i < n; i++) if (A.alive[i]) start[A.cell[i] + 1]++;
    for (let c = 0; c < NCELLS; c++) start[c + 1] += start[c];
    const fill = new Int32Array(NCELLS);
    const list = this.cellList;
    for (let i = 0; i < n; i++) {
      if (!A.alive[i]) continue;
      const c = A.cell[i];
      list[start[c] + fill[c]++] = i;
    }
  }

  private randomInCell(c: number, self: number): number {
    const a = this.cellStart[c], b = this.cellStart[c + 1];
    if (b - a < 2) return -1;
    const j = this.cellList[a + this.rng.int(b - a)];
    return j === self || !this.A.alive[j] ? -1 : j;
  }

  private randomNear(c: number, self: number, radius: number): number {
    const cx = c % GRID_W, cy = (c / GRID_W) | 0;
    const nx = clamp(cx + this.rng.int(2 * radius + 1) - radius, 0, GRID_W - 1);
    const ny = clamp(cy + this.rng.int(2 * radius + 1) - radius, 0, GRID_H - 1);
    return this.randomInCell(ny * GRID_W + nx, self);
  }

  // ==============================================================================================
  // Macro: economy, institutions, events (before the agent loop)
  // ==============================================================================================

  private macro() {
    const S = this.S;
    const rng = this.rng;
    // ---- events: scheduled, random, progress ----
    this.fireScheduled();
    if (this.cfg.society.randomEvents) this.rollRandomEvents();
    this.compileEvents();

    // ---- development, healthcare, mortality ----
    S.dev = devIndex(S.gdppc);
    S.agrarian = clamp01(1.1 - S.dev * 1.5);
    this.updateHealthcare();
    this.updateMortalityTables();
    S.subs = subsistence(S.gdppc) / 12;

    // ---- production ----
    const landShare = 0.4 * S.agrarian;
    const leff = Math.max(1, this.lastLeff);
    const landFactor = Math.pow(leff / S.L0, -landShare);
    // Frontier growth, scaled by institution quality (Acemoglu & Robinson), plus conditional
    // catch-up for poorer countries with decent institutions and schooling (Barro 1991).
    const inst = clamp01(0.55 * S.ruleOfLaw + 0.3 * Math.min(S.marketFreedom, 1.6 - S.marketFreedom) / 0.8 + 0.15 * (1 - S.repression));
    const eduReady = clamp01(((this.latest.edu ?? 6) - 2) / 10);
    const g = S.baseGrowth * (0.35 + 0.65 * inst) + this.growthAdd
      + 0.035 * (1 - S.dev) * inst * eduReady * (1 - 0.85 * S.agrarian)
      - (S.conflict ? 0.03 : 0) - 0.02 * Math.min(1, S.violentFrac / 0.01)
      + this.leaderGrowth;
    S.prod *= 1 + g / 12;
    S.gap = S.gap * 0.97 + this.gapShock + 0.0035 * rng.normal() * (S.agrarian > 0.5 ? 1.6 : 1);
    S.gap = clamp(S.gap, -0.6, 0.25);
    const warDrain = S.warActive ? 0.97 : 1;
    const Ymonth = (S.prod / 12) * leff * landFactor * (1 + S.gap) * warDrain;
    const pop = Math.max(1, this.A.live);
    S.gdppc = (Ymonth * 12) / pop;
    S.gdpHist.push(S.gdppc);
    if (S.gdpHist.length > 13) S.gdpHist.shift();
    S.growth = S.gdpHist[0] > 0 ? S.gdppc / S.gdpHist[0] - 1 : 0;
    const capShare = clamp(0.3 + 0.25 * landShare + S.capShareAdj + 0.35 * S.automation - 0.1 * (1 - S.marketFreedom), 0.12, 0.75);
    S.wageUnit = ((1 - capShare) * Ymonth) / leff;
    S.avgWage = S.wageUnit * (leff / Math.max(1, this.lastEmployed));
    S.rMonth = clamp((capShare * Ymonth * 0.7) / Math.max(1, this.lastPosWealth), 0.0008, 0.011);

    // ---- inflation ----
    const printing = Math.max(0, S.debtRatio - 1.1) * 0.15 * (1 - S.ruleOfLaw);
    const piTarget = 0.02 * (1 - S.agrarian) + 0.4 * S.gap + this.inflAdd + printing + (S.warActive ? 0.04 : 0);
    S.inflation += 0.25 * (piTarget - S.inflation);
    S.inflation = clamp(S.inflation, -0.25, 60);
    this.erosion = clamp(1 - 1 / (1 + Math.max(0, S.inflation) / 12), 0, 0.95);
    this.realWage = 1 / (1 + Math.max(0, S.inflation - 0.06) * 0.12);
    this.realWage = Math.max(0.3, this.realWage);

    // ---- labour market ----
    S.automationRecent = S.automationRecent * 0.989 + this.automationShock;
    const automationUnemp = 0.6 * S.automationRecent;
    this.uTarget = clamp((0.045 + 0.03 * (1 - S.ruleOfLaw)) * (1 - 0.6 * S.agrarian) - 0.5 * S.gap + this.unempAdd + automationUnemp, 0.015, 0.6);
    const u = S.unemployment;
    this.sepRate = 0.012 * (1 + Math.max(0, -this.gapShock) * 30);
    this.findRate = clamp((this.sepRate * (1 - this.uTarget)) / this.uTarget * (1 + 4 * (u - this.uTarget)), 0.005, 0.85);

    // ---- public finances ----
    const publicGoods = Ymonth * (0.025 + 0.045 * S.eduAccess + 0.06 * S.healthSpend + 0.03 * S.military + 0.012 * S.policing + (S.warActive ? 0.12 : 0));
    const interest = (S.debt * (0.025 + Math.max(0, S.debtRatio - 0.8) * 0.06)) / 12;
    const deficit = this.lastTransfers + publicGoods + interest - this.lastTaxes;
    S.debt += deficit;
    // inflation erodes the real value of nominal public debt (how Weimar's debt "vanished")
    S.debt /= 1 + Math.max(-0.02, Math.min(S.inflation, 20)) / 12;
    S.debtRatio = S.debt / Math.max(1, Ymonth * 12);
    if (S.debtRatio > 2.2 && !this.events.some((e) => e.spec.id === 'debtCrisis')) {
      // sovereign default: creditors take a haircut, the economy and trust take a hit
      S.debt *= 0.45;
      S.debtRatio *= 0.45;
      this.startEvent(TEMPLATE_BY_ID.debtCrisis, 1, false);
      this.addNews('The state defaults on its debts. Creditors lose half their money.', 'economy', 2);
    }
    // governments do not hoard: accumulated surpluses are spent on public goods over a few years
    if (S.debt < 0) S.debt *= 0.985;
    // immigrants are drawn to rich, peaceful, job-creating societies with open borders
    const pull = clamp01((S.gdppc - 8000) / 40000) * (1 - Math.min(1, S.unemployment * 6)) * (S.conflict || S.warActive ? 0.2 : 1);
    this.immigrantAcc += (pop * 0.012 * S.immigration * pull) / 12;
    if (this.immigrantAcc >= 1) {
      const k = Math.floor(this.immigrantAcc);
      this.immigrantAcc -= k;
      this.pendingMigrants += k;
      if (!this.pendingMigrantProfile) this.pendingMigrantProfile = { faith: -2, religiosity: 0.65, education: Math.max(4, (this.latest.edu ?? 10) - 2), wealth: 0.25, strictness: 0.5, social: 0.4 };
    }
    if (S.politicsEndogenous && S.debtRatio > 0.95) {
      S.taxRate = Math.min(0.55, S.taxRate + 0.0006);
      S.welfare = Math.max(0, S.welfare - 0.0008);
    }

    // ---- institutions drift ----
    this.institutionsDrift();

    // ---- social context for the agent loop ----
    this.globalProtest = S.protestFrac;
    this.visibility = clamp01(0.25 + 0.45 * S.pressFreedom + 0.45 * S.socialMedia);
    this.propaganda = clamp01((1 - S.pressFreedom) * 0.5 + this.propagandaAdd);
    this.repEff = S.repression * (1 - 0.8 * S.democracy) * (0.4 + 0.6 * S.securityLoyalty);
    this.policingEff = S.policing * (0.4 + 0.6 * S.ruleOfLaw);
    this.concession = S.democracy > 0.5 && S.protestFrac > 0.008 ? 0.015 * S.democracy : 0;
    this.honeymoon = Math.max(0, 0.15 * (1 - (this.t - S.regimeSince) / 30));
    this.meanSocial = this.latest.social ?? 0.5;
    this.meanEcon = this.latest.econ ?? 0.5;
    this.ustar = clamp(0.12 + 0.75 * S.dev, 0.1, 0.88);
    // war
    this.warCasualty = S.warActive ? 0.0035 * Math.min(2, this.warMobilTarget / 0.2) : 0;
    this.warFear = S.warActive ? 0.25 : 0;
    this.conflictFear = S.conflict ? 0.4 : 0;
    // epidemic
    this.globalInfFrac = S.infected / pop;
    this.lockdown = S.epiActive && this.globalInfFrac > 0.01 && S.H > 0.4 ? 0.3 + 0.2 * (1 - S.democracy * 0.5) : 0;
    this.epiFear = S.epiActive ? Math.min(0.5, this.globalInfFrac * 8) : 0;
    // elites
    this.eliteSlots = Math.max(1, Math.round((this.latest.adults ?? pop * 0.7) * (0.01 + 0.008 * S.democracy)));
    this.eliteCount = this.lastElites;
    // redistribution
    this.redistTake = this.pendingRedist;
    this.pendingRedist = 0;
    this.redistGive = this.redistCarry / Math.max(1, (this.latest.adults ?? 1) * 0.5);
    this.redistCarry = 0;
    // leaders
    this.leaderPos = this.leaders.filter((l) => l.alive);
  }

  private leaderGrowth = 0;
  private lastTransfers = 0;
  private lastTaxes = 0;
  private lastElites = 0;
  private pendingRedist = 0;
  private redistCarry = 0;
  private pendingMigrants = 0;

  /**
   * Healthcare quality = the era's medical technology × people's access to it. Medical
   * technology follows a logistic curve centred on the mid-20th century (antibiotics,
   * vaccines); access depends on income and public health spending. This reproduces the
   * Preston curve and its upward shift over time (Preston 1975; Cutler et al. 2006).
   */
  private updateHealthcare() {
    const S = this.S;
    const year = this.cfg.society.startYear + this.t / 12;
    const medTech = 0.03 + 0.95 / (1 + Math.exp(-(year - 1905) / 28)) + S.medBoost;
    const access = clamp01(0.25 + 0.5 * S.dev + 0.35 * S.healthSpend);
    S.H = clamp01(0.08 + 0.88 * Math.min(1, medTech) * Math.pow(access, 0.7));
  }

  private updateMortalityTables() {
    const H = this.S.H;
    // Gompertz–Makeham adult mortality + child mortality, calibrated so that life expectancy is
    // ≈31 at H=0.08 (pre-industrial), ≈59 at 0.5, ≈73 at 0.72 and ≈84 at 0.9.
    const Am = 0.0003 + 0.0085 * Math.pow(1 - H, 1.6);
    const B = 0.000016 + 0.00011 * Math.pow(1 - H, 1.3);
    const G = 0.088;
    for (let a = 0; a <= 120; a++) this.gomp[a] = Am + B * Math.exp(G * a);
    this.childMu = 0.0012 + 0.075 * Math.pow(1 - H, 2);
  }

  private institutionsDrift() {
    const S = this.S;
    // contraception spreads with development and women's status
    const cTarget = clamp01(0.05 + 0.85 * S.dev + 0.2 * S.genderEquality - 0.05);
    S.contraception += (cTarget - S.contraception) / 240;
    // education & health spending slowly follow development (states invest as they grow)
    S.eduAccess += (Math.max(S.eduAccess, 0.2 + 0.75 * S.dev) - S.eduAccess) / 600;
    // democratic consolidation (modernization) or backsliding under authoritarian rulers
    const instStrength = 0.5 * S.ruleOfLaw + 0.5 * Math.min(1, (this.t - S.regimeSince) / 480);
    if (S.democracy >= 0.5) {
      if (S.ruling.auth > 0.62) S.democracy -= 0.0018 * ((S.ruling.auth - 0.6) / 0.4) * (1 - instStrength) * (this.headLeaderStyle() === 'demagogue' ? 2 : 1);
      else if (S.dev > 0.55 && S.ruling.auth < 0.5) S.democracy += 0.0004 * (0.95 - S.democracy);
    }
    S.democracy = clamp01(S.democracy);
    if (S.politicsEndogenous) this.policyDrift();
    // security forces loyalty
    const nonviolent = S.protestFrac > 0 ? 1 - S.violentFrac / Math.max(1e-9, S.protestFrac) : 1;
    const soldierTrust = this.latest.soldierTrust ?? 0.5;
    const lTarget = clamp01(0.25 + 0.3 * soldierTrust + 0.2 * S.military + 0.25 * S.legitimacy - 0.6 * Math.max(0, S.protestFrac - 0.01) / 0.03 * nonviolent * (0.5 + S.repression));
    S.securityLoyalty += 0.03 * (lTarget - S.securityLoyalty);
    S.securityLoyalty = clamp01(S.securityLoyalty);
  }

  private headLeaderStyle(): LeaderStyle | null {
    const l = this.leaders.find((x) => x.id === this.S.headLeader && x.alive);
    return l ? l.style : null;
  }

  /** Governments move policy toward their platform (about 4 years to implement). */
  private policyDrift() {
    const S = this.S;
    const r = S.ruling;
    const k = 1 / 48;
    const mv = (cur: number, target: number) => cur + (target - cur) * k;
    S.taxRate = mv(S.taxRate, clamp(0.12 + 0.3 * (1 - r.econ) * (0.5 + 0.5 * S.dev), 0.05, 0.55));
    S.progressivity = mv(S.progressivity, clamp01(0.15 + 0.75 * (1 - r.econ)));
    S.welfare = mv(S.welfare, clamp01((0.05 + 0.85 * (1 - r.econ)) * (0.3 + 0.7 * S.dev)));
    S.marketFreedom = mv(S.marketFreedom, clamp01(0.15 + 0.8 * r.econ));
    S.genderEquality = mv(S.genderEquality, clamp01(0.1 + 0.85 * r.social));
    S.military = mv(S.military, clamp01(0.15 + 0.6 * r.patriot));
    S.policing = mv(S.policing, clamp01(0.25 + 0.5 * r.auth));
    const favorTarget = r.relig > 0.75 ? 0.25 : 0;
    S.minorityBias = mv(S.minorityBias, clamp01(0.05 + 0.45 * r.patriot * (1 - r.social) + favorTarget));
    // the press and the use of force are constrained by democratic institutions
    S.pressFreedom = mv(S.pressFreedom, clamp01(S.democracy * (1 - 0.45 * Math.max(0, r.auth - 0.4)) + 0.05));
    S.repression = mv(S.repression, clamp01((1 - S.democracy) * (0.25 + 0.65 * r.auth) + 0.1 * r.auth));
    if (r.relig > 0.8 && r.auth > 0.6) {
      if (S.religiousPolicy === 'neutral') { S.religiousPolicy = 'favor'; S.favoredFaith = this.majorityFaith; }
    } else if (r.relig < 0.15 && r.auth > 0.7) S.religiousPolicy = 'suppress';
    else if (S.democracy > 0.6 && r.social > 0.5 && S.religiousPolicy !== 'neutral') S.religiousPolicy = 'neutral';
  }

  // ==============================================================================================
  // Events
  // ==============================================================================================

  private fireScheduled() {
    for (const ev of this.cfg.timeline) {
      if (ev.fired) continue;
      const evTick = (ev.year - this.cfg.society.startYear) * 12 + ev.month;
      if (evTick > this.t) continue;
      ev.fired = true;
      if (evTick < this.t - 1) continue; // in the past when loaded
      const spec = resolveScheduled(ev);
      if (spec) this.startEvent(spec, ev.intensity, false, ev.target);
    }
  }

  /** Public: start an event now (from the UI). */
  triggerEvent(spec: EventSpec, intensity: number, target?: Target) {
    return this.startEvent(spec, intensity, false, target);
  }

  stateView(): StateView {
    const S = this.S;
    const L = this.latest;
    let maxShare = 0;
    for (let f = 0; f < this.K; f++) maxShare = Math.max(maxShare, this.faithShareNow[f]);
    return {
      year: this.year, gdppc: S.gdppc, growth: S.growth, unemployment: S.unemployment, inflation: S.inflation,
      gini: L.gini ?? 0.35, democracy: S.democracy, repression: S.repression, legitimacy: S.legitimacy, psi: S.psi,
      protest: S.protestFrac, extremists: L.extrem ?? 0, patriot: L.patriot ?? 0.5, auth: L.auth ?? 0.5, toler: L.toler ?? 0.5,
      relig: L.relig ?? 0.5, socialMedia: S.socialMedia, debtRatio: S.debtRatio, youth: L.youth ?? 0.15, atWar: S.warActive,
      epidemic: S.epiActive, diversity: 1 - maxShare, itrust: L.itrust ?? 0.5, marketFreedom: S.marketFreedom, military: S.military,
      ruleOfLaw: S.ruleOfLaw, agrarian: S.agrarian,
    };
  }

  private rollRandomEvents() {
    const view = this.stateView();
    const rate = this.cfg.society.eventRate;
    for (const tpl of TEMPLATES) {
      if (!tpl.baseRate) continue;
      if (this.events.some((e) => e.spec.id === tpl.id)) continue;
      if (tpl.id === 'war' && this.S.warActive) continue;
      const p = (tpl.baseRate / 12) * rate * (tpl.likelihood ? Math.max(0, tpl.likelihood(view)) : 1);
      if (this.rng.next() < p) {
        const intensity = tpl.category === 'people' ? 1 : clamp(0.55 + this.rng.next() * 0.9, 0.3, 1.5);
        this.startEvent(tpl, intensity, true);
        return; // at most one random event per month
      }
    }
  }

  private pickTargetFaith(mode: 'minority' | 'extremists' | 'none' | undefined, fallback: number | undefined): number | undefined {
    if (mode === 'minority') {
      let best = -1, bs = 2;
      for (let f = 0; f < this.K; f++) {
        if (f === this.majorityFaith || f === this.secularFaith) continue;
        if (this.faithShareNow[f] > 0.005 && this.faithShareNow[f] < bs) { bs = this.faithShareNow[f]; best = f; }
      }
      return best >= 0 ? best : undefined;
    }
    if (mode === 'extremists') {
      let best = -1, bv = 0;
      for (let f = 0; f < this.K; f++) if (this.acc.faithExtrem[f] > bv) { bv = this.acc.faithExtrem[f]; best = f; }
      return best >= 0 ? best : fallback;
    }
    return fallback;
  }

  private startEvent(spec: EventSpec, intensity: number, random: boolean, targetOverride?: Target): ActiveEvent {
    const target: Target = { ...(spec.target ?? {}), ...(targetOverride ?? {}) };
    if (random && spec.randomTarget) {
      const f = this.pickTargetFaith(spec.randomTarget, target.faith);
      if (f === undefined) delete target.faith; else target.faith = f;
    }
    if (target.faith !== undefined && target.faith >= this.K) delete target.faith;
    if (target.settlement === -2) target.settlement = this.world.pick(this.rng, 0.6);
    const ev: ActiveEvent = {
      uid: this.nextEventUid++, spec, start: this.t, intensity, target,
      weights: shapeWeights(spec.shape, spec.duration), random, leaderId: -1,
    };
    this.events.push(ev);
    const where = target.settlement !== undefined && target.settlement >= 0 ? ` in ${this.world.settlements[target.settlement].name}` : '';
    const who = target.faith !== undefined ? ` (${this.cfg.population.faiths[target.faith].name})` : '';
    const positive = POSITIVE_EVENTS.has(spec.id);
    const sev = intensity >= 1.25 ? (positive ? 'Major ' : 'Severe ') : intensity <= 0.6 ? (positive ? 'Modest ' : 'Mild ') : '';
    if (spec.regime) this.setRegime(spec.regime);
    if (spec.leader) {
      const l = this.spawnLeader(spec.leader, target, spec.duration);
      if (l) {
        ev.leaderId = l.id;
        this.addNews(`${l.name}, a ${LEADER_LABEL[l.style]}, gains a following${where}.`, 'people', 2);
      }
    } else {
      this.addNews(`${sev}${spec.name.toLowerCase().startsWith('a ') ? spec.name : spec.name}${where}${who}${random ? '' : ' (scripted)'}.`, spec.category, spec.category === 'conflict' || spec.category === 'health' || intensity > 1.1 ? 2 : 1);
    }
    if (spec.effects.war) {
      this.S.warActive = true;
      this.S.warMonths = 0;
    }
    if (spec.effects.epidemic) {
      this.S.epiActive = true;
      this.S.epiProfile = spec.ifrProfile === 'covid' ? 1 : spec.ifrProfile === 'flu1918' ? 2 : 0;
      this.seedInfection(0.002);
    }
    if (spec.id === 'assassination') {
      const alive = this.leaders.filter((l) => l.alive);
      if (alive.length) {
        const victim = alive[this.rng.int(alive.length)];
        const s = this.A.deref(victim.ref);
        if (s >= 0) this.die(s, DEATH.VIOLENCE);
      }
    }
    return ev;
  }

  private endEvent(ev: ActiveEvent) {
    const S = this.S;
    if (ev.spec.effects.war) {
      S.warActive = false;
      const win = this.rng.next() < clamp(0.5 + 0.35 * (S.military - 0.4) + 0.15 * (S.legitimacy - 0.5), 0.1, 0.9);
      if (win) {
        this.addNews('The war ends in victory. The nation celebrates.', 'conflict', 2);
        this.pushAll({ patriot: 0.5, itrust: 0.4, mood: 0.6 });
      } else {
        this.addNews('The war ends in defeat. Humiliation and anger spread.', 'conflict', 2);
        this.pushAll({ griev: 0.6, patriot: 0.3, itrust: -0.6, mood: -0.5, auth: 0.2 });
        S.gap -= 0.06;
        S.legitimacy *= 0.7;
      }
    }
    if (ev.spec.effects.epidemic) {
      S.epiActive = false;
      S.epiR = 0;
      const A = this.A;
      for (let i = 0; i < A.n; i++) A.disease[i] = DIS.S;
      this.addNews(`${ev.spec.name} subsides.`, 'health', 1);
    }
    if (ev.leaderId >= 0) {
      const l = this.leaders.find((x) => x.id === ev.leaderId);
      if (l && l.alive) {
        l.alive = false;
        if (l.inPower) { l.inPower = false; if (S.headLeader === l.id) S.headLeader = -1; }
        this.addNews(`${l.name} withdraws from public life.`, 'people', 1);
      }
    }
  }

  /** Apply an immediate one-off push to everyone (e.g. war outcome). */
  private pushAll(p: Partial<Record<(typeof PUSH_DIMS)[number], number>>) {
    const push = new Float32Array(PUSH_DIMS.length);
    PUSH_DIMS.forEach((d, k) => { push[k] = p[d] ?? 0; });
    for (let i = 0; i < this.A.n; i++) if (this.A.alive[i]) this.applyPush(i, push, 3);
  }

  private compileEvents() {
    const S = this.S;
    this.gPush.fill(0);
    this.gActive = false;
    this.gMort = 0; this.gMortProfile = 0; this.gEmig = 0; this.gWealthLoss = 0; this.gSeed = 0; this.gCrime = 0; this.gUrban = 0;
    this.fEffs = [];
    this.growthAdd = 0; this.inflAdd = 0; this.unempAdd = 0; this.gapShock = 0; this.propagandaAdd = 0;
    this.warMobilTarget = 0;
    this.automationShock = 0;
    let epiR = 0, epiIFR = 0;
    const keep: ActiveEvent[] = [];
    for (const ev of this.events) {
      const m = this.t - ev.start;
      const dur = Math.max(1, Math.round(ev.spec.duration));
      if (m >= dur) { this.endEvent(ev); continue; }
      keep.push(ev);
      const I = ev.intensity;
      const wTot = ev.weights[m] ?? 0;
      const lvl = shapeLevel(ev.spec.shape, m, dur);
      const tg = ev.target;
      const hasFilter = tg.faith !== undefined || tg.settlement !== undefined || tg.urban || tg.rural || tg.minAge !== undefined || tg.maxAge !== undefined || tg.sex !== undefined || tg.wealthClass !== undefined || (tg.share !== undefined && tg.share < 1);
      let ce: CompiledEffect | null = null;
      const eff = () => {
        if (!hasFilter) return null;
        if (!ce) { ce = newCompiled(tg); this.fEffs.push(ce); }
        return ce;
      };
      for (const key of Object.keys(ev.spec.effects) as EffectKey[]) {
        const val = ev.spec.effects[key] ?? 0;
        if (!val) continue;
        const def = EFFECTS[key];
        const amt = def.mode === 'total' ? val * I * wTot : val * I * lvl;
        switch (key) {
          case 'gdp': this.gapShock += amt / 100; break;
          case 'growth': this.growthAdd += amt / 100; break;
          case 'inflation': this.inflAdd += amt / 100; break;
          case 'unemployment': this.unempAdd += amt / 100; break;
          case 'tech': S.prod *= 1 + amt / 100; break;
          case 'automation': { const d = (amt / 100) * (1 - S.automation); S.automation += d; this.automationShock += d; break; }
          case 'capitalShare': S.capShareAdj = clamp(S.capShareAdj + amt / 100, -0.25, 0.3); break;
          case 'redistribution': this.pendingRedist += amt / 100; break;
          case 'democracy': case 'ruleOfLaw': case 'pressFreedom': case 'repression': case 'securityLoyalty': case 'welfare':
          case 'progressivity': case 'marketFreedom': case 'eduAccess': case 'healthSpend': case 'military': case 'policing':
          case 'genderEquality': case 'contraception': case 'minorityBias': case 'socialMedia': case 'collectivism':
            (S as unknown as Record<string, number>)[key] = clamp01((S as unknown as Record<string, number>)[key] + amt);
            break;
          case 'taxRate': S.taxRate = clamp(S.taxRate + amt, 0, 0.7); break;
          case 'propaganda': this.propagandaAdd += amt; break;
          case 'epidemic': epiR = Math.max(epiR, amt); break;
          case 'ifr': epiIFR = Math.max(epiIFR, amt / 100); break;
          case 'migrants': this.pendingMigrants += Math.round((this.A.live * amt) / 100); this.pendingMigrantProfile = ev.spec.migrant ?? null; break;
          case 'war': this.warMobilTarget = Math.max(this.warMobilTarget, amt / 100); break;
          case 'wealthDestroyed': { const e = eff(); if (e) e.wealthLoss += amt / 100; else this.gWealthLoss += amt / 100; break; }
          case 'mortality': { const e = eff(); const pr = ev.spec.mortalityProfile === 'youngMen' ? 1 : ev.spec.mortalityProfile === 'vulnerable' ? 2 : 0; if (e) { e.mortality += amt / 100; e.mortProfile = pr; } else { this.gMort += amt / 100; this.gMortProfile = pr; } break; }
          case 'emigration': { const e = eff(); if (e) e.emigration += amt / 100; else this.gEmig += amt / 100; break; }
          case 'urbanization': { const e = eff(); if (e) e.urban += amt; else this.gUrban += amt; break; }
          case 'protestSeed': { const e = eff(); if (e) e.seed += amt; else this.gSeed += amt; break; }
          case 'crime': { const e = eff(); if (e) e.crime += amt; else this.gCrime += amt; break; }
          case 'backlash': { const e = eff(); if (e) e.backlash += amt; break; }
          default: {
            const d = PUSH_DIMS.indexOf(key as (typeof PUSH_DIMS)[number]);
            if (d >= 0) {
              const e = eff();
              if (e) e.push[d] += amt; else { this.gPush[d] += amt; this.gActive = true; }
            }
          }
        }
      }
    }
    this.events = keep;
    if (this.gMort || this.gEmig || this.gWealthLoss || this.gSeed || this.gCrime || this.gUrban) this.gActive = true;
    S.epiR = epiR;
    S.epiIFR = epiIFR;
    this.ifrScale = S.epiProfile === 1 ? epiIFR / 0.008 : epiIFR;
    S.warMobil = this.warMobilTarget;
    if (S.warActive) S.warMonths++;
  }

  private pendingMigrantProfile: MigrantProfile | null = null;
  private immigrantAcc = 0;

  private seedInfection(frac: number) {
    const A = this.A;
    for (let i = 0; i < A.n; i++) if (A.alive[i] && A.disease[i] === DIS.S && this.rng.next() < frac) A.disease[i] = DIS.I;
  }

  private spawnLeader(spec: LeaderSpec, target: Target, duration: number): Leader | null {
    const A = this.A;
    // choose a person: adult 30–60, in the target faith if any
    let s = -1;
    for (let tries = 0; tries < 4000; tries++) {
      const c = this.rng.int(A.n);
      if (!A.alive[c]) continue;
      const age = (this.t - A.birth[c]) / 12;
      if (age < 28 || age > 62) continue;
      if (target.faith !== undefined && A.faith[c] !== target.faith) continue;
      if (target.settlement !== undefined && target.settlement >= 0 && A.home[c] !== target.settlement) continue;
      if (A.flags[c] & F.LEADER) continue;
      s = c;
      break;
    }
    if (s < 0) return null;
    const id0 = this.ideologyOf(s);
    const ideo = { ...id0, toler: A.toler[s], extrem: A.extrem[s], ...(spec.ideology ?? {}) } as Leader['ideology'];
    if (spec.style === 'spiritual' && this.cfg.population.faiths[A.faith[s]].secular) {
      // a spiritual teacher belongs to a faith; pick the majority faith
      A.faith[s] = this.majorityFaith;
    }
    A.social[s] = ideo.social; A.econ[s] = ideo.econ; A.auth[s] = ideo.auth; A.relig[s] = ideo.relig; A.patriot[s] = ideo.patriot;
    A.toler[s] = ideo.toler; A.extrem[s] = ideo.extrem;
    A.health[s] = Math.max(A.health[s], 0.85);
    A.E[s] = Math.max(A.E[s], 220);
    A.flags[s] |= F.LEADER;
    const l: Leader = {
      id: this.nextLeaderId++, ref: A.ref(s), name: spec.name || personName(A.uid[s], A.sex[s]), style: spec.style,
      charisma: clamp01(spec.charisma), reach: clamp01(spec.reach), ideology: ideo, home: A.home[s], faith: A.faith[s],
      start: this.t, end: this.t + duration, support: 0, inPower: false, alive: true,
    };
    this.leaders.push(l);
    if (this.leaders.length > 40) this.leaders = this.leaders.filter((x) => x.alive).slice(-40);
    return l;
  }

  setRegime(kind: RegimeKind, ideology?: Ideology) {
    const S = this.S;
    const R = REGIMES[kind];
    S.ruling = ideology ? { ...ideology } : { ...R.ideology };
    if (kind === 'democratic') {
      S.democracy = Math.max(S.democracy, R.democracy);
      S.pressFreedom = Math.max(S.pressFreedom, R.press);
      S.repression = Math.min(S.repression, R.repression);
      S.nextElection = this.t + 12;
    } else {
      S.democracy = Math.min(S.democracy, R.democracy);
      S.pressFreedom = Math.min(S.pressFreedom, R.press);
      S.repression = Math.max(S.repression, R.repression);
    }
    if (kind === 'theocracy') { S.religiousPolicy = 'theocracy'; S.favoredFaith = this.mostDevoutFaith(); }
    else if (kind === 'socialist') S.religiousPolicy = 'suppress';
    else if (kind === 'nationalist' || kind === 'monarchy') { S.religiousPolicy = 'favor'; S.favoredFaith = this.majorityFaith; }
    else if (kind === 'democratic') S.religiousPolicy = 'neutral';
    S.regimeLabel = kind === 'democratic' ? 'Democracy' : R.label;
    S.regimeSince = this.t;
    S.securityLoyalty = Math.max(S.securityLoyalty, 0.6);
    S.govParties = [];
    if (S.headLeader >= 0 && kind !== 'democratic') {
      const l = this.leaders.find((x) => x.id === S.headLeader);
      if (l) l.inPower = false;
      S.headLeader = -1;
    }
    this.purgeElites();
  }

  private mostDevoutFaith(): number {
    let best = this.majorityFaith, bv = -1;
    for (let f = 0; f < this.K; f++) {
      if (f === this.secularFaith) continue;
      const v = this.acc.faithN[f] > 0 ? (this.acc.faithRelig[f] / this.acc.faithN[f]) * Math.sqrt(this.faithShareNow[f]) : 0;
      if (v > bv) { bv = v; best = f; }
    }
    return best;
  }

  /** After a regime change, elites hostile to the new rulers lose their positions. */
  private purgeElites() {
    const A = this.A;
    for (let i = 0; i < A.n; i++) {
      if (!A.alive[i] || A.occ[i] !== OCC.ELITE) continue;
      if (ideoDist(this.ideologyOf(i), this.S.ruling) > 0.22 && this.rng.next() < 0.6) {
        A.occ[i] = OCC.PROFESSIONAL;
        A.griev[i] = clamp01(A.griev[i] + 0.3);
        A.flags[i] |= F.FRUSTRATED;
      }
    }
  }

  // ==============================================================================================
  // Per-person monthly step
  // ==============================================================================================

  private step(i: number) {
    const A = this.A;
    const S = this.S;
    const rng = this.rng;
    const t = this.t;
    const ageM = t - A.birth[i];
    const age = ageM / 12;
    const ageInt = age > 100 ? 100 : age | 0;
    const male = A.sex[i] === 1;
    const birthday = ageM % 12 === 0;
    let o = A.occ[i];
    const f = A.faith[i];

    // ---------------- event effects ----------------
    let mortX = 0, emigX = 0, seedX = 0, crimeX = 0, urbanX = 0, wLoss = 0;
    if (this.gActive) {
      this.applyPush(i, this.gPush, 1);
      if (this.gMort) mortX += this.gMort * mortProfileFactor(this.gMortProfile, age, male);
      emigX += this.gEmig; seedX += this.gSeed; crimeX += this.gCrime; urbanX += this.gUrban; wLoss += this.gWealthLoss;
    }
    const fe = this.fEffs;
    for (let k = 0; k < fe.length; k++) {
      const e = fe[k];
      const match = this.matches(e.target, i, age, male);
      if (e.backlash > 0 && e.target.faith !== undefined) {
        if (A.faith[i] === e.target.faith) {
          if (match) { A.griev[i] += 0.012 * e.backlash * (1 - A.griev[i]); A.fear[i] += 0.02 * e.backlash; }
        } else {
          A.toler[i] -= 0.012 * e.backlash * A.toler[i] * (1.2 - A.O[i] / 255);
          A.fear[i] += 0.015 * e.backlash;
        }
      }
      if (!match) continue;
      this.applyPush(i, e.push, 1);
      if (e.mortality) mortX += e.mortality * mortProfileFactor(e.mortProfile, age, male);
      emigX += e.emigration; seedX += e.seed; crimeX += e.crime; urbanX += e.urban; wLoss += e.wealthLoss;
    }

    // ---------------- mortality ----------------
    const H = S.H;
    const expH = expectedHealth(age);
    let mu = age < 5 ? this.childMu * (age < 1 ? 3 : 0.4) + this.gomp[ageInt] : this.gomp[ageInt];
    mu *= Math.exp(2.0 * (expH - A.health[i]));
    if (male && age > 15) mu *= 1.25;
    mu += mortX;
    if (rng.next() < mu / 12) {
      this.die(i, age < 5 ? DEATH.CHILD : mortX > mu * 0.5 ? (this.gMortProfile === 1 ? DEATH.WAR : DEATH.FAMINE) : DEATH.NATURAL);
      return;
    }
    // epidemic
    const dis = A.disease[i];
    if (dis === DIS.I) {
      const ifr = ifrAt(S.epiProfile, age) * this.ifrScale * (1.6 - 1.2 * H) * Math.exp(2 * (expH - A.health[i]));
      if (rng.next() < ifr) { this.die(i, DEATH.EPIDEMIC); return; }
      A.disease[i] = DIS.R;
      A.health[i] -= 0.05;
    } else if (dis === DIS.S && S.epiActive && S.epiR > 0) {
      const c = A.cell[i];
      const cn = this.cN[c];
      const cellFrac = cn > 0 ? this.cInf[c] / cn : 0;
      const pressure = S.epiR * (1 - this.lockdown) * (0.65 * cellFrac + 0.35 * this.globalInfFrac) * (0.6 + 0.8 * (A.E[i] / 255));
      if (rng.next() < 1 - Math.exp(-pressure) || rng.next() < 0.00005) A.disease[i] = DIS.I;
    }
    // soldiers at war
    if (o === OCC.SOLDIER) {
      if (!S.warActive) {
        if (rng.next() < 0.12) { A.occ[i] = o = OCC.UNEMPLOYED; A.flags[i] |= F.VETERAN; A.mental[i] -= 0.08; this.log(i, 'Came home from the war.'); }
      } else if (rng.next() < this.warCasualty) { this.die(i, DEATH.WAR); return; }
    } else if (S.warActive && male && age >= 18 && age < 40 && o !== OCC.PRISONER && o !== OCC.ELITE) {
      const curFrac = this.lastSoldierFrac;
      const need = this.warMobilTarget - curFrac;
      if (need > 0 && rng.next() < need * 0.5 * (0.6 + 0.8 * A.patriot[i])) {
        A.occ[i] = o = OCC.SOLDIER;
        this.log(i, 'Was called up to fight in the war.');
      }
    }

    // ---------------- emigration ----------------
    if (age >= 16) {
      let pe = emigX / 12;
      if (birthday && age < 60) {
        const unhappy = 1 - A.happy[i];
        pe += 0.006 * unhappy * unhappy * 4 * (0.5 + A.O[i] / 255) * (0.4 + A.edu[i] / 14) * (1 + 2 * A.fear[i]) * (S.warActive ? 2 : 1) * (this.isMinority(f) ? 1 + S.minorityBias : 1) * (S.dev > 0.85 ? 0.3 : 1);
      }
      if (pe > 0 && rng.next() < pe) {
        this.emigrate(i);
        return;
      }
    }

    // ---------------- health ----------------
    const pov = this.povertyStress(i, age);
    let ht = expH + 0.07 * (H - 0.5) - 0.14 * pov + 0.05 * (A.C[i] / 255 - 0.5) + 0.08 * (A.mental[i] - 0.65);
    if (A.disease[i] === DIS.I) ht -= 0.2;
    A.health[i] += 0.04 * (ht - A.health[i]) + (rng.next() - 0.5) * 0.015;
    if (rng.next() < 0.004) A.health[i] -= 0.08 + 0.18 * rng.next();
    A.health[i] = clamp(A.health[i], 0.02, 1);

    // ---------------- school, work, life stage ----------------
    if (o === OCC.CHILD) {
      if (age >= 6 && age < 7 && birthday) {
        const acc = clamp01(0.2 + 0.8 * S.eduAccess + 0.1 * (this.parentSES(i) - 0.5)) * (male ? 1 : 1 - 0.4 * (1 - S.genderEquality));
        if (rng.next() < acc) A.occ[i] = o = OCC.STUDENT;
      } else if (age >= 14) {
        o = this.enterLabour(i, male);
      }
    } else if (o === OCC.STUDENT) {
      A.edu[i] += 1 / 12;
      if (birthday) {
        const e = A.edu[i];
        let p = 0.97;
        const cog = A.cog[i] / 255, C = A.C[i] / 255, ses = this.parentSES(i);
        const girl = male ? 1 : 1 - 0.4 * (1 - S.genderEquality);
        const E = S.eduAccess, dev = S.dev;
        if (e >= 5.5 && e < 6.5) p = clamp01(0.2 + 0.85 * E * (0.6 + 0.4 * dev) + 0.25 * (cog - 0.5) + 0.2 * (ses - 0.5)) * girl;
        else if (e >= 8.5 && e < 9.5) p = clamp01(0.1 + 0.85 * E * (0.5 + 0.5 * dev) + 0.4 * (cog - 0.5) + 0.2 * (C - 0.5) + 0.2 * (ses - 0.5)) * girl;
        else if (e >= 11.5 && e < 12.5) p = clamp01(-0.05 + 0.75 * E * (0.3 + 0.7 * dev) + 0.8 * (cog - 0.5) + 0.25 * (C - 0.5) + 0.25 * (ses - 0.5)) * girl;
        else if (e >= 15.5 && e < 16.5) p = clamp01(-0.1 + 0.35 * E * dev + 0.8 * (cog - 0.55)) * girl;
        else if (e >= 18) p = 0.15;
        if (age >= 26) p = 0;
        if (rng.next() > p) o = this.enterLabour(i, male);
      }
    } else if (birthday) {
      // yearly career events
      const retireAge = 60 + 5 * S.dev;
      if (o !== OCC.RETIRED && o !== OCC.PRISONER && age >= retireAge && (S.welfare > 0.15 || A.wealth[i] > S.avgWage * 24 || A.health[i] < 0.45 || age > 72)) {
        A.occ[i] = o = OCC.RETIRED;
        this.log(i, 'Retired.');
      } else if (o === OCC.HOMEMAKER && age < 55 && rng.next() < 0.08 * S.genderEquality) {
        A.occ[i] = o = OCC.UNEMPLOYED;
      } else if ((o === OCC.SKILLED || o === OCC.PROFESSIONAL || o === OCC.UNEMPLOYED || o === OCC.LABORER) && age >= 24 && age < 60) {
        // entrepreneurship
        const pOwn = 0.005 * (0.4 + A.O[i] / 255 + (1 - A.N[i] / 255) * 0.5) * (0.3 + S.marketFreedom) * (0.5 + this.pct(this.wealthQ, A.wealth[i]));
        if (rng.next() < pOwn) { A.occ[i] = o = OCC.OWNER; this.log(i, 'Started a business.'); }
        else if (o === OCC.SKILLED && A.edu[i] >= 15 && rng.next() < 0.15) A.occ[i] = o = OCC.PROFESSIONAL;
      }
      // elite promotion / demotion
      if ((o === OCC.PROFESSIONAL || o === OCC.OWNER) && age >= 30 && age < 63 && this.eliteCount < this.eliteSlots) {
        if (this.eliteScore(i) > 0.62 + 0.15 * rng.next()) { A.occ[i] = o = OCC.ELITE; this.eliteCount++; this.log(i, 'Rose into the elite.'); }
      } else if (o === OCC.ELITE && (age > 70 || rng.next() < 0.03)) {
        A.occ[i] = o = age > 70 ? OCC.RETIRED : OCC.PROFESSIONAL;
      }
      // leaving the parents' home
      if (age >= 18 && age < 32 && A.partner[i] < 0 && rng.next() < 0.15) {
        const m = A.deref(A.mother[i]);
        if (m >= 0 && Math.abs(A.x[m] - A.x[i]) < 2 && Math.abs(A.y[m] - A.y[i]) < 2) this.relocate(i, A.home[i]);
      }
      // faith change: apostasy, return to faith, conversion
      if (age >= 16) this.faithDrift(i);
    }
    if (o === OCC.PRISONER && rng.next() < 1 / 30) { A.occ[i] = o = OCC.UNEMPLOYED; this.log(i, 'Was released from prison.'); }

    // ---------------- labour market (monthly) ----------------
    if (o === OCC.LABORER || o === OCC.SKILLED || o === OCC.PROFESSIONAL) {
      let sep = this.sepRate * (1.3 - 0.6 * (A.C[i] / 255));
      if (this.isMinority(f)) sep *= 1 + S.minorityBias;
      if (this.automationShock > 0 && o !== OCC.PROFESSIONAL) sep += this.automationShock * (o === OCC.LABORER ? 1.2 : 0.7);
      if (rng.next() < sep) { A.occ[i] = o = OCC.UNEMPLOYED; this.log(i, 'Lost their job.'); }
    } else if (o === OCC.OWNER) {
      const fail = 0.003 * (1 - 3 * Math.min(0, S.gap)) * (1.4 - A.C[i] / 255);
      if (rng.next() < fail) { A.occ[i] = o = OCC.UNEMPLOYED; A.wealth[i] *= 0.6; this.log(i, 'Their business failed.'); }
    } else if (o === OCC.UNEMPLOYED) {
      let emp = (0.6 + 0.4 * (A.cog[i] / 255) + 0.03 * (A.edu[i] - 8) + 0.3 * (A.C[i] / 255 - 0.5));
      if (this.isMinority(f)) emp *= 1 - 0.5 * S.minorityBias;
      if (S.religiousPolicy !== 'neutral' && f !== S.favoredFaith && S.religiousPolicy !== 'suppress') emp *= 0.85;
      if (A.flags[i] & F.CRIMINAL) emp *= 0.6;
      if (age > 55) emp *= 0.7;
      if (!male) emp *= 0.6 + 0.4 * S.genderEquality;
      this.acc.empSum += emp;
      this.acc.empN++;
      if (rng.next() < this.findRate * emp / this.meanEmployability) {
        const tier = this.chooseTier(i, false);
        if (tier !== OCC.UNEMPLOYED) { A.occ[i] = o = tier; this.log(i, `Found work (${OCC_NAMES[tier].toLowerCase()}).`); }
      }
    }

    // ---------------- income, tax, spending, wealth ----------------
    const p = A.partner[i] >= 0 ? A.deref(A.partner[i]) : -1;
    this.economy(i, age, o, p, wLoss);

    // ---------------- social life ----------------
    const c = A.cell[i];
    let extNet = 0, protNet = 0, contacts = 0;
    if (age >= 1) {
      const E = A.E[i] / 255;
      const nc = age < 12 ? 1 : 1 + (rng.next() < E ? 1 : 0) + (rng.next() < 0.5 ? 1 : 0);
      for (let k = 0; k < nc; k++) {
        let j = -1, tie = 0.3;
        const r = rng.next();
        if (age < 16) {
          if (r < 0.6) { j = A.deref(rng.next() < 0.6 ? A.mother[i] : A.father[i]); tie = 1; }
          else j = this.randomInCell(c, i);
        } else if (r < 0.25 && p >= 0) { j = p; tie = 0.9; }
        else if (r < 0.33 && age < 30) { j = A.deref(rng.next() < 0.5 ? A.mother[i] : A.father[i]); tie = 0.7; }
        else if (r < 0.62) { j = A.deref(A.friends[i * FRIEND_SLOTS + rng.int(FRIEND_SLOTS)]); tie = 0.6; }
        else {
          const r2 = rng.next();
          j = r2 < 0.75 ? this.randomInCell(c, i) : r2 < 0.95 ? this.randomNear(c, i, 3) : this.randomInCell(this.rng.int(NCELLS), i);
          tie = 0.3;
        }
        if (j < 0 || j === i) continue;
        contacts++;
        const r3 = this.interact(i, j, tie, age, male, p);
        extNet += A.extrem[j] * tie;
        if (A.protest[j]) protNet += tie;
        if (r3 && S.epiActive && A.disease[j] === DIS.I && A.disease[i] === DIS.S && rng.next() < 0.25 * S.epiR * tie * (1 - this.lockdown)) A.disease[i] = DIS.I;
      }
    }
    if (contacts > 0) extNet /= contacts;

    // children absorb their parents' values (vertical transmission)
    if (age < 18) {
      const m = A.deref(A.mother[i]), fa = A.deref(A.father[i]);
      if (m >= 0 || fa >= 0) {
        const pa = m >= 0 && fa >= 0 ? 0.5 : 1;
        const k = 0.025;
        pullToward(A.relig, i, m, fa, pa, k * 1.3); pullToward(A.social, i, m, fa, pa, k); pullToward(A.econ, i, m, fa, pa, k * 0.6);
        pullToward(A.auth, i, m, fa, pa, k); pullToward(A.patriot, i, m, fa, pa, k); pullToward(A.strict, i, m, fa, pa, k);
        pullToward(A.toler, i, m, fa, pa, k); pullToward(A.itrust, i, m, fa, pa, k * 0.5);
      }
    }

    // ---------------- community norms, media, leaders ----------------
    let approval = 0;
    if (age >= 12) approval = this.normsAndMedia(i, age, c);

    // ---------------- psychology ----------------
    this.psychology(i, age, o, p, pov, approval, extNet, male);

    // ---------------- protest, crime, extremism ----------------
    if (age >= 15) this.civic(i, age, o, protNet, seedX, crimeX, male);

    // ---------------- family: bond, divorce, fertility ----------------
    if (p >= 0) this.partnership(i, p, pov);
    if (!male && age >= 15 && age < 50) this.fertility(i, age, p);

    // ---------------- urbanization ----------------
    if (!this.isUrbanHome(i) && age >= 16 && age < 40 && (o === OCC.UNEMPLOYED || o === OCC.LABORER || o === OCC.STUDENT || urbanX > 0)) {
      const U = this.latest.urban ?? 0.5;
      const pu = (Math.max(0, this.ustar - U) * 0.35 + urbanX * 0.06) / 12;
      if (rng.next() < pu) {
        const st = this.world.pick(rng, 1);
        this.relocate(i, st, true);
        this.log(i, `Moved to the city of ${this.world.settlements[st].name.replace(' (capital)', '')}.`);
      }
    }

    // ---------------- aggregation ----------------
    this.aggregate(i, age, ageInt, male);
  }

  private lastSoldierFrac = 0;

  private matches(tg: Target, i: number, age: number, male: boolean): boolean {
    const A = this.A;
    if (tg.faith !== undefined && A.faith[i] !== tg.faith) return false;
    if (tg.settlement !== undefined && tg.settlement >= 0 && A.home[i] !== tg.settlement) return false;
    if (tg.urban && !this.isUrbanHome(i)) return false;
    if (tg.rural && this.isUrbanHome(i)) return false;
    if (tg.minAge !== undefined && age < tg.minAge) return false;
    if (tg.maxAge !== undefined && age > tg.maxAge) return false;
    if (tg.sex !== undefined && (male ? 1 : 0) !== tg.sex) return false;
    if (tg.wealthClass !== undefined) {
      const wp = this.pct(this.wealthQ, A.wealth[i]);
      const cls = wp < 0.4 ? 0 : wp > 0.9 ? 2 : 1;
      if (cls !== tg.wealthClass) return false;
    }
    if (tg.share !== undefined && tg.share < 1 && hash01(A.uid[i], 77) > tg.share) return false;
    return true;
  }

  isUrbanHome(i: number): boolean {
    return this.A.home[i] < this.world.nCities;
  }

  /** Apply a push vector (monthly strengths, -1..1) to one person. */
  private applyPush(i: number, push: Float32Array, mult: number) {
    const A = this.A;
    for (let d = 0; d < push.length; d++) {
      const v = push[d] * mult;
      if (v === 0) continue;
      switch (d) {
        case 0: A.griev[i] = pushV(A.griev[i], v, 0.05); break;
        case 1: A.fear[i] = pushV(A.fear[i], v, 0.1); break;
        case 2: A.mood[i] = clamp(A.mood[i] + 0.15 * v, -1, 1); break;
        case 3: A.health[i] = pushV(A.health[i], v, 0.03); break;
        case 4: A.mental[i] = pushV(A.mental[i], v, 0.03); break;
        case 5: A.itrust[i] = pushV(A.itrust[i], v, 0.04); break;
        case 6: A.strust[i] = pushV(A.strust[i], v, 0.04); break;
        case 7: A.toler[i] = pushV(A.toler[i], v, 0.03); break;
        case 8: A.patriot[i] = pushV(A.patriot[i], v, 0.03); break;
        case 9: A.relig[i] = pushV(A.relig[i], v, 0.02); break;
        case 10: A.strict[i] = pushV(A.strict[i], v, 0.025); break;
        case 11: A.social[i] = pushV(A.social[i], v, 0.02); break;
        case 12: A.econ[i] = pushV(A.econ[i], v, 0.02); break;
        case 13: A.auth[i] = pushV(A.auth[i], v, 0.025); break;
        case 14: A.consum[i] = pushV(A.consum[i], v, 0.025); break;
        case 15: A.extrem[i] = pushV(A.extrem[i], v, 0.02); break;
      }
    }
  }

  private parentSES(i: number): number {
    const A = this.A;
    const m = A.deref(A.mother[i]);
    const fa = A.deref(A.father[i]);
    let w = 0, k = 0;
    if (m >= 0) { w += A.wealth[m] + A.income[m] * 24; k++; }
    if (fa >= 0) { w += A.wealth[fa] + A.income[fa] * 24; k++; }
    return k ? this.pct(this.wealthQ, w / k) : 0.3;
  }

  private enterLabour(i: number, male: boolean): number {
    const A = this.A;
    const S = this.S;
    let o: number;
    if (!male && this.rng.next() < (1 - S.genderEquality) * 0.75 * (0.6 + 0.4 * (1 - A.social[i]))) o = OCC.HOMEMAKER;
    else o = OCC.UNEMPLOYED;
    A.occ[i] = o;
    if (A.flags[i] & F.FOLLOW) this.log(i, `Finished school after ${A.edu[i].toFixed(0)} years.`);
    return o;
  }

  chooseTier(i: number, init: boolean): number {
    const A = this.A;
    const S = this.S;
    const rng = this.rng;
    const e = A.edu[i];
    const sc = (Math.min(e, 18) / 16) * 0.6 + (A.cog[i] / 255) * 0.4 + 0.15 * rng.normal();
    let tier: number = OCC.LABORER;
    if (e >= 15 && sc > 0.62) tier = OCC.PROFESSIONAL;
    else if (e >= 9 && sc > 0.42) tier = OCC.SKILLED;
    if (init && rng.next() < 0.07 + 0.08 * S.agrarian) tier = OCC.OWNER;
    return tier;
  }

  skill(i: number): number {
    const A = this.A;
    const S = this.S;
    const o = A.occ[i];
    let s = WAGE_MULT[o] * (0.7 + 0.6 * (A.cog[i] / 255)) * Math.max(0.4, 1 + 0.06 * (A.edu[i] - 10));
    s *= Math.exp(0.35 * (hash01(A.uid[i], 13) - 0.5) * 2);
    if (A.sex[i] === 0) s *= 1 - 0.25 * (1 - S.genderEquality);
    if (this.isMinority(A.faith[i])) s *= 1 - 0.25 * S.minorityBias;
    // automation compresses the wages of routine work (Autor 2015)
    if (o === OCC.LABORER || o === OCC.SKILLED) s *= 1 - 0.45 * S.automation * (o === OCC.LABORER ? 1 : 0.6);
    return s;
  }

  private povertyStress(i: number, age: number): number {
    const A = this.A;
    if (age < 18) {
      const m = A.deref(A.mother[i]);
      return m >= 0 ? this.povertyStress(m, 30) : 0.3;
    }
    const p = A.deref(A.partner[i]);
    const kids = A.kids[i] * clamp((50 - age) / 25, 0, 1);
    const eq = (A.income[i] + (p >= 0 ? A.income[p] : 0)) / (1 + (p >= 0 ? 0.5 : 0) + 0.3 * kids);
    const cushion = A.wealth[i] > 0 ? A.wealth[i] / 60 : 0;
    return clamp01(1 - (eq + cushion) / (this.S.subs * 1.3));
  }

  private economy(i: number, age: number, o: number, p: number, wLoss: number) {
    const A = this.A;
    const S = this.S;
    let wealth = A.wealth[i];
    if (wLoss > 0 && wealth > 0) wealth *= 1 - Math.min(0.95, wLoss);
    if (this.redistTake > 0 && wealth > this.wealthTop) { const take = wealth * Math.min(0.9, this.redistTake); wealth -= take; this.redistCarry += take; }
    if (this.redistGive > 0 && age >= 18 && wealth < this.wealthMedian) wealth += this.redistGive;
    if (age < 15 || o === OCC.STUDENT && age < 18) {
      A.income[i] = 0;
      A.wealth[i] = wealth;
      return;
    }
    let wage = 0;
    if (IS_EMPLOYED[o]) {
      const sk = this.skill(i);
      wage = S.wageUnit * sk * this.realWage;
      if (o !== OCC.SOLDIER) this.acc.skill += sk;
    }
    const wPct = wealth > 0 ? this.pct(this.wealthQ, wealth) : 0;
    const capR = (o === OCC.OWNER || o === OCC.ELITE ? 1.2 : 0.7) * (0.6 + 0.9 * wPct);
    const capI = wealth > 0 ? wealth * S.rMonth * capR : wealth * 0.006;
    let transfer = 0;
    if (o === OCC.UNEMPLOYED) transfer = S.welfare * 0.55 * S.avgWage;
    else if (o === OCC.RETIRED) transfer = (S.welfare * 0.65 + 0.08) * S.avgWage * (S.dev > 0.3 ? 1 : 0.6);
    const gross = wage + Math.max(0, capI);
    if (gross + transfer < S.subs * 0.6 && age >= 18) transfer += S.welfare * 0.5 * (S.subs * 0.6 - gross);
    const incPct = this.pct(this.eqIncQ, gross);
    const prog = clamp(1 + S.progressivity * (incPct - 0.5) * 1.8, 0.15, 2.4);
    const tax = gross * S.taxRate * prog * (0.6 + 0.4 * S.ruleOfLaw);
    const net = gross - tax + transfer + (capI < 0 ? capI : 0);
    const kidsHome = A.kids[i] * clamp((50 - age) / 25, 0, 1) * 0.5;
    const need = S.subs * (1 + 0.45 * kidsHome);
    const C = A.C[i] / 255;
    const mpc = clamp(0.95 - 0.5 * incPct + 0.25 * (A.consum[i] - 0.5) - 0.12 * (C - 0.5), 0.3, 0.99);
    let spend = net >= need ? need + (net - need) * mpc : Math.max(net, Math.min(need, net + Math.max(0, wealth) * 0.08));
    if (wealth > 0) spend += wealth * 0.0018 * (0.5 + A.consum[i]);
    wealth += net - spend;
    if (wealth > 0 && this.erosion > 0) wealth *= 1 - this.erosion * (o === OCC.OWNER || o === OCC.ELITE ? 0.25 : 0.6);
    const floor = -S.avgWage * 6 * (0.2 + S.marketFreedom);
    if (wealth < floor) { wealth = floor; A.griev[i] = Math.min(1, A.griev[i] + 0.003); }
    // partners pool resources
    if (p >= 0) wealth += 0.04 * ((wealth + A.wealth[p]) / 2 - wealth);
    A.wealth[i] = wealth;
    A.income[i] = net;
    const acc = this.acc;
    acc.taxes += tax;
    acc.transfers += transfer;
  }

  /** One social encounter: i is influenced by j. Returns true if it was a close (infectious) contact. */
  private interact(i: number, j: number, tie: number, age: number, male: boolean, p: number): boolean {
    const A = this.A;
    const rng = this.rng;
    const sameFaith = A.faith[i] === A.faith[j];
    const ds = Math.abs(A.social[i] - A.social[j]);
    const de = Math.abs(A.econ[i] - A.econ[j]);
    const dr = Math.abs(A.relig[i] - A.relig[j]);
    const d = (ds + de + dr) / 3 + (sameFaith ? 0 : 0.2 * A.relig[i]);
    const O = A.O[i] / 255;
    const eps = 0.12 + 0.28 * O + 0.2 * A.toler[i] + (tie >= 0.9 ? 0.1 : 0);
    const mall = age < 12 ? 0.3 : age < 18 ? 1.1 : age < 26 ? 1 : age < 41 ? 0.55 : age < 61 ? 0.35 : 0.25;
    const prestige = OCC_PRESTIGE[A.occ[j]] + 0.25 * (A.E[j] / 255) + (A.flags[j] & F.LEADER ? 1.5 : 0);
    const w = 0.045 * tie * mall * prestige;
    if (d < eps) {
      A.social[i] += w * (A.social[j] - A.social[i]);
      A.econ[i] += w * (A.econ[j] - A.econ[i]);
      A.auth[i] += w * (A.auth[j] - A.auth[i]);
      A.patriot[i] += w * (A.patriot[j] - A.patriot[i]);
      A.consum[i] += w * (A.consum[j] - A.consum[i]);
      A.itrust[i] += 0.5 * w * (A.itrust[j] - A.itrust[i]);
      A.toler[i] += 0.5 * w * (A.toler[j] - A.toler[i]);
      const rw = sameFaith ? w : 0.25 * w;
      A.relig[i] += rw * (A.relig[j] - A.relig[i]);
      if (sameFaith) A.strict[i] += w * (A.strict[j] - A.strict[i]);
      A.extrem[i] += 0.3 * w * Math.max(0, A.extrem[j] - A.extrem[i]) * A.griev[i];
    } else if (d > 2 * eps && A.A[i] < 110) {
      // boomerang: disagreeable people dig in when confronted with very different views
      A.social[i] = clamp01(A.social[i] - 0.25 * w * (A.social[j] - A.social[i]));
      A.toler[i] -= 0.002 * tie;
    }
    // intergroup contact (Allport): cooperative contact builds tolerance, hostile contact erodes it
    if (!sameFaith && age >= 10) {
      const q = (A.A[i] + A.A[j]) / 510 - (A.aggr[j] / 255) * 0.5 - A.extrem[j];
      if (q > 0.2) A.toler[i] += 0.004 * (1 - A.toler[i]);
      else A.toler[i] -= 0.004 * A.toler[i];
    }
    // emotional contagion
    A.mood[i] += 0.06 * tie * (A.mood[j] - A.mood[i]);
    // friendship (homophily)
    if (tie <= 0.35 && rng.next() < 0.3) {
      const aj = (this.t - A.birth[j]) / 12;
      if (Math.abs(aj - age) < 15 && 1 - d > 0.5 + 0.35 * rng.next()) this.addFriend(i, j);
    }
    // romance
    if (p < 0 && age >= 17 && age < 55 && A.sex[j] !== A.sex[i] && A.alive[j]) {
      if (A.deref(A.partner[j]) < 0) this.romance(i, j, age, male, d, sameFaith);
    }
    return tie >= 0.3;
  }

  private addFriend(i: number, j: number) {
    const A = this.A;
    const rj = A.ref(j), ri = A.ref(i);
    const bi = i * FRIEND_SLOTS, bj = j * FRIEND_SLOTS;
    for (let k = 0; k < FRIEND_SLOTS; k++) if (A.friends[bi + k] === rj) return;
    let slot = -1;
    for (let k = 0; k < FRIEND_SLOTS; k++) if (A.deref(A.friends[bi + k]) < 0) { slot = k; break; }
    if (slot < 0) { if (this.rng.next() < 0.25) slot = this.rng.int(FRIEND_SLOTS); else return; }
    A.friends[bi + slot] = rj;
    let slot2 = -1;
    for (let k = 0; k < FRIEND_SLOTS; k++) if (A.deref(A.friends[bj + k]) < 0) { slot2 = k; break; }
    if (slot2 >= 0) A.friends[bj + slot2] = ri;
  }

  private romance(i: number, j: number, age: number, male: boolean, d: number, sameFaith: boolean) {
    const A = this.A;
    const S = this.S;
    const rng = this.rng;
    const aj = (this.t - A.birth[j]) / 12;
    if (aj < 17 || aj > 60) return;
    const ageGap = male ? age - aj : aj - age; // husband older is the historical norm
    if (ageGap < -5 || ageGap > 12) return;
    // not close relatives
    if (A.mother[i] >= 0 && A.mother[i] === A.mother[j]) return;
    if (A.mother[i] === A.ref(j) || A.father[i] === A.ref(j) || A.mother[j] === A.ref(i) || A.father[j] === A.ref(i)) return;
    let compat = 0.3 * (A.looks[j] / 255) + 0.2 * (1 - Math.abs(A.edu[i] - A.edu[j]) / 16) + 0.25 * (1 - d) + 0.15 * ((A.A[j] + A.emp[j]) / 510) + 0.1 * rng.next();
    if (!sameFaith) {
      const block = Math.max(A.relig[i], A.relig[j]) * (1 - Math.min(A.toler[i], A.toler[j])) * (0.6 + 0.4 * S.collectivism);
      compat *= 1 - Math.min(0.95, block * 1.3);
    }
    const urgency = age < 22 ? 0.6 + 0.6 * S.collectivism : age < 35 ? 1 : age < 45 ? 0.6 : 0.3;
    const pm = 0.07 * compat * compat * urgency * (0.7 + 0.6 * S.collectivism);
    if (rng.next() < pm) this.marry(i, j, clamp01(0.4 + 0.5 * compat + 0.1 * rng.normal()));
  }

  private faithDrift(i: number) {
    const A = this.A;
    const S = this.S;
    const rng = this.rng;
    const f = A.faith[i];
    const fg = this.cfg.population.faiths[f];
    const freedom = S.religiousPolicy === 'theocracy' && f === S.favoredFaith ? 0.1 : 1;
    if (!fg.secular && this.secularFaith >= 0 && A.relig[i] < 0.22 && rng.next() < 0.05 * freedom * (0.22 - A.relig[i]) / 0.22 * (0.4 + this.meanSocial)) this.convert(i, this.secularFaith);
    else if (fg.secular && A.relig[i] > 0.3 && rng.next() < 0.2 * (A.relig[i] - 0.3) / 0.7 + 0.01) {
      // return to faith: join the faith of a parent, partner or the neighbourhood majority
      const p = A.deref(A.partner[i]);
      const m = A.deref(A.mother[i]);
      let nf = p >= 0 && !this.cfg.population.faiths[A.faith[p]].secular ? A.faith[p] : m >= 0 && !this.cfg.population.faiths[A.faith[m]].secular ? A.faith[m] : -1;
      if (nf < 0) {
        const c = A.cell[i];
        let bv = 0;
        for (let k = 0; k < this.K; k++) if (k !== this.secularFaith && this.cFaith[c * MAX_FAITHS + k] > bv) { bv = this.cFaith[c * MAX_FAITHS + k]; nf = k; }
      }
      if (nf >= 0) this.convert(i, nf);
    } else if (!fg.secular && A.relig[i] < 0.4 && rng.next() < 0.004) {
      // persuasion by devout friends of another faith
      for (let k = 0; k < FRIEND_SLOTS; k++) {
        const j = A.deref(A.friends[i * FRIEND_SLOTS + k]);
        if (j >= 0 && A.faith[j] !== f && !this.cfg.population.faiths[A.faith[j]].secular && A.relig[j] > 0.7) { this.convert(i, A.faith[j]); break; }
      }
    }
    // state suppression or enforcement of religion
    if (S.religiousPolicy === 'suppress') A.relig[i] -= 0.01 * A.relig[i];
    if (S.religiousPolicy === 'theocracy' && f === S.favoredFaith) A.strict[i] += 0.01 * (1 - A.strict[i]);
  }

  /** Community norms, media, state propaganda, social media and charismatic leaders. Returns social disapproval felt. */
  private normsAndMedia(i: number, age: number, c: number): number {
    const A = this.A;
    const S = this.S;
    const rng = this.rng;
    const O = A.O[i] / 255;
    const mall = age < 18 ? 1.1 : age < 26 ? 1 : age < 41 ? 0.6 : 0.4;
    let approval = 0;
    const cn = this.cN[c];
    if (cn > 3) {
      const inv = 1 / cn;
      const cs = this.cSocial[c] * inv, cr = this.cRelig[c] * inv, cp = this.cPatriot[c] * inv, cc = this.cConsum[c] * inv, ct = this.cToler[c] * inv;
      const conf = 0.006 * (0.3 + 0.9 * S.collectivism) * (1.2 - O) * mall;
      A.social[i] += conf * (cs - A.social[i]);
      A.relig[i] += conf * 0.7 * (cr - A.relig[i]);
      A.patriot[i] += conf * (cp - A.patriot[i]);
      A.consum[i] += conf * (cc - A.consum[i]);
      A.toler[i] += conf * 0.5 * (ct - A.toler[i]);
      approval = (Math.abs(A.social[i] - cs) + Math.abs(A.relig[i] - cr)) * S.collectivism;
    }
    // media & trends (reach grows with literacy and cities)
    const reach = 0.25 + 0.35 * Math.min(1, A.edu[i] / 8) + (this.isUrbanHome(i) ? 0.2 : 0) + 0.2 * S.dev;
    const mk = 0.0015 * reach * mall;
    const T = S.trends;
    if (T.liberalism) A.social[i] = pushV(A.social[i], T.liberalism, mk * 10);
    if (T.consumerism) A.consum[i] = pushV(A.consum[i], T.consumerism, mk * 10);
    if (T.patriotism) A.patriot[i] = pushV(A.patriot[i], T.patriotism, mk * 10);
    if (T.religiosity) A.relig[i] = pushV(A.relig[i], T.religiosity, mk * 8);
    if (T.capitalism) A.econ[i] = pushV(A.econ[i], T.capitalism, mk * 10);
    if (T.authority) A.auth[i] = pushV(A.auth[i], T.authority, mk * 10);
    if (T.tolerance) A.toler[i] = pushV(A.toler[i], T.tolerance, mk * 10);
    // state propaganda pulls the receptive toward the rulers' ideology
    const P = this.propaganda;
    if (P > 0.05) {
      const k = mk * 6 * P * (0.3 + A.itrust[i]);
      const R = S.ruling;
      A.social[i] += k * (R.social - A.social[i]);
      A.econ[i] += k * (R.econ - A.econ[i]);
      A.auth[i] += k * (R.auth - A.auth[i]);
      A.patriot[i] += k * (R.patriot - A.patriot[i]);
      A.relig[i] += k * 0.5 * (R.relig - A.relig[i]);
      A.itrust[i] += k * 0.5 * (1 - A.itrust[i]);
    }
    // algorithmic social media: echo chambers, outrage, anxiety
    const sm = S.socialMedia * (age < 30 ? 1.2 : age < 50 ? 0.9 : 0.5);
    if (sm > 0 && hash01(A.uid[i], 5) < sm) {
      const s = A.social[i] - this.meanSocial;
      if (A.social[i] > 0.05 && A.social[i] < 0.95) A.social[i] += 0.0004 * Math.sign(s);
      const e = A.econ[i] - this.meanEcon;
      if (A.econ[i] > 0.05 && A.econ[i] < 0.95) A.econ[i] += 0.0003 * Math.sign(e);
      A.griev[i] += 0.0008 * A.griev[i];
      A.mental[i] -= 0.0006 * (A.N[i] / 255);
      A.toler[i] -= 0.00012;
    }
    // charismatic leaders
    const L = this.leaderPos;
    for (let k = 0; k < L.length; k++) {
      const l = L[k];
      const local = A.home[i] === l.home;
      const exposure = l.reach * (local ? 1 : l.style === 'extremist' ? 0.05 : 0.6) + (local ? 0.4 : 0);
      if (rng.next() > exposure * 0.5) continue;
      const lid = l.ideology;
      const dl = (Math.abs(A.social[i] - lid.social) + Math.abs(A.econ[i] - lid.econ) + Math.abs(A.relig[i] - lid.relig) + Math.abs(A.patriot[i] - lid.patriot) + Math.abs(A.auth[i] - lid.auth)) / 5;
      const grievBoost = l.style === 'demagogue' || l.style === 'extremist' || l.style === 'revolutionary' ? 0.25 * A.griev[i] : 0;
      const eps = 0.15 + 0.2 * O + 0.15 * A.toler[i] + grievBoost + (l.style === 'spiritual' && A.faith[i] === l.faith ? 0.15 : 0);
      const ch = l.charisma;
      if (dl < eps) {
        const kk = 0.01 * ch * mall;
        A.social[i] += kk * (lid.social - A.social[i]);
        A.econ[i] += kk * (lid.econ - A.econ[i]);
        A.auth[i] += kk * (lid.auth - A.auth[i]);
        A.patriot[i] += kk * (lid.patriot - A.patriot[i]);
        A.toler[i] += kk * (lid.toler - A.toler[i]);
        if (A.faith[i] === l.faith) A.relig[i] += kk * (lid.relig - A.relig[i]);
        l.support++;
        switch (l.style) {
          case 'demagogue': A.griev[i] += 0.003 * ch * (1 - A.griev[i]); A.itrust[i] += (l.inPower ? 0.004 : -0.003) * ch; break;
          case 'reformer': if (l.inPower) A.itrust[i] += 0.002 * ch; break;
          case 'peacemaker': A.extrem[i] -= 0.03 * ch * A.extrem[i]; A.fear[i] *= 0.98; if (A.protest[i] === PROTEST.VIOLENT) A.protest[i] = PROTEST.PEACEFUL; break;
          case 'spiritual':
            if (A.faith[i] === l.faith) { A.relig[i] += 0.006 * ch * (1 - A.relig[i]); A.strict[i] += kk * ((1 - lid.toler * 0.8) - A.strict[i]); }
            A.consum[i] -= 0.002 * ch * A.consum[i]; A.mental[i] += 0.002 * ch; break;
          case 'extremist': {
            const ag = (this.t - A.birth[i]) / 12;
            if (ag >= 15 && ag <= 38 && A.griev[i] > 0.25) A.extrem[i] = clamp01(A.extrem[i] + 0.07 * ch * A.griev[i] * (1.2 - A.emp[i] / 255) * (A.sex[i] ? 1.3 : 0.6) * (1 - 0.5 * A.toler[i]));
            break;
          }
          case 'revolutionary': A.griev[i] += 0.001 * ch; break;
          case 'visionary': A.consum[i] += 0.002 * ch; break;
        }
      } else if (l.style === 'demagogue' || l.style === 'extremist') {
        // polarizing figures also harden their opponents and frighten their targets
        A.toler[i] -= 0.0015 * ch * A.toler[i];
        if (this.isMinority(A.faith[i]) && l.style === 'demagogue') { A.fear[i] += 0.006 * ch; A.griev[i] += 0.003 * ch; }
      }
    }
    return approval;
  }

  private psychology(i: number, age: number, o: number, p: number, pov: number, approval: number, extNet: number, male: boolean) {
    const A = this.A;
    const S = this.S;
    const rng = this.rng;
    const t = this.t;
    const N = A.N[i] / 255, E = A.E[i] / 255, Ag = A.A[i] / 255, emp = A.emp[i] / 255;
    const statusPct = this.pct(this.eqIncQ, A.income[i]);
    const unemployed = o === OCC.UNEMPLOYED ? 1 : 0;
    let friends = 0;
    for (let k = 0; k < FRIEND_SLOTS; k++) if (A.deref(A.friends[i * FRIEND_SLOTS + k]) >= 0) friends++;
    const partnered = p >= 0 ? 1 : 0;
    const isolation = age < 16 ? 0 : (partnered ? 0 : 0.5) + (friends === 0 ? 0.5 : friends === 1 ? 0.25 : 0);
    const f = A.faith[i];
    let discrim = 0;
    if (this.isMinority(f)) discrim += S.minorityBias;
    if ((S.religiousPolicy === 'favor' || S.religiousPolicy === 'theocracy') && f !== S.favoredFaith) discrim += S.religiousPolicy === 'theocracy' ? 0.5 : 0.25;
    if (S.religiousPolicy === 'suppress') discrim += 0.5 * A.relig[i];
    discrim = Math.min(1, discrim);
    const R = S.ruling;
    const misalign = ((Math.abs(A.social[i] - R.social) + Math.abs(A.relig[i] - R.relig) + Math.abs(A.patriot[i] - R.patriot) + Math.abs(A.econ[i] - R.econ)) / 4) * (1 - 0.5 * S.democracy);
    const expH = expectedHealth(age);
    // life satisfaction
    const ht = 0.52 + 0.14 * (statusPct - 0.5) - 0.12 * pov + 0.12 * (A.health[i] - expH) + 0.15 * (A.mental[i] - 0.65)
      + 0.07 * partnered * (A.bond[i] - 0.3) + 0.035 * friends / FRIEND_SLOTS - 0.1 * unemployed
      + 0.06 * A.relig[i] * (0.5 + 0.5 * A.strust[i]) + 0.05 * (A.itrust[i] - 0.5) + 0.05 * (S.democracy - 0.5) * (1 - A.auth[i])
      - 0.12 * A.fear[i] - 0.06 * approval - 0.06 * A.griev[i] + 0.1 * (E - 0.5) - 0.15 * (N - 0.5) - 0.05 * discrim;
    A.happy[i] += 0.05 * (ht - A.happy[i]);
    A.happy[i] = clamp01(A.happy[i]);
    A.mood[i] = clamp(0.75 * A.mood[i] + 0.25 * (2 * A.happy[i] - 1) + (rng.next() - 0.5) * 0.2, -1, 1);
    // mental health
    const mt = 0.78 - 0.3 * (N - 0.5) + 0.25 * (A.happy[i] - 0.5) - 0.15 * isolation - 0.2 * A.fear[i] - 0.1 * pov + 0.08 * (S.H - 0.5) + 0.04 * A.relig[i] - (A.flags[i] & F.VETERAN ? 0.05 : 0);
    A.mental[i] += 0.025 * (mt - A.mental[i]);
    A.mental[i] = clamp(A.mental[i], 0.01, 1);
    if (age >= 14 && A.mental[i] < 0.55) {
      // Durkheim: isolation and despair raise risk; faith communities and family protect
      const hz = 6e-5 * Math.exp(14 * (0.5 - A.mental[i])) * (male ? 2.2 : 0.8) * (1 - 0.45 * A.relig[i]) * (1 - 0.3 * partnered) * (1 + isolation) * (1 - 0.3 * S.H);
      if (rng.next() < hz) { this.die(i, DEATH.SUICIDE); return; }
    }
    // self-image: inferiority (−) … superiority (+)
    const et = 0.4 * (statusPct - 0.5) + 0.3 * (A.looks[i] / 255 - 0.5) + 0.12 * (Math.min(A.edu[i], 18) / 16 - 0.5)
      - 0.7 * (N - 0.5) + 0.35 * (E - Ag) + 0.15 * A.mood[i] - 0.2 * unemployed - 0.15 * discrim + (o === OCC.ELITE ? 0.25 : 0);
    A.esteem[i] = clamp(A.esteem[i] + 0.03 * (et - A.esteem[i]), -1, 1);
    // grievance: relative deprivation + injustice
    const aspiration = 0.2 + 0.03 * Math.min(A.edu[i], 20) + 0.15 * (A.cog[i] / 255 - 0.5);
    const deprivation = Math.max(0, aspiration - statusPct);
    const gini = this.latest.gini ?? 0.35;
    const frustrated = A.flags[i] & F.FRUSTRATED ? 1 : 0;
    const repressionFelt = this.repEff * (A.protest[i] ? 1 : 0.2) * (1 - A.auth[i]);
    // voice denied: people who value freedom resent autocracy; corruption and the cost of living sting everyone
    const voiceDenied = (1 - S.democracy) * (0.3 * (1 - A.auth[i]) + 0.2 * (A.O[i] / 255));
    const costOfLiving = Math.min(1, Math.max(0, S.inflation - 0.05) * 3);
    const gt = 0.42 * deprivation + 0.2 * unemployed + 0.35 * discrim + 0.12 * (1 - A.itrust[i]) + 0.15 * gini * (1 - A.econ[i])
      + 0.1 * Math.max(0, -A.esteem[i]) + 0.18 * frustrated + 0.15 * pov + 0.2 * repressionFelt + 0.25 * misalign
      + 0.35 * voiceDenied + 0.15 * (1 - S.ruleOfLaw) + 0.15 * costOfLiving
      - 0.12 * S.welfare * (unemployed || pov > 0.3 ? 1 : 0.3) - 0.04;
    A.griev[i] += 0.04 * (gt - A.griev[i]);
    if (A.protest[i] && this.concession > 0) A.griev[i] -= this.concession * A.griev[i];
    A.griev[i] = clamp01(A.griev[i]);
    // fear decays toward the current level of threat
    const cn = this.cN[A.cell[i]];
    const crime = cn > 0 ? this.cCrime[A.cell[i]] : 0;
    const ft = Math.min(1, 6 * crime) * 0.3 + this.warFear + this.conflictFear + this.epiFear + 0.25 * repressionFelt + (this.isMinority(f) ? 0.1 * S.minorityBias : 0);
    A.fear[i] = clamp01(A.fear[i] * 0.88 + 0.12 * ft);
    // trust in institutions follows performance, more so where the press is free
    const perf = 0.08 + 0.3 * S.legitimacy + 0.2 * S.ruleOfLaw + 0.2 * clamp01(1 - 3 * misalign) + 0.1 * (statusPct - 0.5) - 0.15 * A.griev[i];
    A.itrust[i] += 0.01 * (perf - A.itrust[i]) * (0.3 + 0.7 * S.pressFreedom);
    A.itrust[i] = clamp01(A.itrust[i]);
    // trust in other people
    const stt = 0.25 + 0.3 * (1 - Math.min(1, crime * 8)) + 0.2 * (Ag - 0.5) + 0.15 * S.ruleOfLaw + (friends > 2 ? 0.1 : 0) - 0.1 * A.fear[i];
    A.strust[i] = clamp01(A.strust[i] + 0.01 * (stt - A.strust[i]));
    // elite aspirants without elite jobs become frustrated (Turchin's "elite overproduction")
    if (age >= 25 && age < 56 && A.edu[i] >= 16) {
      if (o !== OCC.ELITE && o !== OCC.PROFESSIONAL && o !== OCC.OWNER) A.flags[i] |= F.FRUSTRATED;
      else A.flags[i] &= ~F.FRUSTRATED;
    }
    // ---- existential security and faith (Norris & Inglehart, "Sacred and Secular") ----
    if (age >= 12 && age < 30) {
      const insecurity = 0.4 * pov + 0.3 * A.fear[i] + 0.2 * (1 - S.H) + 0.1 * (1 - S.welfare);
      A.relig[i] = clamp01(A.relig[i] + 0.0015 * (insecurity - 0.3) - 0.0004 * Math.max(0, A.edu[i] - 12) / 6);
    }
    // ---- radicalization (Kruglanski: need × narrative × network) ----
    if (age >= 14) {
      const youngMale = male && age < 36 ? 1 : 0;
      const need = 0.35 * A.griev[i] + 0.25 * Math.max(0, -A.esteem[i]) + 0.2 * isolation + 0.1 * youngMale + 0.15 * discrim + 0.1 * repressionFelt;
      const narrative = Math.max(A.strict[i] * A.relig[i] * (1 - A.toler[i]), A.patriot[i] * (1 - A.toler[i]) * 0.8, Math.abs(A.econ[i] - 0.5) * 2 * A.griev[i] * 0.6);
      const net = Math.min(0.3, extNet);
      const susceptible = (0.4 + 1.2 * (A.aggr[i] / 255)) * (1 - 0.5 * emp);
      const protective = 0.4 * emp + 0.2 * (Ag - 0.5) + 0.2 * (partnered && A.kids[i] > 0 ? 1 : 0) + 0.15 * (IS_EMPLOYED[o] ? 1 : 0) + 0.2 * A.toler[i];
      let dr = 0.012 * susceptible * need * (narrative + 0.6 * net) * (1 + 3 * net) - 0.003 * protective * A.extrem[i] - 0.003 * Math.max(0, 0.5 - need);
      if (A.extrem[i] > A.griev[i] + 0.35) dr -= 0.01;
      if (o === OCC.PRISONER) dr += 0.002 * net;
      const before = A.extrem[i];
      A.extrem[i] = clamp01(A.extrem[i] + dr);
      if (before < 0.7 && A.extrem[i] >= 0.7) this.log(i, 'Was drawn into a militant movement.');
    }
    void t;
  }

  /** Protest, crime, terrorism. */
  private civic(i: number, age: number, o: number, protNet: number, seedX: number, crimeX: number, male: boolean) {
    const A = this.A;
    const S = this.S;
    const rng = this.rng;
    const c = A.cell[i];
    if (o === OCC.PRISONER) { A.protest[i] = 0; return; }
    // ---- protest: Granovetter thresholds ----
    if (age < 75) {
      const R = S.ruling;
      const misalign = (Math.abs(A.social[i] - R.social) + Math.abs(A.relig[i] - R.relig) + Math.abs(A.econ[i] - R.econ)) / 3;
      const motive = A.griev[i] - 0.45 + (o === OCC.UNEMPLOYED ? 0.04 : 0) + this.revolutionaryBoost * 0.08 + 0.12 * misalign * (1 - S.democracy) - this.honeymoon;
      if (A.protest[i] === 0) {
        if (motive > 0) {
          const risk = 0.4 * A.fear[i] + 0.15 * (A.N[i] / 255) + 0.3 * this.repEff;
          // Granovetter thresholds: a spread of personal thresholds, a few near zero (activists)
          const personal = 0.5 * (hash01(A.uid[i], 21) - 0.5);
          const fatigue = 0.025 * Math.min(12, S.protestMonths);
          const theta = clamp(0.12 + personal - 1.5 * motive + 0.5 * risk + 0.15 * A.auth[i] * (1 - misalign) - 0.05 * (A.E[i] / 255) + fatigue, 0.002, 0.95);
          const cn = this.cN[c];
          const local = cn > 0 ? this.cProtest[c] / cn : 0;
          const fEff = 0.5 * local + 0.3 * Math.min(1, this.globalProtest * this.visibility * 3) + 0.2 * Math.min(1, protNet);
          if ((fEff >= theta && rng.next() < 0.35) || rng.next() < 0.0006 * motive * (A.O[i] / 255) * 2 + seedX * motive * 0.2) {
            A.protest[i] = PROTEST.PEACEFUL;
            this.log(i, 'Joined street protests.');
          }
        }
      } else {
        const exit = 0.25 + 0.6 * Math.max(0, -motive) + 0.3 * A.fear[i] * (1 - A.extrem[i]) + 0.04 * Math.min(12, S.protestMonths);
        if (rng.next() < exit) A.protest[i] = 0;
        else {
          if (A.protest[i] === PROTEST.PEACEFUL && (A.extrem[i] > 0.5 || (A.aggr[i] > 165 && this.repEff > 0.2)) && rng.next() < 0.1) A.protest[i] = PROTEST.VIOLENT;
          // state response
          if (this.repEff > 0.05) {
            const kill = this.repEff * 0.003 * (A.protest[i] === PROTEST.VIOLENT ? 3 : 1);
            if (rng.next() < kill) { this.die(i, DEATH.REPRESSION); return; }
            if (rng.next() < this.repEff * 0.06) {
              A.occ[i] = OCC.PRISONER; A.protest[i] = 0; A.griev[i] = clamp01(A.griev[i] + 0.2); A.fear[i] = clamp01(A.fear[i] + 0.3);
              this.log(i, 'Was arrested for protesting.');
              return;
            }
          }
        }
      }
    }
    // ---- crime ----
    if (age >= 14 && age < 70) {
      const pov = A.income[i] < S.subs ? 1 - A.income[i] / S.subs : 0;
      const demo = male ? (age < 30 ? 2.5 : age < 45 ? 1.2 : 0.5) : (age < 30 ? 0.45 : 0.25);
      const gini = this.latest.gini ?? 0.35;
      const pc = 0.0045 * demo * (1 + 2.2 * (0.5 - A.C[i] / 255)) * (0.5 + A.aggr[i] / 255) * (1 + 1.8 * pov + 0.8 * (o === OCC.UNEMPLOYED ? 1 : 0))
        * (0.5 + gini * 1.5) * (1.2 - 0.6 * A.strust[i]) * (1 - 0.55 * this.policingEff) * (1 - 0.3 * A.relig[i]) * (1 + crimeX) * (S.conflict ? 2 : 1) * (1.2 - 0.5 * A.emp[i] / 255);
      if (rng.next() < pc) this.commitCrime(i, c);
    }
    // ---- terrorism by militants ----
    if (A.extrem[i] > 0.8 && A.aggr[i] > 120 && age >= 16 && age < 46) {
      const pt = 0.0012 * ((A.extrem[i] - 0.8) / 0.2) * (1 - 0.6 * this.policingEff);
      if (rng.next() < pt) this.terrorAttack(i);
      else if (rng.next() < 0.025 * this.policingEff * (0.5 + S.ruleOfLaw)) { A.occ[i] = OCC.PRISONER; this.log(i, 'Was arrested by security services.'); }
    }
  }

  private commitCrime(i: number, c: number) {
    const A = this.A;
    const rng = this.rng;
    this.acc.crimes++;
    this.crimeNow[c]++;
    A.flags[i] |= F.CRIMINAL;
    const v = this.randomInCell(c, i);
    if (v >= 0) {
      const violent = rng.next() < 0.12 + 0.35 * (A.aggr[i] / 255);
      if (violent) {
        A.health[v] -= 0.12; A.fear[v] = clamp01(A.fear[v] + 0.25); A.mental[v] -= 0.05;
        if (rng.next() < 0.0035 * (1 + 2 * (this.latest.gini ?? 0.35)) * (1.3 - 0.5 * this.S.H)) {
          this.acc.homicides++;
          this.log(v, 'Was killed in a violent crime.');
          this.die(v, DEATH.VIOLENCE);
        }
      } else {
        const loot = Math.min(Math.max(0, A.wealth[v]) * 0.03, this.S.avgWage * 0.5);
        A.wealth[v] -= loot; A.wealth[i] += loot; A.fear[v] = clamp01(A.fear[v] + 0.1);
      }
      A.strust[v] -= 0.03;
    }
    if (rng.next() < 0.12 * this.policingEff) {
      A.occ[i] = OCC.PRISONER;
      A.protest[i] = 0;
      this.log(i, 'Was convicted of a crime and imprisoned.');
    }
  }

  private terrorAttack(i: number) {
    const A = this.A;
    const rng = this.rng;
    const c = A.cell[i];
    const f = A.faith[i];
    const deaths = 1 + Math.min(80, rng.poisson(3) + (rng.next() < 0.1 ? rng.poisson(20) : 0));
    let killed = 0;
    for (let k = 0; k < deaths * 3 && killed < deaths; k++) {
      const v = this.randomNear(c, i, 1);
      if (v >= 0 && v !== i) { this.die(v, DEATH.VIOLENCE); killed++; this.acc.homicides++; }
    }
    this.acc.terror++;
    const fg = this.cfg.population.faiths[f];
    const nationalist = A.patriot[i] > A.relig[i] + 0.1;
    const kind = nationalist ? 'a nationalist militant' : fg.secular ? 'a militant' : `a militant from the ${fg.name} community`;
    const st = this.world.settlements[A.home[i]].name;
    this.addNews(`Attack in ${st}: ${killed} killed by ${kind}.`, 'conflict', 2);
    this.log(i, `Carried out an attack that killed ${killed} people.`);
    // the attacker's whole group suffers a backlash unless the attacker targeted a minority (then the victims' group is afraid)
    const spec = TEMPLATE_BY_ID.terror;
    if (nationalist) {
      const victimGroup = this.pickTargetFaith('minority', undefined);
      const custom: EventSpec = { ...spec, id: 'terrorNat', name: 'Nationalist attack', effects: { fear: 0.3, griev: 0.25, toler: 0.05 }, target: victimGroup !== undefined ? { faith: victimGroup } : {} };
      this.events.push({ uid: this.nextEventUid++, spec: custom, start: this.t, intensity: Math.min(1.5, 0.4 + killed / 20), target: custom.target!, weights: shapeWeights(custom.shape, custom.duration), random: true, leaderId: -1 });
    } else if (!fg.secular) {
      this.events.push({ uid: this.nextEventUid++, spec, start: this.t, intensity: Math.min(1.5, 0.4 + killed / 20), target: { faith: f }, weights: shapeWeights(spec.shape, spec.duration), random: true, leaderId: -1 });
    }
    // the security state hardens
    this.S.repression = clamp01(this.S.repression + 0.01);
    if (rng.next() < 0.7) this.die(i, DEATH.VIOLENCE); else { A.occ[i] = OCC.PRISONER; A.extrem[i] = 1; }
  }

  private partnership(i: number, p: number, pov: number) {
    const A = this.A;
    const S = this.S;
    const rng = this.rng;
    const sim = 1 - (Math.abs(A.social[i] - A.social[p]) + Math.abs(A.relig[i] - A.relig[p])) / 2;
    const stress = pov + (A.occ[i] === OCC.UNEMPLOYED ? 0.3 : 0);
    const bt = 0.45 + 0.2 * ((A.A[i] + A.A[p]) / 255 - 1) + 0.2 * (sim - 0.7) - 0.25 * stress - 0.3 * (A.aggr[p] / 255) * Math.min(1, stress + 0.3)
      + (A.kids[i] > 0 ? 0.05 : 0) + 0.1 * (A.emp[p] / 255 - 0.5) + 0.08 * A.mood[i];
    A.bond[i] = clamp01(A.bond[i] + 0.02 * (bt - A.bond[i]) + (rng.next() - 0.5) * 0.02);
    if (A.aggr[p] > 190 && stress > 0.4) { A.mental[i] -= 0.01; A.fear[i] = clamp01(A.fear[i] + 0.03); }
    // divorce: easier where it is socially accepted and legally possible
    if (i < p) {
      const ease = clamp01(0.1 + 0.6 * this.meanSocial + 0.3 * (1 - (A.relig[i] + A.relig[p]) / 2) - 0.3 * S.collectivism) * (0.5 + 0.5 * S.genderEquality);
      const hz = 0.0007 * ease * (1 + 10 * Math.max(0, 0.45 - (A.bond[i] + A.bond[p]) / 2));
      if (rng.next() < hz) {
        A.partner[i] = -2; A.partner[p] = -2;
        A.mood[i] -= 0.4; A.mood[p] -= 0.4; A.mental[i] -= 0.08; A.mental[p] -= 0.08;
        this.acc.divorces++;
        const leaver = A.sex[i] === 1 ? i : p;
        this.relocate(leaver, A.home[leaver]);
        this.log(i, 'Divorced.');
        this.log(p, 'Divorced.');
      }
    }
  }

  private fertility(i: number, age: number, p: number) {
    const A = this.A;
    const S = this.S;
    const rng = this.rng;
    if (this.t - A.lastBirth[i] < 15) return;
    const partnerF = p >= 0 ? 1 : 0.02 + 0.2 * this.meanSocial * (1 - A.relig[i]);
    const childMort = Math.min(0.5, this.childMu * 4);
    const desired = 1.55 + 2.2 * A.relig[i] + 0.9 * (0.5 - A.social[i]) - 0.06 * A.edu[i] + 3 * childMort + 0.5 * S.collectivism + 1.4 * S.agrarian;
    const contra = S.contraception * (0.75 + 0.25 * Math.min(1, A.edu[i] / 12));
    // Bongaarts: births stop once the desired family size is reached, as far as contraception allows
    const want = A.kids[i] < Math.max(0, desired + (hash01(A.uid[i], 3) - 0.5)) ? 1 : Math.pow(1 - contra, 1.5);
    const delay = age < 18 + 0.8 * Math.max(0, A.edu[i] - 9) ? 1 - contra * 0.85 : 1;
    const shape = FERTILITY_SHAPE[Math.min(6, ((age - 15) / 5) | 0)];
    const econ = 1 - 0.3 * Math.max(0, A.griev[i] - 0.45) - 0.2 * Math.max(0, A.fear[i] - 0.3);
    // natural fertility: ~0.8 conceptions/yr at peak after a 15-month post-birth gap ≈ 30-month spacing
    const pYear = 0.8 * shape * want * delay * partnerF * econ * clamp(A.health[i] / expectedHealth(age), 0.3, 1.1);
    if (rng.next() < pYear / 12) this.birth(i, p);
  }

  private birth(m: number, fa: number) {
    const A = this.A;
    const S = this.S;
    const rng = this.rng;
    const s = A.alloc(this.t);
    if (s < 0) return;
    const male = rng.next() < 0.512 ? 1 : 0;
    A.sex[s] = male;
    A.birth[s] = this.t;
    A.occ[s] = OCC.CHILD;
    A.mother[s] = A.ref(m);
    A.kids[m]++;
    A.lastBirth[m] = this.t;
    let faith = A.faith[m];
    if (fa >= 0) {
      A.father[s] = A.ref(fa);
      A.kids[fa]++;
      if (A.faith[fa] !== faith && rng.next() < 0.5 + 0.4 * S.collectivism) faith = A.faith[fa];
    }
    A.faith[s] = faith;
    const both = fa >= 0;
    const mix = (arr: Uint8Array, mean: number, sd: number, h: number) => {
      const par = both ? (arr[m] + arr[fa]) / 510 : arr[m] / 255;
      arr[s] = Math.round(clamp01(h * par + (1 - h) * mean + sd * rng.normal()) * 255);
    };
    const P = this.cfg.population;
    mix(A.O, P.openness, 0.12, 0.45); mix(A.C, P.conscientiousness, 0.12, 0.45); mix(A.E, P.extraversion, 0.12, 0.45);
    mix(A.A, P.agreeableness, 0.12, 0.45); mix(A.N, P.neuroticism, 0.12, 0.45); mix(A.cog, 0.5, 0.13, 0.5);
    mix(A.emp, P.empathy, 0.12, 0.4); mix(A.aggr, P.aggression + (male ? 0.08 : -0.06), 0.12, 0.4); mix(A.looks, 0.5, 0.14, 0.4);
    const fv = (arr: Float32Array, sd: number) => { arr[s] = clamp01((both ? (arr[m] + arr[fa]) / 2 : arr[m]) + sd * rng.normal()); };
    fv(A.relig, 0.05); fv(A.strict, 0.05); fv(A.toler, 0.06); fv(A.social, 0.06); fv(A.econ, 0.06); fv(A.auth, 0.06);
    fv(A.patriot, 0.06); fv(A.consum, 0.06); fv(A.itrust, 0.06); fv(A.strust, 0.06);
    if (this.cfg.population.faiths[faith].secular) A.relig[s] = Math.min(A.relig[s], 0.15);
    A.extrem[s] = 0;
    A.health[s] = clamp(0.9 + 0.05 * rng.normal() - 0.2 * (1 - S.H) * rng.next(), 0.2, 1);
    A.mental[s] = 0.85; A.happy[s] = 0.7; A.mood[s] = 0.3; A.esteem[s] = 0; A.griev[s] = 0.1;
    A.home[s] = A.home[m];
    this.setPos(s, clampX(A.x[m] + (rng.next() - 0.5) * 1.2), clampY(A.y[m] + (rng.next() - 0.5) * 1.2));
    A.flags[s] = 0;
    this.acc.births++;
    const ma = (this.t - A.birth[m]) / 12;
    const mi = Math.min(34, Math.max(0, (ma | 0) - 15));
    this.birthsByAge[mi]++;
    if (A.flags[m] & F.FOLLOW) this.log(m, `Gave birth to ${personName(A.uid[s], male)}.`);
    if (fa >= 0 && A.flags[fa] & F.FOLLOW) this.log(fa, `Became a father to ${personName(A.uid[s], male)}.`);
  }

  die(i: number, cause: number) {
    const A = this.A;
    if (!A.alive[i]) return;
    const age = (this.t - A.birth[i]) / 12;
    const ai = Math.min(100, Math.max(0, age | 0));
    this.deathsByAge[ai]++;
    this.deathCauses[cause]++;
    this.acc.deaths++;
    if (cause === DEATH.SUICIDE) this.acc.suicides++;
    if (cause === DEATH.REPRESSION) this.acc.repressionKills++;
    if (cause === DEATH.WAR) this.acc.warDeaths++;
    // inheritance
    const p = A.deref(A.partner[i]);
    if (p >= 0) {
      A.wealth[p] += Math.max(0, A.wealth[i]);
      A.mood[p] -= 0.6; A.mental[p] -= 0.12;
      this.log(p, `Lost their partner ${personName(A.uid[i], A.sex[i])}.`);
      this.estate[i] = 0;
    } else {
      this.estate[i] = A.kids[i] > 0 ? Math.max(0, A.wealth[i]) : 0;
    }
    // grief of family; martyrdom and war losses turn into grievance
    const political = cause === DEATH.WAR || cause === DEATH.REPRESSION;
    const touch = (r: number) => {
      const j = A.deref(r);
      if (j < 0) return;
      A.mood[j] -= 0.3; A.mental[j] -= 0.04;
      if (political) { A.griev[j] = clamp01(A.griev[j] + 0.2); A.itrust[j] = clamp01(A.itrust[j] - 0.15); }
    };
    touch(A.mother[i]); touch(A.father[i]);
    if (political && p >= 0) { A.griev[p] = clamp01(A.griev[p] + 0.25); A.itrust[p] = clamp01(A.itrust[p] - 0.2); }
    for (let k = 0; k < FRIEND_SLOTS; k++) {
      const j = A.deref(A.friends[i * FRIEND_SLOTS + k]);
      if (j >= 0) { A.mood[j] -= 0.15; if (political) A.griev[j] = clamp01(A.griev[j] + 0.08); }
    }
    if (A.flags[i] & F.LEADER) {
      const l = this.leaders.find((x) => x.ref === A.ref(i) && x.alive);
      if (l) {
        l.alive = false;
        if (l.inPower) { l.inPower = false; if (this.S.headLeader === l.id) this.S.headLeader = -1; }
        this.addNews(`${l.name} has died${cause === DEATH.VIOLENCE ? ', killed by an assassin' : cause === DEATH.REPRESSION ? ' at the hands of the state' : ''}.`, 'people', 2);
        if (cause === DEATH.VIOLENCE || cause === DEATH.REPRESSION) this.martyr(l);
      }
    }
    if (A.flags[i] & F.FOLLOW) this.log(i, `Died aged ${age.toFixed(0)} (${['natural causes', 'childhood illness', 'epidemic', 'war', 'violence', 'state repression', 'suicide', 'disaster', 'famine'][cause]}).`);
    A.kill(i, this.t);
  }

  /** Followers of a slain leader grow angrier and more devoted (martyrdom effect). */
  private martyr(l: Leader) {
    const A = this.A;
    for (let i = 0; i < A.n; i++) {
      if (!A.alive[i]) continue;
      const d = (Math.abs(A.social[i] - l.ideology.social) + Math.abs(A.relig[i] - l.ideology.relig) + Math.abs(A.patriot[i] - l.ideology.patriot)) / 3;
      if (d < 0.15) { A.griev[i] = clamp01(A.griev[i] + 0.15); if (l.style === 'extremist') A.extrem[i] = clamp01(A.extrem[i] + 0.05); }
    }
  }

  private emigrate(i: number) {
    const A = this.A;
    this.acc.emigrants++;
    this.log(i, 'Emigrated abroad.');
    const p = A.deref(A.partner[i]);
    A.kill(i, this.t);
    if (p >= 0 && this.rng.next() < 0.75) { this.acc.emigrants++; A.kill(p, this.t); }
  }

  private aggregate(i: number, age: number, ageInt: number, male: boolean) {
    const A = this.A;
    if (!A.alive[i]) return;
    const acc = this.acc;
    const c = A.cell[i];
    const f = A.faith[i];
    const o = A.occ[i];
    acc.alive++;
    this.exposure[ageInt] += 1 / 12;
    acc.medianAgeHist[ageInt]++;
    this.nN[c]++;
    this.nSocial[c] += A.social[i]; this.nRelig[c] += A.relig[i]; this.nPatriot[c] += A.patriot[i];
    this.nConsum[c] += A.consum[i]; this.nToler[c] += A.toler[i]; this.nWealth[c] += A.wealth[i];
    this.nFaith[c * MAX_FAITHS + f]++;
    this.settlementPop[A.home[i]]++;
    if (A.disease[i] === DIS.I) { this.nInf[c]++; acc.infected++; }
    if (A.protest[i]) { this.nProtest[c]++; this.settlementProtest[A.home[i]]++; }
    acc.occ[o]++;
    acc.faith[f]++;
    if (IS_EMPLOYED[o] && o !== OCC.SOLDIER) acc.employed++;
    if (o === OCC.SOLDIER) { acc.soldiers++; acc.soldierTrust += A.itrust[i]; }
    if (o === OCC.ELITE) acc.elites++;
    if (A.wealth[i] > 0) acc.posWealth += A.wealth[i];
    if (!male && age >= 15 && age < 50) this.womenByAge[Math.min(34, ageInt - 15)] += 1 / 12;
    if (age < 18) { acc.children++; return; }
    acc.adults++;
    if (IS_EMPLOYED[o] || o === OCC.UNEMPLOYED) acc.laborForce++;
    if (o === OCC.UNEMPLOYED) acc.unemployed++;
    if (A.extrem[i] >= 0.7) { acc.extremists++; acc.faithExtrem[f]++; }
    if (age >= 25 && age < 56 && A.edu[i] >= 16) { acc.aspirants++; if (A.flags[i] & F.FRUSTRATED) acc.frustrated++; }
    // Population means come from a systematic sample (every k-th adult, ≥ 20k people): statistically
    // exact to ±0.005 and several times cheaper than summing 25 attributes over millions.
    if (++this.meanCounter >= this.meanStride) {
      this.meanCounter = 0;
      acc.sampled++;
      acc.happy += A.happy[i]; acc.health += A.health[i]; acc.mental += A.mental[i]; acc.griev += A.griev[i]; acc.fear += A.fear[i];
      acc.itrust += A.itrust[i]; acc.strust += A.strust[i]; acc.toler += A.toler[i]; acc.social += A.social[i]; acc.econ += A.econ[i];
      acc.auth += A.auth[i]; acc.patriot += A.patriot[i]; acc.consum += A.consum[i]; acc.esteem += A.esteem[i]; acc.relig += A.relig[i];
      acc.strict += A.strict[i];
      acc.social2 += A.social[i] * A.social[i]; acc.econ2 += A.econ[i] * A.econ[i];
      acc.faithN[f]++; acc.faithGriev[f] += A.griev[i]; acc.faithToler[f] += A.toler[i]; acc.faithWealth[f] += A.wealth[i]; acc.faithRelig[f] += A.relig[i];
      if (age >= 25) { acc.edu25 += A.edu[i]; acc.n25++; }
      if (age >= 20 && age < 30) acc.youth++;
      if (A.deref(A.partner[i]) >= 0) acc.partnered++;
      if (this.isUrbanHome(i)) acc.urban++;
      if (A.flags[i] & F.IMMIGRANT) acc.immigrants++;
    }
    if (A.protest[i]) {
      acc.protesters++;
      if (A.protest[i] === PROTEST.VIOLENT) acc.violent++;
      acc.pSocial += A.social[i]; acc.pEcon += A.econ[i]; acc.pAuth += A.auth[i]; acc.pRelig += A.relig[i]; acc.pPatriot += A.patriot[i];
      acc.pStrict += A.strict[i]; acc.pExtrem += A.extrem[i];
    }
    // party preference (also used for the "vote" lens)
    const parties = this.S.parties;
    if (parties.length && this.t % 3 === 0) {
      let best = 0, bu = -1e9;
      const it = A.itrust[i];
      for (let k = 0; k < parties.length; k++) {
        const pp = parties[k].pos;
        let u = -((Math.abs(A.social[i] - pp.social) + Math.abs(A.econ[i] - pp.econ) + 0.8 * Math.abs(A.auth[i] - pp.auth) + 0.8 * Math.abs(A.relig[i] - pp.relig) + 0.7 * Math.abs(A.patriot[i] - pp.patriot)) / 4.3);
        if (this.S.govParties.includes(k)) u -= 0.08 * (1 - it) - 0.03 * it;
        if (parties[k].leader >= 0) u += this.leaderBonus(parties[k].leader, i);
        u += 0.03 * hash01(A.uid[i] + k, 91);
        if (u > bu) { bu = u; best = k; }
      }
      A.vote[i] = best + 1;
      const turnout = 0.35 + 0.35 * it + 0.15 * Math.min(1, A.edu[i] / 14) + (age > 30 ? 0.1 : 0);
      acc.votes[best] += turnout;
    }
    // income/wealth sample
    if (++this.sampleCounter >= this.sampleStride && this.sampleN < 4096) {
      this.sampleCounter = 0;
      const p = A.deref(A.partner[i]);
      const kids = A.kids[i] * clamp((50 - age) / 25, 0, 1);
      this.sampleInc[this.sampleN] = (A.income[i] + (p >= 0 ? A.income[p] : 0)) / (1 + (p >= 0 ? 0.5 : 0) + 0.3 * kids);
      this.sampleWealth[this.sampleN] = A.wealth[i];
      if (this.sampleN < 4000) {
        const b = this.sampleN * 5;
        this.ideoSample[b] = A.social[i]; this.ideoSample[b + 1] = A.econ[i]; this.ideoSample[b + 2] = A.auth[i];
        this.ideoSample[b + 3] = A.relig[i]; this.ideoSample[b + 4] = A.patriot[i];
      }
      this.sampleN++;
    }
  }

  private leaderBonus(leaderId: number, i: number): number {
    const l = this.leaders.find((x) => x.id === leaderId);
    if (!l || !l.alive) return 0;
    const A = this.A;
    const d = (Math.abs(A.social[i] - l.ideology.social) + Math.abs(A.patriot[i] - l.ideology.patriot) + Math.abs(A.auth[i] - l.ideology.auth)) / 3;
    return d < 0.3 ? 0.08 * l.charisma * (1 + A.griev[i]) : 0;
  }

  // ==============================================================================================
  // After the agent loop: aggregates, politics, stats
  // ==============================================================================================

  private postLoop() {
    const A = this.A;
    const S = this.S;
    const acc = this.acc;
    // swap cell buffers
    [this.cN, this.nN] = [this.nN, this.cN];
    [this.cSocial, this.nSocial] = [this.nSocial, this.cSocial];
    [this.cRelig, this.nRelig] = [this.nRelig, this.cRelig];
    [this.cPatriot, this.nPatriot] = [this.nPatriot, this.cPatriot];
    [this.cConsum, this.nConsum] = [this.nConsum, this.cConsum];
    [this.cToler, this.nToler] = [this.nToler, this.cToler];
    [this.cWealth, this.nWealth] = [this.nWealth, this.cWealth];
    [this.cProtest, this.nProtest] = [this.nProtest, this.cProtest];
    [this.cInf, this.nInf] = [this.nInf, this.cInf];
    [this.cFaith, this.nFaith] = [this.nFaith, this.cFaith];
    for (let c = 0; c < NCELLS; c++) {
      const n = this.cN[c];
      this.cCrime[c] = this.cCrime[c] * 0.92 + (n > 0 ? (this.crimeNow[c] / n) * 0.08 * 12 : 0);
    }
    if (acc.empN > 20) this.meanEmployability = Math.max(0.2, acc.empSum / acc.empN);
    this.lastLeff = Math.max(1, acc.skill);
    this.lastEmployed = Math.max(1, acc.employed);
    this.lastPosWealth = Math.max(1, acc.posWealth);
    this.lastTaxes = acc.taxes;
    this.lastTransfers = acc.transfers;
    this.lastElites = acc.elites;
    this.lastSoldierFrac = acc.soldiers / Math.max(1, acc.adults * 0.25);
    this.redistCarry += this.redistPool;
    const adults = Math.max(1, acc.adults);
    S.unemployment = acc.laborForce > 0 ? acc.unemployed / acc.laborForce : 0;
    S.protestFrac = acc.protesters / adults;
    S.violentFrac = acc.violent / adults;
    S.infected = acc.infected;
    for (let f = 0; f < this.K; f++) this.faithShareNow[f] = acc.alive > 0 ? acc.faith[f] / acc.alive : 0;
    let mj = 0;
    for (let f = 0; f < this.K; f++) if (f !== this.secularFaith && this.faithShareNow[f] > this.faithShareNow[mj]) mj = f;
    if (mj !== this.majorityFaith && this.t > 1 && this.faithShareNow[mj] > this.faithShareNow[this.majorityFaith] + 0.01) {
      this.addNews(`${this.cfg.population.faiths[mj].name} is now the largest faith group.`, 'faith', 1);
      this.majorityFaith = mj;
    }
    // leaders' support
    for (const l of this.leaders) if (l.alive) { l.support = l.support / Math.max(1, acc.adults) * 2; }
    this.revolutionaryBoost = this.leaders.some((l) => l.alive && l.style === 'revolutionary') ? 1 : 0;
    this.leaderGrowth = this.leaders.some((l) => l.alive && l.style === 'visionary') ? 0.002 : 0;
    // migrants
    if (this.pendingMigrants > 0) {
      const k = Math.min(this.pendingMigrants, Math.ceil(A.live * 0.01) + 4096);
      this.spawnMigrants(k, this.pendingMigrantProfile);
      this.pendingMigrants = 0;
      this.pendingMigrantProfile = null;
    }
    this.computeQuantiles(false);
    this.politics();
    this.collectStats(false);
    // reset leader support counters
    for (const l of this.leaders) if (l.alive) l.support = 0;
  }

  private aggregateCellsOnly() {
    const A = this.A;
    this.cN.fill(0); this.cSocial.fill(0); this.cRelig.fill(0); this.cPatriot.fill(0); this.cConsum.fill(0); this.cToler.fill(0); this.cWealth.fill(0); this.cFaith.fill(0);
    const counts = new Float64Array(MAX_FAITHS);
    for (let i = 0; i < A.n; i++) {
      if (!A.alive[i]) continue;
      const c = A.cell[i];
      this.cN[c]++;
      this.cSocial[c] += A.social[i]; this.cRelig[c] += A.relig[i]; this.cPatriot[c] += A.patriot[i];
      this.cConsum[c] += A.consum[i]; this.cToler[c] += A.toler[i]; this.cWealth[c] += A.wealth[i];
      this.cFaith[c * MAX_FAITHS + A.faith[i]]++;
      counts[A.faith[i]]++;
    }
    for (let f = 0; f < this.K; f++) this.faithShareNow[f] = counts[f] / Math.max(1, A.live);
    let mj = 0;
    for (let f = 0; f < this.K; f++) if (f !== this.secularFaith && counts[f] > counts[mj]) mj = f;
    this.majorityFaith = mj;
  }

  private computeQuantiles(init: boolean) {
    const A = this.A;
    if (init) {
      // sample directly
      const n = Math.min(4096, A.live);
      let k = 0;
      const stride = Math.max(1, Math.floor(A.n / n));
      for (let i = 0; i < A.n && k < 4096; i += stride) {
        if (!A.alive[i]) continue;
        this.sampleWealth[k] = A.wealth[i];
        this.sampleInc[k] = A.income[i];
        k++;
      }
      this.sampleN = k;
    }
    const n = this.sampleN;
    if (n < 10) return;
    const inc = Float64Array.from(this.sampleInc.subarray(0, n)).sort();
    const w = Float64Array.from(this.sampleWealth.subarray(0, n)).sort();
    for (let q = 0; q <= 32; q++) {
      const idx = Math.min(n - 1, Math.floor((q / 32) * (n - 1)));
      this.eqIncQ[q] = inc[idx];
      this.wealthQ[q] = w[idx];
    }
    this.wealthTop = w[Math.floor(0.9 * (n - 1))];
    this.wealthMedian = w[Math.floor(0.5 * (n - 1))];
    if (!init) {
      const ginc = giniSorted(inc, n);
      const gw = giniSorted(w, n);
      const medInc = inc[Math.floor(n / 2)];
      let pov = 0, ext = 0, top = 0, tot = 0;
      const extLine = (2.15 * 365) / 12;
      for (let k = 0; k < n; k++) {
        if (inc[k] < medInc * 0.5) pov++;
        if (inc[k] < extLine) ext++;
        const v = Math.max(0, w[k]);
        tot += v;
        if (k >= Math.floor(0.9 * n)) top += v;
      }
      this.latest.gini = ginc;
      this.latest.wealthGini = gw;
      this.latest.poverty = pov / n;
      this.latest.extremePoverty = ext / n;
      this.latest.top10 = tot > 0 ? top / tot : 0;
    }
  }

  /** Percentile of value v given 33 quantile cut points. */
  pct(q: Float64Array, v: number): number {
    if (v <= q[0]) return 0;
    if (v >= q[32]) return 1;
    let lo = 0, hi = 32;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (q[mid] <= v) lo = mid; else hi = mid; }
    const span = q[hi] - q[lo];
    return (lo + (span > 0 ? (v - q[lo]) / span : 0)) / 32;
  }

  private spawnMigrants(count: number, prof: MigrantProfile | null) {
    const A = this.A;
    const S = this.S;
    const rng = this.rng;
    if (A.ensureHeadroom(count + 16)) this.ensureAux();
    const P = this.cfg.population;
    const pos = { x: 0, y: 0 };
    for (let k = 0; k < count; k++) {
      const s = A.alloc(this.t);
      if (s < 0) break;
      const age = 18 + rng.next() * 30;
      A.birth[s] = this.t - Math.round(age * 12);
      const male = rng.next() < 0.55 ? 1 : 0;
      A.sex[s] = male;
      let f = prof && prof.faith >= 0 && prof.faith < this.K ? prof.faith : -1;
      if (f < 0) {
        // -1: same mix as the population; -2: newcomers over-represent minority faiths
        const w: number[] = [];
        let tot = 0;
        for (let q = 0; q < this.K; q++) { const v = this.faithShareNow[q] * (prof?.faith === -2 && this.isMinority(q) ? 3 : 1) + 0.001; w.push(v); tot += v; }
        let r = rng.next() * tot; f = 0;
        for (let q = 0; q < this.K; q++) { r -= w[q]; if (r <= 0) { f = q; break; } }
      }
      A.faith[s] = f;
      const st = this.world.pick(rng, 0.85);
      A.home[s] = st;
      this.world.place(rng, st, pos);
      this.setPos(s, pos.x, pos.y);
      const u8 = (v: number) => Math.round(clamp01(v) * 255);
      A.O[s] = u8(0.55 + 0.15 * rng.normal()); A.C[s] = u8(0.55 + 0.15 * rng.normal()); A.E[s] = u8(0.5 + 0.15 * rng.normal());
      A.A[s] = u8(0.5 + 0.15 * rng.normal()); A.N[s] = u8(0.5 + 0.15 * rng.normal()); A.cog[s] = u8(0.5 + 0.16 * rng.normal());
      A.emp[s] = u8(0.5 + 0.15 * rng.normal()); A.aggr[s] = u8(0.4 + (male ? 0.08 : -0.05) + 0.12 * rng.normal()); A.looks[s] = u8(0.5 + 0.16 * rng.normal());
      A.edu[s] = clamp((prof?.education ?? 9) + 3 * rng.normal(), 0, 20);
      const fg = P.faiths[f];
      A.relig[s] = fg.secular ? 0.05 : clamp01((prof?.religiosity ?? fg.religiosity) + 0.15 * rng.normal());
      A.strict[s] = clamp01((prof?.strictness ?? fg.strictness) + 0.15 * rng.normal());
      A.toler[s] = clamp01(fg.tolerance + 0.12 * rng.normal());
      A.social[s] = clamp01((prof?.social ?? 0.45) + 0.15 * rng.normal());
      A.econ[s] = clamp01(0.45 + 0.15 * rng.normal());
      A.auth[s] = clamp01(0.5 + 0.15 * rng.normal());
      A.patriot[s] = clamp01(0.35 + 0.15 * rng.normal());
      A.consum[s] = clamp01(0.45 + 0.15 * rng.normal());
      A.itrust[s] = clamp01(0.5 + 0.12 * rng.normal());
      A.strust[s] = clamp01(0.4 + 0.12 * rng.normal());
      A.health[s] = clamp(0.75 + 0.08 * rng.normal(), 0.2, 1);
      A.mental[s] = clamp(0.6 + 0.1 * rng.normal(), 0.1, 1);
      A.happy[s] = 0.5; A.griev[s] = 0.25; A.fear[s] = 0.2;
      A.wealth[s] = Math.max(0, (prof?.wealth ?? 0.3) * 3.5 * S.gdppc * Math.exp(0.8 * rng.normal() - 0.32));
      A.occ[s] = OCC.UNEMPLOYED;
      A.flags[s] = F.IMMIGRANT;
    }
    if (count > Math.max(50, A.live * 0.004)) this.addNews(`${compactInt(count * this.popScale)} immigrants arrived this month.`, 'society', 1);
  }

  // ---- politics: elections, protests, regime change ----
  private politics() {
    const S = this.S;
    const acc = this.acc;
    const adults = Math.max(1, acc.sampled);
    // legitimacy
    const perf = clamp01(0.5 + 6 * S.growth - 2 * Math.max(0, S.unemployment - 0.05) - 0.5 * Math.max(0, S.inflation - 0.05));
    const meanIdeo: Ideology = { social: acc.social / adults, econ: acc.econ / adults, auth: acc.auth / adults, relig: acc.relig / adults, patriot: acc.patriot / adults };
    const align = 1 - ideoDist(meanIdeo, S.ruling) * 2;
    const lt = 0.3 * perf + 0.25 * (acc.itrust / adults) + 0.15 * S.democracy + 0.2 * clamp01(align) + 0.1 * S.ruleOfLaw;
    S.legitimacy += 0.1 * (lt - S.legitimacy);
    // Turchin's political stress
    const youth = acc.youth / adults;
    S.mmp = clamp((acc.griev / adults / 0.28) * (0.4 + 0.6 * ((acc.urban / adults) || 0)) * (youth / 0.17), 0, 5);
    S.emp = clamp((acc.aspirants / Math.max(1, this.eliteSlots)) / Math.max(1, S.aspirantBase) * (0.5 + acc.frustrated / Math.max(1, acc.aspirants)), 0, 5);
    S.sfd = clamp((0.3 + Math.max(0, S.debtRatio)) * (1.2 - acc.itrust / adults), 0, 5);
    const raw = S.mmp * S.emp * S.sfd;
    S.psi = raw / (raw + 1.2);

    // protests & regime crises
    const pf = S.protestFrac;
    S.protestMonths = pf > 0.01 ? S.protestMonths + 1 : 0;
    S.violentMonths = S.violentFrac > 0.002 ? S.violentMonths + 1 : 0;
    if (pf > 0.01 && S.protestMonths === 1 && this.t - this.lastProtestNews > 12) this.lastProtestNews = this.t, this.addNews(`Mass protests: ${(pf * 100).toFixed(1)}% of adults are on the streets.`, 'politics', 2);
    const revThreshold = 0.035 * (0.6 + 0.4 * S.securityLoyalty + 0.3 * S.repression);
    const sinceChange = this.t - S.regimeSince;
    if (S.democracy < 0.5) {
      if (pf > revThreshold && S.protestMonths >= 3 && S.securityLoyalty < 0.55 && sinceChange > 36) this.revolution();
    } else if (pf > 0.03 && S.protestMonths >= 4 && S.nextElection - this.t > 12 && (!S.lastElection || this.t - S.lastElection.tick > 24)) {
      this.addNews('Under pressure from the streets, the government calls early elections.', 'politics', 2);
      S.nextElection = this.t + 2;
    }
    // civil conflict
    if (!S.conflict && S.violentMonths >= 6 && S.violentFrac > 0.003) {
      S.conflict = true;
      this.startEvent(TEMPLATE_BY_ID.civilWar, clamp(S.violentFrac / 0.01, 0.4, 1.5), false);
      this.addNews('Armed groups and state forces are now fighting: the country slides into civil war.', 'conflict', 2);
    }
    if (S.conflict) {
      S.calmMonths = S.violentFrac < 0.001 ? S.calmMonths + 1 : 0;
      if (S.calmMonths >= 12 && !this.events.some((e) => e.spec.id === 'civilWar')) { S.conflict = false; this.addNews('The fighting has ended. A fragile peace returns.', 'conflict', 2); }
    }
    // elections
    if (S.democracy >= 0.45 && this.t >= S.nextElection && S.nextElection > 0) this.election();
    if (S.democracy >= 0.45 && S.nextElection <= 0) S.nextElection = this.t + 12;
    if (S.democracy < 0.45 && S.nextElection > 0 && this.t >= S.nextElection) {
      S.nextElection = 0;
      if (S.parties.length) this.addNews('Elections are suspended.', 'politics', 2);
    }
    // keep the regime label current
    if (this.t % 12 === 0) S.regimeLabel = regimeLabelFor(S.democracy, S.ruling, S.regimeLabel);
    // party poll shares
    let tv = 0;
    for (let k = 0; k < S.parties.length; k++) tv += acc.votes[k];
    if (tv > 0) for (let k = 0; k < S.parties.length; k++) S.parties[k].share = acc.votes[k] / tv;
  }

  private revolution() {
    const S = this.S;
    const acc = this.acc;
    const np = Math.max(1, acc.protesters);
    const pIdeo: Ideology = { social: acc.pSocial / np, econ: acc.pEcon / np, auth: acc.pAuth / np, relig: acc.pRelig / np, patriot: acc.pPatriot / np };
    const violentShare = acc.violent / np;
    const pStrict = acc.pStrict / np;
    const leader = this.leaders.find((l) => l.alive && !l.inPower && l.id !== S.headLeader && (l.style === 'revolutionary' || l.style === 'peacemaker' || l.style === 'demagogue' || l.style === 'spiritual' || l.style === 'reformer') && l.support > 0.05);
    let kind: RegimeKind;
    if (violentShare < 0.3 && pIdeo.auth < 0.55) kind = 'democratic';
    else if (pIdeo.relig > 0.68 && pStrict > 0.55) kind = 'theocracy';
    else if (pIdeo.econ < 0.3) kind = 'socialist';
    else kind = 'nationalist';
    if (leader && (leader.style === 'peacemaker' || leader.style === 'reformer') && kind !== 'theocracy') kind = 'democratic';
    const old = S.regimeLabel;
    this.setRegime(kind, leader ? { ...leader.ideology } : pIdeo);
    if (leader) { leader.inPower = true; S.headLeader = leader.id; }
    S.securityLoyalty = 0.7;
    S.legitimacy = 0.65;
    const next = kind === 'democratic' ? 'A democratic transition begins' : `New regime: ${REGIMES[kind].label.toLowerCase()}`;
    this.addNews(`REVOLUTION: the ${old.toLowerCase()} falls. ${leader ? `${leader.name} takes power. ` : ''}${next}.`, 'politics', 3);
    // protesters go home, hope rises
    const A = this.A;
    for (let i = 0; i < A.n; i++) if (A.alive[i] && A.protest[i]) { A.protest[i] = 0; A.griev[i] *= 0.6; A.itrust[i] = clamp01(A.itrust[i] + 0.2); }
    S.protestMonths = 0;
  }

  private formParties(init: boolean) {
    const S = this.S;
    const n = Math.min(this.sampleN || 0, 4000);
    let pts = this.ideoSample;
    let cnt = n;
    if (init || n < 50) {
      const A = this.A;
      cnt = 0;
      pts = new Float32Array(5 * 4000);
      const stride = Math.max(1, Math.floor(A.n / 4000));
      for (let i = 0; i < A.n && cnt < 4000; i += stride) {
        if (!A.alive[i] || (this.t - A.birth[i]) / 12 < 18) continue;
        const b = cnt * 5;
        pts[b] = A.social[i]; pts[b + 1] = A.econ[i]; pts[b + 2] = A.auth[i]; pts[b + 3] = A.relig[i]; pts[b + 4] = A.patriot[i];
        cnt++;
      }
    }
    const k = 4;
    const prev = S.parties.map((p) => p.pos);
    const cent = clusterParties(pts, cnt, k, prev, this.rng);
    const taken = new Set<string>();
    const parties: Party[] = cent.map((pos, idx) => {
      const old = S.parties[idx];
      const pos2 = old ? blendIdeo(old.pos, pos, 0.5) : pos;
      let name = old && ideoDist(old.pos, pos2) < 0.08 ? old.name : '';
      if (!name || taken.has(name)) name = partyName(pos2, taken);
      taken.add(name);
      return { id: idx, name, color: PARTY_COLORS[idx], pos: pos2, share: old?.share ?? 0, leader: old?.leader ?? -1 };
    });
    // charismatic leaders lead the closest party
    for (const p of parties) p.leader = -1;
    for (const l of this.leaders) {
      if (!l.alive || l.reach < 0.5 || l.style === 'extremist' || l.style === 'visionary' || l.style === 'spiritual') continue;
      let best = 0, bd = 9;
      parties.forEach((p, idx) => { const d = ideoDist(p.pos, l.ideology); if (d < bd) { bd = d; best = idx; } });
      parties[best].leader = l.id;
      parties[best].pos = blendIdeo(parties[best].pos, l.ideology, 0.6);
      if (bd > 0.08) parties[best].name = partyName(parties[best].pos, new Set(parties.filter((x) => x !== parties[best]).map((x) => x.name)));
    }
    S.parties = parties;
    if (init) {
      // initial government: the party closest to the configured rulers
      let best = 0, bd = 9;
      parties.forEach((p, idx) => { const d = ideoDist(p.pos, S.ruling); if (d < bd) { bd = d; best = idx; } });
      S.govParties = S.democracy >= 0.45 ? [best] : [];
    }
  }

  private election() {
    const S = this.S;
    this.formParties(false);
    // recompute shares with the new platforms on the next aggregate pass: use last month's polls as the vote
    const A = this.A;
    const votes = new Float64Array(S.parties.length);
    let turnoutSum = 0, adults = 0;
    for (let i = 0; i < A.n; i++) {
      if (!A.alive[i] || (this.t - A.birth[i]) / 12 < 18) continue;
      adults++;
      const it = A.itrust[i];
      const turnout = 0.35 + 0.35 * it + 0.15 * Math.min(1, A.edu[i] / 14) + ((this.t - A.birth[i]) / 12 > 30 ? 0.1 : 0);
      if (this.rng.next() > turnout) continue;
      turnoutSum++;
      let best = 0, bu = -1e9;
      for (let k = 0; k < S.parties.length; k++) {
        const pp = S.parties[k].pos;
        let u = -((Math.abs(A.social[i] - pp.social) + Math.abs(A.econ[i] - pp.econ) + 0.8 * Math.abs(A.auth[i] - pp.auth) + 0.8 * Math.abs(A.relig[i] - pp.relig) + 0.7 * Math.abs(A.patriot[i] - pp.patriot)) / 4.3);
        if (S.govParties.includes(k)) u -= 0.08 * (1 - it) - 0.03 * it;
        if (S.parties[k].leader >= 0) u += this.leaderBonus(S.parties[k].leader, i);
        u += 0.05 * this.rng.next();
        if (u > bu) { bu = u; best = k; }
      }
      votes[best]++;
      A.vote[i] = best + 1;
    }
    const total = Math.max(1, turnoutSum);
    const shares = Array.from(votes, (v) => v / total);
    // coalition: largest party plus nearest partners until > 50%
    const order = shares.map((s, k) => k).sort((a, b) => shares[b] - shares[a]);
    const coalition = [order[0]];
    let sum = shares[order[0]];
    while (sum < 0.5 && coalition.length < S.parties.length) {
      let best = -1, bd = 9;
      for (const k of order) {
        if (coalition.includes(k)) continue;
        const d = ideoDist(S.parties[k].pos, S.parties[order[0]].pos);
        if (d < bd) { bd = d; best = k; }
      }
      if (best < 0) break;
      coalition.push(best);
      sum += shares[best];
    }
    // government ideology: weighted platform of the coalition, or the charismatic leader's own
    let tot = 0;
    const g: Ideology = { social: 0, econ: 0, auth: 0, relig: 0, patriot: 0 };
    for (const k of coalition) {
      const w = shares[k];
      tot += w;
      for (const d of ['social', 'econ', 'auth', 'relig', 'patriot'] as const) g[d] += S.parties[k].pos[d] * w;
    }
    for (const d of ['social', 'econ', 'auth', 'relig', 'patriot'] as const) g[d] /= Math.max(1e-9, tot);
    const headParty = S.parties[order[0]];
    // previous head leader leaves office
    for (const l of this.leaders) l.inPower = false;
    S.headLeader = -1;
    if (headParty.leader >= 0) {
      const l = this.leaders.find((x) => x.id === headParty.leader && x.alive);
      if (l) {
        l.inPower = true;
        S.headLeader = l.id;
        S.ruling = blendIdeo(g, l.ideology, 0.65);
      } else S.ruling = g;
    } else S.ruling = g;
    S.govParties = coalition;
    S.nextElection = this.t + 12 * Math.max(1, this.cfg.society.electionYears);
    const names = S.parties.map((p) => p.name);
    const lead = S.headLeader >= 0 ? this.leaders.find((x) => x.id === S.headLeader) : null;
    const headline = `${names[order[0]]} wins ${(shares[order[0]] * 100).toFixed(0)}%` + (coalition.length > 1 ? ` and governs with ${coalition.slice(1).map((k) => names[k]).join(' & ')}` : ' and governs alone') + (lead ? `; ${lead.name} takes office` : '') + `. Turnout ${(turnoutSum / Math.max(1, adults) * 100).toFixed(0)}%.`;
    S.lastElection = { tick: this.t, year: this.year, turnout: turnoutSum / Math.max(1, adults), shares, names, colors: S.parties.map((p) => p.color), coalition, headline };
    for (let k = 0; k < S.parties.length; k++) S.parties[k].share = shares[k];
    this.addNews(`Election: ${headline}`, 'politics', 2);
    this.electionHistory.push(S.lastElection);
    if (this.electionHistory.length > 60) this.electionHistory.shift();
  }

  electionHistory: ElectionResult[] = [];

  // ---- statistics ----
  private collectStats(init: boolean) {
    const S = this.S;
    const acc = this.acc;
    const A = this.A;
    const L = this.latest;
    if (init) {
      // a quick pass to fill means before the first tick
      this.acc.reset();
      for (let i = 0; i < A.n; i++) {
        if (!A.alive[i]) continue;
        const age = (this.t - A.birth[i]) / 12;
        this.aggregateLight(i, age);
      }
    }
    const adults = Math.max(1, acc.sampled || acc.adults);
    const pop = Math.max(1, acc.alive || A.live);
    L.pop = A.live * this.popScale;
    L.adults = acc.adults;
    L.happy = acc.happy / adults; L.health = acc.health / adults; L.mental = acc.mental / adults;
    L.griev = acc.griev / adults; L.fear = acc.fear / adults; L.itrust = acc.itrust / adults; L.strust = acc.strust / adults;
    L.toler = acc.toler / adults; L.social = acc.social / adults; L.econ = acc.econ / adults; L.auth = acc.auth / adults;
    L.patriot = acc.patriot / adults; L.consum = acc.consum / adults; L.esteem = acc.esteem / adults; L.relig = acc.relig / adults;
    L.strict = acc.strict / adults;
    const vs = acc.social2 / adults - L.social * L.social;
    const ve = acc.econ2 / adults - L.econ * L.econ;
    L.polarization = clamp01((Math.sqrt(Math.max(0, vs)) + Math.sqrt(Math.max(0, ve))) / 2 / 0.5);
    L.extrem = acc.extremists / Math.max(1, acc.adults);
    L.edu = acc.n25 > 0 ? acc.edu25 / acc.n25 : 0;
    L.married = acc.partnered / adults;
    L.urban = acc.urban / adults;
    L.immigrantShare = acc.immigrants / adults;
    L.youth = acc.youth / adults;
    L.soldierTrust = acc.soldiers > 0 ? acc.soldierTrust / acc.soldiers : 0.5;
    L.gdppc = S.gdppc; L.growth = S.growth; L.unemployment = S.unemployment; L.inflation = S.inflation;
    L.debtRatio = S.debtRatio; L.democracy = S.democracy; L.pressFreedom = S.pressFreedom; L.repression = S.repression;
    L.legitimacy = S.legitimacy; L.psi = S.psi; L.protest = S.protestFrac; L.welfare = S.welfare; L.taxRate = S.taxRate;
    // demographic rates (annualized from the month; smoothed)
    if (!init) {
      const r = (x: number) => (x * 12 * 1000) / pop;
      const sm = (prev: number, v: number) => (this.t < 3 ? v : prev * 0.85 + v * 0.15);
      this.prevRates.births = sm(this.prevRates.births, r(acc.births));
      this.prevRates.deaths = sm(this.prevRates.deaths, r(acc.deaths));
      this.prevRates.crime = sm(this.prevRates.crime, r(acc.crimes));
      this.prevRates.homicide = sm(this.prevRates.homicide, (acc.homicides * 12 * 100000) / pop);
      this.prevRates.suicide = sm(this.prevRates.suicide, (acc.suicides * 12 * 100000) / pop);
      this.popYearBirths += acc.births; this.popYearDeaths += acc.deaths;
      this.yearCrimes += acc.crimes; this.yearHomicides += acc.homicides; this.yearSuicides += acc.suicides;
    }
    L.births = this.prevRates.births; L.deaths = this.prevRates.deaths; L.crime = this.prevRates.crime;
    L.homicide = this.prevRates.homicide; L.suicide = this.prevRates.suicide;
    if (init) { L.births = NaN; L.deaths = NaN; L.crime = NaN; L.homicide = NaN; L.suicide = NaN; }
    // yearly: life table, TFR, pyramid, median age
    if (init || this.t % 12 === 0) {
      if (!init) {
        this.lifeExp = lifeExpectancy(this.deathsByAge, this.exposure);
        let tfr = 0;
        for (let a = 0; a < 35; a++) if (this.womenByAge[a] > 0) tfr += this.birthsByAge[a] / this.womenByAge[a];
        this.tfr = tfr;
        this.deathsByAge.fill(0); this.exposure.fill(0); this.birthsByAge.fill(0); this.womenByAge.fill(0);
      }
      this.pyramid.male.fill(0); this.pyramid.female.fill(0);
      for (let i = 0; i < A.n; i++) {
        if (!A.alive[i]) continue;
        const b = Math.min(20, (((this.t - A.birth[i]) / 12) / 5) | 0);
        if (A.sex[i]) this.pyramid.male[b]++; else this.pyramid.female[b]++;
      }
      let cum = 0;
      const half = acc.alive / 2;
      for (let a = 0; a <= 100; a++) { cum += acc.medianAgeHist[a]; if (cum >= half) { this.medianAge = a + 0.5; break; } }
      // political compass density
      this.compass.fill(0);
      for (let k = 0; k < Math.min(this.sampleN, 4000); k++) {
        const x = Math.min(23, (this.ideoSample[k * 5] * 24) | 0);
        const y = Math.min(23, (this.ideoSample[k * 5 + 1] * 24) | 0);
        this.compass[y * 24 + x]++;
      }
    }
    if (init && !this.lifeExp) this.lifeExp = this.expectedLifeExp();
    L.lifeExp = this.lifeExp || L.lifeExp || NaN;
    L.tfr = this.tfr || L.tfr || NaN;
    L.medianAge = this.medianAge;
    for (let f = 0; f < this.K; f++) L['faith' + f] = this.faithShareNow[f];
    for (let k = 0; k < S.parties.length; k++) L['party' + k] = S.parties[k].share;
  }

  /** Life expectancy implied by the current mortality schedule (used before a full year of deaths exists). */
  private expectedLifeExp(): number {
    let l = 1, e = 0;
    for (let a = 0; a <= 110; a++) {
      const mu = (a < 5 ? this.childMu * (a < 1 ? 3 : 0.4) : 0) + this.gomp[Math.min(120, a)];
      const q = 1 - Math.exp(-mu * 1.12);
      e += l * (1 - q / 2);
      l *= 1 - q;
    }
    return e;
  }

  /** Used only at initialization to compute means without running the full step. */
  private aggregateLight(i: number, age: number) {
    const A = this.A;
    const acc = this.acc;
    acc.alive++;
    acc.medianAgeHist[Math.min(100, age | 0)]++;
    acc.faith[A.faith[i]]++;
    if (age < 18) return;
    acc.adults++;
    acc.sampled++;
    acc.faithN[A.faith[i]]++; acc.faithRelig[A.faith[i]] += A.relig[i];
    acc.happy += A.happy[i]; acc.health += A.health[i]; acc.mental += A.mental[i]; acc.griev += A.griev[i]; acc.fear += A.fear[i];
    acc.itrust += A.itrust[i]; acc.strust += A.strust[i]; acc.toler += A.toler[i]; acc.social += A.social[i]; acc.econ += A.econ[i];
    acc.auth += A.auth[i]; acc.patriot += A.patriot[i]; acc.consum += A.consum[i]; acc.esteem += A.esteem[i]; acc.relig += A.relig[i];
    acc.strict += A.strict[i]; acc.social2 += A.social[i] ** 2; acc.econ2 += A.econ[i] ** 2;
    if (A.extrem[i] >= 0.7) acc.extremists++;
    if (age >= 25) { acc.edu25 += A.edu[i]; acc.n25++; }
    if (age >= 20 && age < 30) acc.youth++;
    if (A.deref(A.partner[i]) >= 0) acc.partnered++;
    if (this.isUrbanHome(i)) acc.urban++;
    if (IS_EMPLOYED[A.occ[i]] || A.occ[i] === OCC.UNEMPLOYED) acc.laborForce++;
    if (A.occ[i] === OCC.UNEMPLOYED) acc.unemployed++;
    if (A.edu[i] >= 16 && age >= 25 && age < 56) acc.aspirants++;
  }

  // ==============================================================================================
  // News, logs, inspection
  // ==============================================================================================

  addNews(text: string, cat: string, level: number) {
    this.news.push({ t: this.t, text, cat, level });
    if (this.news.length > 600) { this.news.splice(0, 100); this.newsSince = Math.max(0, this.newsSince - 100); }
  }

  log(i: number, text: string) {
    if (!(this.A.flags[i] & F.FOLLOW)) return;
    const uid = this.A.uid[i];
    let l = this.logs.get(uid);
    if (!l) { l = []; this.logs.set(uid, l); }
    l.push({ t: this.t, text });
    if (l.length > 200) l.shift();
  }

  follow(slot: number, on: boolean) {
    const A = this.A;
    if (slot < 0 || slot >= A.n) return;
    if (on) {
      A.flags[slot] |= F.FOLLOW;
      if (!this.logs.has(A.uid[slot])) {
        const age = (this.t - A.birth[slot]) / 12;
        this.logs.set(A.uid[slot], [{ t: this.t, text: `You started following ${personName(A.uid[slot], A.sex[slot])}, aged ${age.toFixed(0)}, ${OCC_NAMES[A.occ[slot]].toLowerCase()}.` }]);
      }
    } else A.flags[slot] &= ~F.FOLLOW;
  }

  person(slot: number): PersonInfo | null {
    const A = this.A;
    if (slot < 0 || slot >= A.n) return null;
    const alive = !!A.alive[slot];
    const P = this.cfg.population;
    const nm = (s: number) => personName(A.uid[s], A.sex[s]);
    const rel = (r: number) => {
      const s = A.derefAny(r);
      return s >= 0 ? { slot: s, name: nm(s), alive: !!A.alive[s] } : null;
    };
    const children: PersonInfo['children'] = [];
    const me = A.ref(slot);
    for (let i = 0; i < A.n; i++) {
      if (A.alive[i] && (A.mother[i] === me || A.father[i] === me)) children.push({ slot: i, name: nm(i), age: (this.t - A.birth[i]) / 12 });
      if (children.length > 20) break;
    }
    const friends: PersonInfo['friends'] = [];
    for (let k = 0; k < FRIEND_SLOTS; k++) {
      const j = A.deref(A.friends[slot * FRIEND_SLOTS + k]);
      if (j >= 0) friends.push({ slot: j, name: nm(j) });
    }
    const flags: string[] = [];
    if (A.flags[slot] & F.IMMIGRANT) flags.push('Immigrant');
    if (A.flags[slot] & F.CRIMINAL) flags.push('Criminal record');
    if (A.flags[slot] & F.VETERAN) flags.push('War veteran');
    if (A.flags[slot] & F.FRUSTRATED) flags.push('Frustrated graduate');
    if (A.flags[slot] & F.LEADER) flags.push('Public figure');
    if (A.protest[slot] === PROTEST.PEACEFUL) flags.push('Protesting');
    if (A.protest[slot] === PROTEST.VIOLENT) flags.push('Rioting');
    if (A.extrem[slot] >= 0.7) flags.push('Militant');
    if (A.disease[slot] === DIS.I) flags.push('Infected');
    if (this.isMinority(A.faith[slot])) flags.push('Religious minority');
    const leader = this.leaders.find((l) => l.ref === me) ?? null;
    const fg = P.faiths[A.faith[slot]];
    return {
      slot, uid: A.uid[slot], name: nm(slot), alive, age: (this.t - A.birth[slot]) / 12, sex: A.sex[slot] ? 'Male' : 'Female',
      faith: fg.name, faithColor: fg.color, occupation: OCC_NAMES[A.occ[slot]], settlement: this.world.settlements[A.home[slot]].name,
      education: A.edu[slot], incomeYear: A.income[slot] * 12, wealth: A.wealth[slot],
      traits: {
        Openness: A.O[slot] / 255, Conscientiousness: A.C[slot] / 255, Extraversion: A.E[slot] / 255, Agreeableness: A.A[slot] / 255,
        Neuroticism: A.N[slot] / 255, 'Thinking capacity': A.cog[slot] / 255, Empathy: A.emp[slot] / 255, Aggression: A.aggr[slot] / 255, Appearance: A.looks[slot] / 255,
      },
      values: {
        Religiosity: A.relig[slot], 'Literal interpretation': A.strict[slot], Tolerance: A.toler[slot], 'Social liberalism': A.social[slot],
        'Pro-market': A.econ[slot], 'Wants strong leader': A.auth[slot], Nationalism: A.patriot[slot], Consumerism: A.consum[slot],
        'Trust in institutions': A.itrust[slot], 'Trust in people': A.strust[slot], Extremism: A.extrem[slot],
      },
      state: {
        'Physical health': A.health[slot], 'Mental health': A.mental[slot], 'Life satisfaction': A.happy[slot], Mood: (A.mood[slot] + 1) / 2,
        'Self-image': (A.esteem[slot] + 1) / 2, Grievance: A.griev[slot], Fear: A.fear[slot],
      },
      partner: rel(A.partner[slot]), bond: A.bond[slot],
      parents: [rel(A.mother[slot]), rel(A.father[slot])].filter((x): x is NonNullable<typeof x> => !!x),
      children, friends, flags, log: this.logs.get(A.uid[slot]) ?? [], following: !!(A.flags[slot] & F.FOLLOW), leader,
    };
  }

  /** Fill `out` with one byte per slot for the chosen lens (0 = not drawn). */
  lensValues(id: string, out: Uint8Array) {
    const A = this.A;
    const n = A.n;
    const t = this.t;
    const q = (v: number) => 1 + Math.round(clamp01(v) * 254);
    for (let i = 0; i < n; i++) {
      if (!A.alive[i]) { out[i] = 0; continue; }
      let v = 0;
      switch (id) {
        case 'faith': v = 1 + A.faith[i]; break;
        case 'occupation': v = 1 + A.occ[i]; break;
        case 'age': v = q((t - A.birth[i]) / 12 / 90); break;
        case 'vote': v = (t - A.birth[i]) / 12 >= 18 && A.vote[i] ? A.vote[i] : 0; break;
        case 'protest': v = 1 + A.protest[i]; break;
        case 'social': v = q(A.social[i]); break;
        case 'econ': v = q(A.econ[i]); break;
        case 'auth': v = q(A.auth[i]); break;
        case 'patriot': v = q(A.patriot[i]); break;
        case 'itrust': v = q(A.itrust[i]); break;
        case 'wealth': v = q(this.pct(this.wealthQ, A.wealth[i])); break;
        case 'income': v = (t - A.birth[i]) / 12 >= 18 ? q(this.pct(this.eqIncQ, A.income[i])) : 0; break;
        case 'education': v = q(A.edu[i] / 20); break;
        case 'consum': v = q(A.consum[i]); break;
        case 'happy': v = q(A.happy[i]); break;
        case 'mood': v = q((A.mood[i] + 1) / 2); break;
        case 'health': v = q(A.health[i]); break;
        case 'mental': v = q(A.mental[i]); break;
        case 'esteem': v = q((A.esteem[i] + 1) / 2); break;
        case 'griev': v = q(A.griev[i]); break;
        case 'fear': v = q(A.fear[i]); break;
        case 'relig': v = q(A.relig[i]); break;
        case 'strict': v = q(A.strict[i]); break;
        case 'toler': v = q(A.toler[i]); break;
        case 'extrem': v = q(Math.min(1, A.extrem[i] * 1.25)); break;
        case 'empathy': v = q(A.emp[i] / 255); break;
        case 'aggression': v = q(A.aggr[i] / 255); break;
        case 'openness': v = q(A.O[i] / 255); break;
        case 'cognition': v = q(A.cog[i] / 255); break;
        case 'love': {
          const age = (t - A.birth[i]) / 12;
          if (age < 16) v = 1;
          else if (A.partner[i] === -1) v = 2;
          else if (A.deref(A.partner[i]) < 0) v = 5;
          else v = A.bond[i] > 0.7 ? 4 : 3;
          break;
        }
        case 'disease': v = 1 + A.disease[i]; break;
      }
      out[i] = v;
    }
  }

  /** Copy positions into an interleaved Float32Array [x0,y0,x1,y1,...] for slots [0, n). */
  positions(out: Float32Array) {
    const A = this.A;
    for (let i = 0; i < A.n; i++) { out[2 * i] = A.x[i]; out[2 * i + 1] = A.y[i]; }
  }

  /** Nearest living person to a world position. */
  nearest(x: number, y: number, maxDist: number): number {
    const A = this.A;
    const cx = (x / CELL) | 0, cy = (y / CELL) | 0;
    let best = -1, bd = maxDist * maxDist;
    const r = Math.ceil(maxDist / CELL);
    for (let gy = Math.max(0, cy - r); gy <= Math.min(GRID_H - 1, cy + r); gy++) {
      for (let gx = Math.max(0, cx - r); gx <= Math.min(GRID_W - 1, cx + r); gx++) {
        const c = gy * GRID_W + gx;
        for (let k = this.cellStart[c]; k < this.cellStart[c + 1]; k++) {
          const i = this.cellList[k];
          if (!A.alive[i]) continue;
          const d = (A.x[i] - x) ** 2 + (A.y[i] - y) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
      }
    }
    return best;
  }

  /** Change a policy/culture value at runtime (from the control panel). */
  // ==============================================================================================
  // Snapshots (for Monte Carlo forecasts on a representative sample)
  // ==============================================================================================

  /**
   * Export a representative sample of the society. Households are kept together (partners are
   * sampled with each other) so families, inheritance and fertility keep working in the forecast.
   */
  exportSnapshot(maxPeople: number): Snapshot {
    const A = this.A;
    const frac = Math.min(1, maxPeople / Math.max(1, A.live));
    const pick = new Uint8Array(A.n);
    const rng = new RNG((this.t * 7919 + 13) | 0);
    for (let i = 0; i < A.n; i++) {
      if (!A.alive[i] || pick[i]) continue;
      if (rng.next() < frac) {
        pick[i] = 1;
        const p = A.deref(A.partner[i]);
        if (p >= 0) pick[p] = 1;
      }
    }
    const order: number[] = [];
    for (let i = 0; i < A.n; i++) if (pick[i]) order.push(i);
    const map = new Int32Array(A.n).fill(-1);
    order.forEach((s, k) => { map[s] = k; });
    const count = order.length;
    const remap = (r: number, dead: number) => {
      if (r < 0) return r;
      const s = r >>> 8;
      if (s >= A.n || A.gen[s] !== (r & 255)) return -1;
      if (!A.alive[s]) return dead;
      return map[s] >= 0 ? map[s] * 256 : -1;
    };
    const { F32_FIELDS, U8_FIELDS, U16_FIELDS, I32_FIELDS } = AgentStore.fieldNames();
    const fields: Record<string, ArrayBufferView> = {};
    const src = A as unknown as Record<string, Float32Array | Uint8Array | Uint16Array | Int32Array>;
    const copy = <T extends Float32Array | Uint8Array | Uint16Array | Int32Array>(arr: T, make: (n: number) => T) => {
      const out = make(count);
      for (let k = 0; k < count; k++) out[k] = arr[order[k]];
      return out;
    };
    for (const f of F32_FIELDS) fields[f] = copy(src[f] as Float32Array, (k) => new Float32Array(k));
    for (const f of U8_FIELDS) fields[f] = copy(src[f] as Uint8Array, (k) => new Uint8Array(k));
    for (const f of U16_FIELDS) fields[f] = copy(src[f] as Uint16Array, (k) => new Uint16Array(k));
    for (const f of I32_FIELDS) fields[f] = copy(src[f] as Int32Array, (k) => new Int32Array(k));
    const mo = fields.mother as Int32Array, fa = fields.father as Int32Array, pa = fields.partner as Int32Array;
    for (let k = 0; k < count; k++) { mo[k] = remap(mo[k], -1); fa[k] = remap(fa[k], -1); pa[k] = remap(pa[k], -2); }
    (fields.gen as Uint8Array).fill(0);
    const friends = new Int32Array(count * FRIEND_SLOTS);
    for (let k = 0; k < count; k++) for (let q = 0; q < FRIEND_SLOTS; q++) friends[k * FRIEND_SLOTS + q] = remap(A.friends[order[k] * FRIEND_SLOTS + q], -1);
    const leaders = this.leaders.filter((l) => l.alive).map((l) => ({ ...l, ref: remap(l.ref, -1), ideology: { ...l.ideology } })).filter((l) => l.ref >= 0);
    const events = this.events.map((e) => ({
      uid: e.uid, id: e.spec.id, custom: TEMPLATE_BY_ID[e.spec.id] === e.spec ? null : stripSpec(e.spec),
      start: e.start, intensity: e.intensity, target: e.target, random: e.random, leaderId: e.leaderId,
    }));
    return {
      cfg: JSON.parse(JSON.stringify(this.cfg)), t: this.t, S: JSON.parse(JSON.stringify(this.S)),
      settlements: JSON.parse(JSON.stringify(this.world.settlements)), nCities: this.world.nCities,
      count, frac: count / Math.max(1, A.live), popScale: this.popScale * (A.live / Math.max(1, count)),
      fields, friends, leaders, events, latest: { ...this.latest }, lifeExp: this.lifeExp, tfr: this.tfr,
      nextUid: A.nextUid, majorityFaith: this.majorityFaith, eliteRatio: this.S.aspirantBase,
    };
  }

  /** Rebuild a simulation from a snapshot, with its own random seed. */
  static fromSnapshot(snap: Snapshot, seed: number): Simulation {
    const cfg = JSON.parse(JSON.stringify(snap.cfg)) as ScenarioConfig;
    cfg.society.seed = seed;
    const sim = new Simulation(cfg, { skipInit: true });
    sim.rng = new RNG(seed);
    sim.t = snap.t;
    sim.S = JSON.parse(JSON.stringify(snap.S));
    sim.world.settlements = JSON.parse(JSON.stringify(snap.settlements));
    sim.world.nCities = snap.nCities;
    sim.settlementPop = new Float64Array(sim.world.settlements.length);
    sim.settlementProtest = new Float64Array(sim.world.settlements.length);
    const A = new AgentStore(Math.ceil(snap.count * 1.3) + 2048);
    const dst = A as unknown as Record<string, Float32Array | Uint8Array | Uint16Array | Int32Array>;
    for (const [k, v] of Object.entries(snap.fields)) (dst[k] as Float32Array).set(v as Float32Array);
    A.friends.set(snap.friends);
    A.n = snap.count;
    A.live = snap.count;
    A.nextUid = snap.nextUid;
    sim.A = A;
    sim.ensureAux();
    sim.leaders = snap.leaders.map((l) => ({ ...l }));
    sim.nextLeaderId = Math.max(1, ...sim.leaders.map((l) => l.id + 1));
    sim.events = snap.events.map((e) => {
      const base = e.custom ? (e.custom as EventSpec) : TEMPLATE_BY_ID[e.id];
      const spec = base ?? TEMPLATE_BY_ID.recession;
      return { uid: e.uid, spec, start: e.start, intensity: e.intensity, target: e.target, weights: shapeWeights(spec.shape, spec.duration), random: e.random, leaderId: e.leaderId };
    });
    sim.nextEventUid = 1 + Math.max(0, ...sim.events.map((e) => e.uid));
    sim.popScale = snap.popScale;
    sim.majorityFaith = snap.majorityFaith;
    // public debt and the land base scale with the sample
    sim.S.debt *= snap.frac;
    sim.S.L0 *= snap.frac;
    sim.latest = { ...snap.latest };
    sim.lifeExp = snap.lifeExp;
    sim.tfr = snap.tfr;
    // scheduled events already fired stay fired
    for (const ev of sim.cfg.timeline) {
      const evTick = (ev.year - sim.cfg.society.startYear) * 12 + ev.month;
      if (evTick <= snap.t) ev.fired = true;
    }
    sim.rebuildGrid();
    sim.aggregateCellsOnly();
    sim.computeQuantiles(true);
    let leff = 0, emp = 0, pw = 0;
    for (let s = 0; s < A.n; s++) {
      if (IS_EMPLOYED[A.occ[s]] && A.occ[s] !== OCC.SOLDIER) { leff += sim.skill(s); emp++; }
      if (A.wealth[s] > 0) pw += A.wealth[s];
    }
    sim.lastLeff = Math.max(1, leff);
    sim.lastEmployed = Math.max(1, emp);
    sim.lastPosWealth = Math.max(1, pw);
    sim.lastTaxes = 0;
    sim.lastTransfers = 0;
    sim.collectStats(true);
    sim.latest.pop = A.live * sim.popScale;
    return sim;
  }

  setPolicy(key: string, value: number | string | boolean) {
    const S = this.S as unknown as Record<string, unknown>;
    if (key.startsWith('trend.')) {
      (this.S.trends as unknown as Record<string, number>)[key.slice(6)] = value as number;
      return;
    }
    if (key in S) S[key] = value;
    if (key === 'democracy') this.S.regimeLabel = regimeLabelFor(this.S.democracy, this.S.ruling, this.S.regimeLabel);
  }
}

// ------------------------------------------------------------------------------------------------
// helpers
// ------------------------------------------------------------------------------------------------

export interface Snapshot {
  cfg: ScenarioConfig;
  t: number;
  S: SocietyState;
  settlements: World['settlements'];
  nCities: number;
  count: number;
  frac: number;
  popScale: number;
  fields: Record<string, ArrayBufferView>;
  friends: Int32Array;
  leaders: Leader[];
  events: { uid: number; id: string; custom: Omit<EventSpec, 'likelihood'> | null; start: number; intensity: number; target: Target; random: boolean; leaderId: number }[];
  latest: Record<string, number>;
  lifeExp: number;
  tfr: number;
  nextUid: number;
  majorityFaith: number;
  eliteRatio: number;
}

/** A spec without functions, safe to post between threads. */
export function stripSpec(spec: EventSpec): Omit<EventSpec, 'likelihood'> {
  const { likelihood: _l, ...rest } = spec;
  return JSON.parse(JSON.stringify(rest));
}

interface CompiledEffect {
  target: Target;
  push: Float32Array;
  mortality: number;
  mortProfile: number;
  emigration: number;
  wealthLoss: number;
  seed: number;
  crime: number;
  urban: number;
  backlash: number;
}

function newCompiled(target: Target): CompiledEffect {
  return { target, push: new Float32Array(PUSH_DIMS.length), mortality: 0, mortProfile: 0, emigration: 0, wealthLoss: 0, seed: 0, crime: 0, urban: 0, backlash: 0 };
}

const POSITIVE_EVENTS = new Set(['nationalTriumph', 'boom', 'resourceBoom', 'independence', 'reconciliation', 'civilRights', 'democratization', 'welfareExpansion', 'healthReform', 'educationReform', 'greenRevolution', 'industrialRevolution', 'printing', 'pill', 'reformMovement', 'religiousRevival', 'landReform', 'marketReform', 'laborMigration']);

const LEADER_LABEL: Record<LeaderStyle, string> = {
  demagogue: 'fiery populist', reformer: 'liberal reformer', peacemaker: 'unifying peacemaker', spiritual: 'spiritual teacher',
  extremist: 'militant recruiter', revolutionary: 'revolutionary organizer', visionary: 'visionary inventor',
};

/** 0..1 development index from GDP per capita (log scale between $1,200 and $60,000). */
export function devIndex(gdppc: number): number {
  return clamp01((Math.log(Math.max(500, gdppc)) - Math.log(1200)) / (Math.log(60000) - Math.log(1200)));
}

/** Yearly subsistence consumption: absolute floor plus a socially defined part that grows with income. */
function subsistence(gdppc: number): number {
  return 650 + 0.22 * gdppc;
}

export function expectedHealth(age: number): number {
  return age < 30 ? 0.92 : Math.max(0.2, 0.92 - 0.0075 * (age - 30));
}

function mortProfileFactor(profile: number, age: number, male: boolean): number {
  if (profile === 1) return male && age >= 16 && age < 46 ? 3 : 0.25;
  if (profile === 2) return age < 5 ? 3 : age > 65 ? 2.2 : 0.6;
  return 1;
}

function ifrAt(profile: number, age: number): number {
  if (profile === 1) return Math.pow(10, -3.27 + 0.0524 * age) / 100; // COVID-like (Levin et al. 2020)
  if (profile === 2) return age < 2 ? 2 : age < 10 ? 0.4 : age < 18 ? 0.5 : age < 40 ? 1.6 : age < 60 ? 0.7 : 1.8; // 1918 W-shape
  return age < 5 || age > 60 ? 1.3 : 1;
}

/** Children's values drift toward their parents' (vertical cultural transmission). */
function pullToward(arr: Float32Array, i: number, m: number, fa: number, pa: number, k: number) {
  let tgt = 0;
  if (m >= 0) tgt += arr[m] * pa;
  if (fa >= 0) tgt += arr[fa] * pa;
  arr[i] += k * (tgt - arr[i]);
}

function pushV(x: number, v: number, k: number): number {
  const r = x + k * v * (v > 0 ? 1 - x : x);
  return r < 0 ? 0 : r > 1 ? 1 : r;
}

function clampX(x: number) { return clamp(x, 0.5, 1599.5); }
function clampY(y: number) { return clamp(y, 0.5, 999.5); }

function blendIdeo(a: Ideology, b: Ideology, w: number): Ideology {
  return {
    social: a.social + (b.social - a.social) * w, econ: a.econ + (b.econ - a.econ) * w, auth: a.auth + (b.auth - a.auth) * w,
    relig: a.relig + (b.relig - a.relig) * w, patriot: a.patriot + (b.patriot - a.patriot) * w,
  };
}

export function regimeLabelFor(democracy: number, r: Ideology, current?: string): string {
  if (democracy >= 0.75) return 'Liberal democracy';
  if (democracy >= 0.5) return 'Electoral democracy';
  if (democracy >= 0.3) return 'Hybrid regime';
  if (current && !/democracy|Hybrid/i.test(current)) return current;
  if (r.relig > 0.8) return 'Clerical rule';
  if (r.econ < 0.25) return 'One-party socialist state';
  if (r.patriot > 0.8) return 'Nationalist dictatorship';
  return 'Autocracy';
}

function compactInt(v: number): string {
  if (v >= 1e6) return (v / 1e6).toFixed(2) + ' million';
  if (v >= 1e3) return Math.round(v).toLocaleString('en-US');
  return String(Math.round(v));
}

/** Inverse standard normal CDF (Acklam's approximation). */
function invNormCdf(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export { describeIdeology };
