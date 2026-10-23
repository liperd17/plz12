export type WeaponId = 'basicAttack' | 'rapidAttackA' | 'slashAttack';
export type WeaponAttackAttribute = 'standard' | 'piercing' | 'slash';

type WeaponDefinition = {
  name: string;
  baseDamage: number;
  attackIntervalSeconds: number;
  burstShotIntervalMs: number;
  projectilesPerAttack: number;
  bonusProjectilesAtLevel: number;
  attackWidthPx: number;
  projectileSpeedPxPerSecond: number;
  effectiveRangePx: number;
  bonusRangePx: number;
  spreadCount: number;
  spreadAngleDegrees: number;
  bounceCount: number;
  attackMode: 'projectile' | 'line';
  attackAttribute: WeaponAttackAttribute;
  damageIncreasePerUpgrade: number;
};

export const WEAPON_IDS: WeaponId[] = [
  'basicAttack',
  'rapidAttackA',
  'slashAttack',
];

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  basicAttack: {
    name: '기본공격',
    baseDamage: 10,
    attackIntervalSeconds: 0.75,
    burstShotIntervalMs: 0,
    projectilesPerAttack: 1,
    bonusProjectilesAtLevel: 0,
    attackWidthPx: 1,
    projectileSpeedPxPerSecond: 300,
    effectiveRangePx: 400,
    bonusRangePx: 0,
    spreadCount: 1,
    spreadAngleDegrees: 0,
    bounceCount: 0,
    attackMode: 'projectile',
    attackAttribute: 'standard',
    damageIncreasePerUpgrade: 0.05,
  },
  rapidAttackA: {
    name: '연사공격A',
    baseDamage: 4,
    attackIntervalSeconds: 1.5,
    burstShotIntervalMs: 100,
    projectilesPerAttack: 3,
    bonusProjectilesAtLevel: 1,
    attackWidthPx: 1,
    projectileSpeedPxPerSecond: 500,
    effectiveRangePx: 400,
    bonusRangePx: 0,
    spreadCount: 1,
    spreadAngleDegrees: 0,
    bounceCount: 0,
    attackMode: 'projectile',
    attackAttribute: 'piercing',
    damageIncreasePerUpgrade: 0.05,
  },
  slashAttack: {
    name: '참격공격',
    baseDamage: 20,
    attackIntervalSeconds: 0.3,
    burstShotIntervalMs: 0,
    projectilesPerAttack: 1,
    bonusProjectilesAtLevel: 0,
    attackWidthPx: 50,
    projectileSpeedPxPerSecond: 0,
    effectiveRangePx: 100,
    bonusRangePx: 30,
    spreadCount: 1,
    spreadAngleDegrees: 0,
    bounceCount: 0,
    attackMode: 'line',
    attackAttribute: 'slash',
    damageIncreasePerUpgrade: 0.1,
  },
};

export function getWeaponDamage(weaponId: WeaponId, upgradeCount: number) {
  const weapon = WEAPONS[weaponId];
  return weapon.baseDamage * (1 + weapon.damageIncreasePerUpgrade * upgradeCount);
}

export function getWeaponProjectileCount(weaponId: WeaponId, weaponLevel: number) {
  const weapon = WEAPONS[weaponId];
  const bonusProjectiles = weaponLevel >= 5 ? weapon.bonusProjectilesAtLevel : 0;
  return (weapon.projectilesPerAttack + bonusProjectiles) * weapon.spreadCount;
}

export function getWeaponEffectiveRange(weaponId: WeaponId, weaponLevel: number) {
  const weapon = WEAPONS[weaponId];
  return weapon.effectiveRangePx + (weaponLevel >= 5 ? weapon.bonusRangePx : 0);
}

export function getWeaponBonusDescription(weaponId: WeaponId) {
  const weapon = WEAPONS[weaponId];
  if (weapon.bonusProjectilesAtLevel > 0) {
    return `5회 강화 특전: 탄 개수 +${weapon.bonusProjectilesAtLevel}`;
  }
  if (weapon.bonusRangePx > 0) {
    return `5회 강화 특전: 공격 범위 +${weapon.bonusRangePx}`;
  }
  return undefined;
}

export function willUnlockWeaponBonusAtNextLevel(
  weaponId: WeaponId,
  currentLevel: number,
) {
  return currentLevel === 4 && getWeaponBonusDescription(weaponId) !== undefined;
}

export function applyDamageToHealth(currentHealth: number, damage: number) {
  return Math.max(0, currentHealth - damage);
}

export type WeaponProjectile = {
  velocityX: number;
  velocityY: number;
  damage: number;
  range: number;
  hasPiercingAttribute: boolean;
};

export type ProjectileStep = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  distance: number;
  remainingRange: number;
  expired: boolean;
};

export type ProjectileTargetBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WeaponProjectileShot = {
  delayMs: number;
};

export function consumeProjectileOnHit(projectile: { active: boolean }) {
  if (!projectile.active) {
    return false;
  }

  projectile.active = false;
  return true;
}

