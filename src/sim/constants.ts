// Shared enums and constants for the simulation.

export const TICKS_PER_YEAR = 12; // one tick = one month

/** Occupations / life roles. */
export const OCC = {
  CHILD: 0,
  STUDENT: 1,
  UNEMPLOYED: 2,
  LABORER: 3,
  SKILLED: 4,
  PROFESSIONAL: 5,
  OWNER: 6,
  ELITE: 7,
  RETIRED: 8,
  HOMEMAKER: 9,
  SOLDIER: 10,
  PRISONER: 11,
} as const;

export const OCC_NAMES = [
  'Child', 'Student', 'Unemployed', 'Manual worker', 'Skilled worker', 'Professional',
  'Business owner', 'Elite (officials & executives)', 'Retired', 'Homemaker', 'Soldier', 'Prisoner',
];

/** Wage multiplier relative to the average wage. Owners and elites also earn capital income. */
export const WAGE_MULT = [0, 0, 0, 0.6, 1.0, 1.85, 1.3, 4.5, 0, 0, 0.95, 0];

/** Bit flags. */
export const F = {
  CRIMINAL: 1,
  IMMIGRANT: 2,
  LEADER: 4,
  FOLLOW: 8,
  CLAIM_M: 16,
  CLAIM_F: 32,
  VETERAN: 64,
  FRUSTRATED: 128,
} as const;

/** Disease state. */
export const DIS = { S: 0, I: 1, R: 2 } as const;

/** Protest state. */
export const PROTEST = { NONE: 0, PEACEFUL: 1, VIOLENT: 2 } as const;

/** Causes of death (for statistics). */
export const DEATH = {
  NATURAL: 0, CHILD: 1, EPIDEMIC: 2, WAR: 3, VIOLENCE: 4, REPRESSION: 5, SUICIDE: 6, DISASTER: 7, FAMINE: 8,
} as const;
export const DEATH_NAMES = ['Natural causes', 'Childhood illness', 'Epidemic', 'War', 'Crime & violence', 'State repression', 'Suicide', 'Disaster', 'Famine'];

/** World geometry (abstract units). */
export const WORLD_W = 1600;
export const WORLD_H = 1000;
export const CELL = 10;
export const GRID_W = WORLD_W / CELL;
export const GRID_H = WORLD_H / CELL;
export const NCELLS = GRID_W * GRID_H;

export const MAX_FAITHS = 8;
export const FRIEND_SLOTS = 4;
