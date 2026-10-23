import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDamageToHealth,
  advanceProjectile,
  createProjectileBurst,
  createProjectileShot,
  consumeProjectileOnHit,
  getWeaponBonusDescription,
  getWeaponEffectiveRange,
  getWeaponProjectileCount,
  getProjectileVelocity,
  getWeaponDamage,
  findFirstProjectileHit,
  isWithinAttackLine,
  willUnlockWeaponBonusAtNextLevel,
  WEAPONS,
} from '../src/weapons.ts';

test('loads the weapon stats from the workbook', () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(WEAPONS).map(([id, weapon]) => [
        id,
        {
          damage: weapon.baseDamage,
          interval: weapon.attackIntervalSeconds,
          burstShotInterval: weapon.burstShotIntervalMs,
          projectiles: weapon.projectilesPerAttack,
          speed: weapon.projectileSpeedPxPerSecond,
          range: weapon.effectiveRangePx,
        },
      ]),
    ),
    {
      basicAttack: {
        damage: 10,
        interval: 0.75,
        burstShotInterval: 0,
        projectiles: 1,
        speed: 300,
        range: 400,
      },
      rapidAttackA: {
        damage: 4,
        interval: 1.5,
        burstShotInterval: 100,
        projectiles: 3,
        speed: 500,
        range: 400,
      },
      slashAttack: {
        damage: 20,
        interval: 0.3,
        burstShotInterval: 0,
        projectiles: 1,
        speed: 0,
        range: 100,
      },
    },
  );
});

test('weapon upgrades increase base damage additively by the configured rate', () => {
  assert.equal(getWeaponDamage('basicAttack', 2), 11);
  assert.equal(getWeaponDamage('rapidAttackA', 2), 4.4);
  assert.equal(getWeaponDamage('slashAttack', 2), 24);
});

test('weapon damage reduces monster health and cannot go below zero', () => {
  assert.equal(applyDamageToHealth(20, getWeaponDamage('basicAttack', 0)), 10);
  assert.equal(applyDamageToHealth(10, getWeaponDamage('basicAttack', 0)), 0);
  assert.equal(applyDamageToHealth(20, getWeaponDamage('slashAttack', 0)), 0);
});

test('rapid fire retains its piercing weapon attribute and slash uses a 50px wide line', () => {
  assert.equal(WEAPONS.rapidAttackA.attackAttribute, 'piercing');
  assert.equal(WEAPONS.slashAttack.attackMode, 'line');
  assert.equal(WEAPONS.slashAttack.attackWidthPx, 50);
});

test('level 5 bonuses update projectile count and slash range', () => {
  assert.equal(getWeaponProjectileCount('rapidAttackA', 4), 3);
  assert.equal(getWeaponProjectileCount('rapidAttackA', 5), 4);
  assert.equal(getWeaponEffectiveRange('slashAttack', 4), 100);
  assert.equal(getWeaponEffectiveRange('slashAttack', 5), 130);
  assert.equal(getWeaponBonusDescription('rapidAttackA'), '5회 강화 특전: 탄 개수 +1');
  assert.equal(getWeaponBonusDescription('slashAttack'), '5회 강화 특전: 공격 범위 +30');
  assert.equal(getWeaponBonusDescription('basicAttack'), undefined);
});

test('only weapon choices that unlock a bonus at level 5 are highlighted', () => {
  assert.equal(willUnlockWeaponBonusAtNextLevel('rapidAttackA', 3), false);
  assert.equal(willUnlockWeaponBonusAtNextLevel('rapidAttackA', 4), true);
  assert.equal(willUnlockWeaponBonusAtNextLevel('slashAttack', 4), true);
  assert.equal(willUnlockWeaponBonusAtNextLevel('basicAttack', 4), false);
});

test('basic and rapid fire schedule independent projectile counts and burst timings', () => {
  const basicBurst = createProjectileBurst('basicAttack', 1);
  const rapidBurst = createProjectileBurst('rapidAttackA', 2);

  assert.deepEqual(basicBurst, [{ delayMs: 0 }]);
  assert.deepEqual(
    rapidBurst.map((shot) => shot.delayMs),
    [0, 100, 200],
  );
});

