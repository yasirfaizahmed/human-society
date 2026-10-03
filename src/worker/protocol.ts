// Messages between the UI thread and the simulation worker.

import type { ScenarioConfig } from '../sim/config';
import type { ActiveEvent, Leader, NewsItem, PersonInfo, Snapshot, SocietyState } from '../sim/engine';
import type { EventSpec, LeaderSpec, ScheduledEvent, Target } from '../sim/events';
import type { ForecastRequest, ForecastResult } from '../sim/forecast';
import type { Settlement } from '../sim/world';

export type ToWorker =
  | { type: 'init'; scenario: ScenarioConfig }
  | { type: 'run'; running: boolean; speed: number }
  | { type: 'step'; months: number }
  | { type: 'lens'; id: string }
  | { type: 'select'; slot: number; uid?: number }
  | { type: 'pick'; x: number; y: number; radius: number }
  | { type: 'follow'; slot: number; on: boolean }
  | { type: 'trigger'; templateId: string; custom?: Omit<EventSpec, 'likelihood'>; intensity: number; target?: Target; leader?: LeaderSpec }
  | { type: 'schedule'; event: ScheduledEvent }
  | { type: 'unschedule'; uid: string }
  | { type: 'policy'; key: string; value: number | string | boolean }
  | { type: 'randomEvents'; on: boolean; rate: number }
  | { type: 'forecast'; request: ForecastRequest }
  | { type: 'runForecast'; snap: Snapshot; request: ForecastRequest }
  | { type: 'ack' };

export interface EventSummary {
  uid: number;
  id: string;
  name: string;
  category: string;
  progress: number;
  monthsLeft: number;
  intensity: number;
  target: string;
}

export interface FrameState {
  t: number;
  year: number;
  month: number;
  n: number;
  live: number;
  popScale: number;
  latest: Record<string, number>;
  S: Pick<SocietyState, 'democracy' | 'ruleOfLaw' | 'pressFreedom' | 'repression' | 'securityLoyalty' | 'marketFreedom' | 'taxRate' | 'progressivity' | 'welfare' | 'eduAccess' | 'healthSpend' | 'military' | 'policing' | 'genderEquality' | 'contraception' | 'minorityBias' | 'socialMedia' | 'collectivism' | 'religiousPolicy' | 'favoredFaith' | 'H' | 'legitimacy' | 'ruling' | 'regimeLabel' | 'trends' | 'politicsEndogenous' | 'parties' | 'govParties' | 'nextElection' | 'lastElection' | 'headLeader' | 'psi' | 'mmp' | 'emp' | 'sfd' | 'conflict' | 'warActive' | 'epiActive' | 'automation' | 'debtRatio' | 'protestFrac' | 'violentFrac'>;
  faithShares: number[];
  faithStats: { relig: number; griev: number; toler: number; wealth: number; extremists: number }[];
  events: EventSummary[];
  leaders: Leader[];
  occupations: number[];
  deathCauses: number[];
  settlementPop: number[];
  settlementProtest: number[];
}

export type FromWorker =
  | { type: 'ready'; settlements: Settlement[]; nCities: number; scenario: ScenarioConfig; history: Record<string, number[]>; historyT: number[] }
  | {
      type: 'frame';
      positions: Uint16Array;
      values: Uint8Array;
      state: FrameState;
      historyRows: { t: number; values: Record<string, number> }[];
      news: NewsItem[];
      pyramid?: { male: number[]; female: number[] };
      compass?: number[];
      person?: PersonInfo | null;
      perf: { msPerTick: number; ticksPerSecond: number };
      timeline: ScheduledEvent[];
    }
  | { type: 'picked'; slot: number }
  | { type: 'snapshot'; snap: Snapshot; request: ForecastRequest }
  | { type: 'forecast-progress'; done: number; total: number }
  | { type: 'forecast-result'; result: ForecastResult }
  | { type: 'error'; message: string };

export type { ActiveEvent };
