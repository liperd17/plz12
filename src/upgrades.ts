export type StatUpgradeId =
  | 'movementSpeed'
  | 'range'
  | 'attackSpeed'
  | 'maxHealth'
  | 'damage';

export type UpgradeChoiceKind = 'weapon' | 'stat';

export type StatUpgradeDefinition = {
  name: string;
  description: string;
};

export const STAT_UPGRADE_INCREASE = 0.05;
export const WEAPON_UPGRADE_CHANCE = 0.6;

export const STAT_UPGRADES: Record<StatUpgradeId, StatUpgradeDefinition> = {
  movementSpeed: {
    name: '이동 속도',
    description: '플레이어 이동 속도',
  },
  range: {
    name: '공격 사거리',
    description: '모든 무기의 공격 사거리',
  },
  attackSpeed: {
    name: '공격 속도',
    description: '모든 무기의 공격 속도',
  },
  maxHealth: {
    name: '최대 체력',
    description: '플레이어 최대 체력',
  },
  damage: {
    name: '피해량',
    description: '모든 무기의 피해량',
  },
};

export const STAT_UPGRADE_IDS = Object.keys(STAT_UPGRADES) as StatUpgradeId[];

export function createStatUpgradeLevels(): Record<StatUpgradeId, number> {
  return {
    movementSpeed: 0,
    range: 0,
    attackSpeed: 0,
    maxHealth: 0,
    damage: 0,
  };
}

export function getStatMultiplier(upgradeCount: number) {
  if (!Number.isInteger(upgradeCount) || upgradeCount < 0) {
    throw new RangeError('Stat upgrade count must be a non-negative integer.');
  }
  return 1 + STAT_UPGRADE_INCREASE * upgradeCount;
}

export function getAttackIntervalSeconds(baseIntervalSeconds: number, upgradeCount: number) {
  if (!Number.isFinite(baseIntervalSeconds) || baseIntervalSeconds <= 0) {
    throw new RangeError('Base attack interval must be a positive finite number.');
  }
  return baseIntervalSeconds / getStatMultiplier(upgradeCount);
}

export function applyMaxHealthUpgrade(
  currentHealth: number,
  baseMaxHealth: number,
  currentUpgradeCount: number,
) {
  if (
    !Number.isFinite(currentHealth)
    || currentHealth < 0
    || !Number.isFinite(baseMaxHealth)
    || baseMaxHealth <= 0
  ) {
    throw new RangeError('Health values must be finite and non-negative with a positive maximum.');
  }
  const previousMaxHealth = Number(
    (baseMaxHealth * getStatMultiplier(currentUpgradeCount)).toFixed(10),
  );
  const maxHealth = Number(
    (baseMaxHealth * getStatMultiplier(currentUpgradeCount + 1)).toFixed(10),
  );
  return {
    currentHealth: Number(
      Math.min(maxHealth, currentHealth + maxHealth - previousMaxHealth).toFixed(10),
    ),
    maxHealth,
  };
}

export function rollUpgradeChoiceKinds(rolls: readonly number[]): UpgradeChoiceKind[] {
  return rolls.map((roll) => {
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
      throw new RangeError('Upgrade choice roll must be a finite number from 0 up to 1.');
    }
    return roll < WEAPON_UPGRADE_CHANCE ? 'weapon' : 'stat';
  });
}