test('level 5 rapid fire volley contains the bonus fourth shot', () => {
  const burst = createProjectileBurst('rapidAttackA', 5);

  assert.equal(burst.length, 4);
  assert.deepEqual(
    burst.map((shot) => shot.delayMs),
    [0, 100, 200, 300],
  );
});

test('projectile direction is based on positions at the moment each shot launches', () => {
  const firstShot = createProjectileShot('rapidAttackA', 0, 0, 120, 160, 2);
  const secondShot = createProjectileShot('rapidAttackA', 0, 0, 0, 200, 2);

  assert.deepEqual(
    { velocityX: firstShot?.velocityX, velocityY: firstShot?.velocityY },
    { velocityX: 300, velocityY: 400 },
  );
  assert.deepEqual(
    { velocityX: secondShot?.velocityX, velocityY: secondShot?.velocityY },
    { velocityX: 0, velocityY: 500 },
  );
  assert.equal(firstShot?.damage, 4.2);
  assert.equal(firstShot?.range, 400);
  assert.equal(firstShot?.hasPiercingAttribute, true);
});

test('projectiles move by frame delta and stop exactly at their range', () => {
  assert.deepEqual(
    advanceProjectile(0, 0, 300, 400, 100, 200),
    {
      startX: 0,
      startY: 0,
      endX: 30,
      endY: 40,
      distance: 50,
      remainingRange: 150,
      expired: false,
    },
  );
  assert.deepEqual(
    advanceProjectile(0, 0, 300, 400, 1000, 75),
    {
      startX: 0,
      startY: 0,
      endX: 45,
      endY: 60,
      distance: 75,
      remainingRange: 0,
      expired: true,
    },
  );
});

test('swept collision detects enemies crossed during a long frame and picks the first hit', () => {
  const targets = [
    { x: 80, y: 0, width: 32, height: 32 },
    { x: 40, y: 0, width: 32, height: 32 },
  ];

  assert.equal(findFirstProjectileHit(0, 0, 100, 0, targets, 5), 1);
  assert.equal(findFirstProjectileHit(0, 50, 100, 50, targets, 5), undefined);
});

test('each projectile is consumed on its first hit regardless of weapon attribute', () => {
  const projectile = { active: true };

  assert.equal(consumeProjectileOnHit(projectile), true);
  assert.equal(projectile.active, false);
  assert.equal(consumeProjectileOnHit(projectile), false);
  assert.equal(WEAPONS.rapidAttackA.attackAttribute, 'piercing');
});

test('projectile direction is calculated once from the target position at firing time', () => {
  const firingVelocity = getProjectileVelocity('rapidAttackA', 0, 0, 300, 400);

  assert.deepEqual(firingVelocity, { velocityX: 300, velocityY: 400 });
  assert.equal(getProjectileVelocity('rapidAttackA', 0, 0, 0, 500)?.velocityX, 0);
  assert.equal(firingVelocity?.velocityX, 300);
  assert.equal(firingVelocity?.velocityY, 400);
});

test('projectile firing is rejected when no target is in range or direction is undefined', () => {
  assert.equal(createProjectileShot('rapidAttackA', 0, 0, 401, 0, 1), undefined);
  assert.equal(createProjectileShot('rapidAttackA', 20, 20, 20, 20, 0), undefined);
  assert.equal(createProjectileShot('slashAttack', 0, 0, 50, 0, 0), undefined);
});

test('basic and rapid projectile ranges match the updated workbook', () => {
  assert.equal(createProjectileShot('basicAttack', 0, 0, 400, 0, 1)?.range, 400);
  assert.equal(createProjectileShot('basicAttack', 0, 0, 401, 0, 1), undefined);
  assert.equal(createProjectileShot('rapidAttackA', 0, 0, 400, 0, 1)?.range, 400);
  assert.equal(createProjectileShot('rapidAttackA', 0, 0, 401, 0, 1), undefined);
});

test('slash line hits points within its width and length only', () => {
  assert.equal(isWithinAttackLine(0, 0, 100, 0, 50, 25, 50), true);
  assert.equal(isWithinAttackLine(0, 0, 100, 0, 50, 26, 50), false);
  assert.equal(isWithinAttackLine(0, 0, 100, 0, 101, 0, 50), false);
  assert.equal(isWithinAttackLine(0, 0, 100, 0, -1, 0, 50), false);
});
