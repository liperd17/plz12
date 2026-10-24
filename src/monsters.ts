export type MonsterId = 'purpleBat' | 'blueBat' | 'greenBat' | 'yellowBat';
export type MonsterGrade = 'normal' | 'advanced' | 'elite';

export const SELF_DESTRUCT_RADIUS = 150;
export const SELF_DESTRUCT_WARNING_DURATION = 2000;
export const SELF_DESTRUCT_BLINK_INTERVAL = 300;
export const SELF_DESTRUCT_DAMAGE = 20;

export type SelfDestructWarningState = 'warning-on' | 'warning-off' | 'detonate';

export type MonsterDefinition = {
  name: string;
  grade: MonsterGrade;
  texture: string;
  size: number;
  speed: number;
  health: number;
  color: number;
};

export const MONSTERS: Record<MonsterId, MonsterDefinition> = {
  purpleBat: {
    name: '빨간 박쥐',
    grade: 'normal',
    texture: 'enemy-bat',
    size: 32,
    speed: 120,
    health: 20,
    color: 0xb44762,
  },
  blueBat: {
    name: '파란 박쥐',
    grade: 'normal',
    texture: 'enemy-blue-bat',
    size: 32,
    speed: 144,
    health: 10,
    color: 0x3b82f6,
  },
  greenBat: {
    name: '녹색 박쥐',
    grade: 'elite',
    texture: 'enemy-green-bat',
    size: 96,
    speed: 60,
    health: 200,
    color: 0x22c55e,
  },
  yellowBat: {
    name: '노란 박쥐',
    grade: 'advanced',
    texture: 'enemy-yellow-bat',
    size: 32,
    speed: 144,
    health: 20,
    color: 0xfacc15,
  },
};

export const MONSTER_IDS = Object.keys(MONSTERS) as MonsterId[];

export function isMonsterId(value: unknown): value is MonsterId {
  return typeof value === 'string' && Object.hasOwn(MONSTERS, value);
}

export function getMonsterIdForSpawnRoll(roll: number): MonsterId {
  if (!Number.isInteger(roll) || roll < 1 || roll > 10) {
    throw new RangeError('Monster spawn roll must be an integer from 1 to 10.');
  }

  if (roll <= 3) {
    return 'purpleBat';
  }
  if (roll <= 5) {
    return 'blueBat';
  }
  if (roll <= 8) {
    return 'yellowBat';
  }
  return 'greenBat';
}

export function isWithinSelfDestructRadius(distance: number) {
  return Number.isFinite(distance) && distance >= 0 && distance <= SELF_DESTRUCT_RADIUS;
}

export function getSelfDestructWarningState(elapsedMs: number): SelfDestructWarningState {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError('Self-destruct elapsed time must be a non-negative finite number.');
  }
  if (elapsedMs >= SELF_DESTRUCT_WARNING_DURATION) {
    return 'detonate';
  }
  return Math.floor(elapsedMs / SELF_DESTRUCT_BLINK_INTERVAL) % 2 === 0
    ? 'warning-on'
    : 'warning-off';
}

export function resolveSelfDestruct(distance: number) {
  return {
    playerDamage: isWithinSelfDestructRadius(distance) ? SELF_DESTRUCT_DAMAGE : 0,
    experienceReward: 0,
  };
}