export function getProjectileVelocity(
  weaponId: WeaponId,
  playerX: number,
  playerY: number,
  targetX: number,
  targetY: number,
) {
  const speed = WEAPONS[weaponId].projectileSpeedPxPerSecond;
  const directionX = targetX - playerX;
  const directionY = targetY - playerY;
  const distance = Math.hypot(directionX, directionY);

  if (speed <= 0 || distance === 0) {
    return undefined;
  }

  return {
    velocityX: directionX / distance * speed,
    velocityY: directionY / distance * speed,
  };
}

export function createProjectileBurst(
  weaponId: WeaponId,
  weaponLevel: number,
) {
  const weapon = WEAPONS[weaponId];
  if (weapon.attackMode !== 'projectile') {
    return [];
  }

  const projectileCount = getWeaponProjectileCount(weaponId, weaponLevel);
  return Array.from(
    { length: projectileCount },
    (_, index): WeaponProjectileShot => ({
      delayMs: index * weapon.burstShotIntervalMs,
    }),
  );
}

export function createProjectileShot(
  weaponId: WeaponId,
  playerX: number,
  playerY: number,
  targetX: number,
  targetY: number,
  weaponLevel: number,
  rangeMultiplier = 1,
): WeaponProjectile | undefined {
  const weapon = WEAPONS[weaponId];
  if (weapon.attackMode !== 'projectile') {
    return undefined;
  }

  const directionX = targetX - playerX;
  const directionY = targetY - playerY;
  const distance = Math.hypot(directionX, directionY);
  const effectiveRange = getWeaponEffectiveRange(weaponId, weaponLevel) * rangeMultiplier;
  if (distance === 0 || distance > effectiveRange) {
    return undefined;
  }

  const velocity = getProjectileVelocity(
    weaponId,
    playerX,
    playerY,
    targetX,
    targetY,
  );
  if (!velocity) {
    return undefined;
  }

  return {
    ...velocity,
    damage: getWeaponDamage(weaponId, Math.max(0, weaponLevel - 1)),
    range: effectiveRange,
    hasPiercingAttribute: weapon.attackAttribute === 'piercing',
  };
}

export function advanceProjectile(
  x: number,
  y: number,
  velocityX: number,
  velocityY: number,
  deltaMs: number,
  remainingRange: number,
): ProjectileStep {
  const frameDistance = Math.hypot(velocityX, velocityY) * Math.max(0, deltaMs) / 1000;
  const distance = Math.min(frameDistance, remainingRange);
  const speed = Math.hypot(velocityX, velocityY);
  const ratio = speed === 0 ? 0 : distance / speed;

  return {
    startX: x,
    startY: y,
    endX: x + velocityX * ratio,
    endY: y + velocityY * ratio,
    distance,
    remainingRange: Math.max(0, remainingRange - distance),
    expired: remainingRange <= frameDistance,
  };
}

export function findFirstProjectileHit(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  targets: readonly ProjectileTargetBounds[],
  projectileRadius: number,
) {
  let firstHitIndex: number | undefined;
  let firstHitProgress = Number.POSITIVE_INFINITY;

  for (const [index, target] of targets.entries()) {
    let minimum = 0;
    let maximum = 1;
    const axes = [
      {
        start: startX,
        delta: endX - startX,
        min: target.x - target.width / 2 - projectileRadius,
        max: target.x + target.width / 2 + projectileRadius,
      },
      {
        start: startY,
        delta: endY - startY,
        min: target.y - target.height / 2 - projectileRadius,
        max: target.y + target.height / 2 + projectileRadius,
      },
    ];

    for (const axis of axes) {
      if (axis.delta === 0) {
        if (axis.start < axis.min || axis.start > axis.max) {
          maximum = -1;
          break;
        }
        continue;
      }

      const first = (axis.min - axis.start) / axis.delta;
      const second = (axis.max - axis.start) / axis.delta;
      minimum = Math.max(minimum, Math.min(first, second));
      maximum = Math.min(maximum, Math.max(first, second));
      if (minimum > maximum) {
        break;
      }
    }

    if (
      maximum >= 0
      && minimum <= 1
      && minimum <= maximum
      && minimum < firstHitProgress
    ) {
      firstHitIndex = index;
      firstHitProgress = minimum;
    }
  }

  return firstHitIndex;
}

export function isWithinAttackLine(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  pointX: number,
  pointY: number,
  width: number,
) {
  const lineX = endX - startX;
  const lineY = endY - startY;
  const lengthSquared = lineX * lineX + lineY * lineY;
  if (lengthSquared === 0) {
    return false;
  }

  const pointOffsetX = pointX - startX;
  const pointOffsetY = pointY - startY;
  const projection = (pointOffsetX * lineX + pointOffsetY * lineY) / lengthSquared;
  if (projection < 0 || projection > 1) {
    return false;
  }

  const closestX = startX + projection * lineX;
  const closestY = startY + projection * lineY;
  const distanceX = pointX - closestX;
  const distanceY = pointY - closestY;
  return distanceX * distanceX + distanceY * distanceY <= (width / 2) ** 2;
}
