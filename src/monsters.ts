export type MonsterId = 'purpleBat' | 'blueBat' | 'greenBat';

export type MonsterDefinition = {
  name: string;
  texture: string;
  size: number;
  speed: number;
  health: number;
  color: number;
};

export const MONSTERS: Record<MonsterId, MonsterDefinition> = {
  purpleBat: {
    name: '보라 박쥐',
    texture: 'enemy-bat',
    size: 32,
    speed: 120,
    health: 20,
    color: 0xb44762,
  },
  blueBat: {
    name: '파란 박쥐',
    texture: 'enemy-blue-bat',
    size: 32,
    speed: 144,
    health: 10,
    color: 0x3b82f6,
  },
  greenBat: {
    name: '녹색 박쥐',
    texture: 'enemy-green-bat',
    size: 96,
    speed: 60,
    health: 200,
    color: 0x22c55e,
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

  if (roll <= 6) {
    return 'purpleBat';
  }
  if (roll <= 9) {
    return 'blueBat';
  }
  return 'greenBat';
}
