import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getMonsterIdForSpawnRoll,
  getSelfDestructWarningState,
  isWithinSelfDestructRadius,
  MONSTER_IDS,
  MONSTERS,
  resolveSelfDestruct,
  SELF_DESTRUCT_BLINK_INTERVAL,
  SELF_DESTRUCT_DAMAGE,
  SELF_DESTRUCT_RADIUS,
  SELF_DESTRUCT_WARNING_DURATION,
} from '../src/monsters.ts';
import { advanceProjectile, applyDamageToHealth } from '../src/weapons.ts';

test('all four bat types have the requested grade, speed, health, and size', () => {
  assert.deepEqual(MONSTER_IDS, ['purpleBat', 'blueBat', 'greenBat', 'yellowBat']);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(MONSTERS).map(([id, monster]) => [
        id,
        {
          grade: monster.grade,
          speed: monster.speed,
          health: monster.health,
          size: monster.size,
        },
      ]),
    ),
    {
      purpleBat: { grade: 'normal', speed: 120, health: 20, size: 32 },
      blueBat: { grade: 'normal', speed: 144, health: 10, size: 32 },
      greenBat: { grade: 'elite', speed: 60, health: 200, size: 96 },
      yellowBat: { grade: 'advanced', speed: 144, health: 20, size: 32 },
    },
  );
});

test('monster speed values produce the intended movement per second', () => {
  for (const monster of Object.values(MONSTERS)) {
    const step = advanceProjectile(0, 0, monster.speed, 0, 1000, 1000);
    assert.equal(step.distance, monster.speed);
  }
});

test('blue and green bats require half and ten times the base damage to defeat', () => {
  assert.equal(applyDamageToHealth(MONSTERS.blueBat.health, 10), 0);
  assert.equal(applyDamageToHealth(MONSTERS.greenBat.health, 10), 190);
  assert.equal(applyDamageToHealth(MONSTERS.greenBat.health, 200), 0);
});

test('large green bat collision and projectile bounds use its three-times size', () => {
  assert.equal(MONSTERS.greenBat.size / MONSTERS.purpleBat.size, 3);
  assert.equal(MONSTERS.greenBat.size, 96);
});

test('monster spawn roll uses the requested normal 5, advanced 3, elite 2 ratio', () => {
  const results = Array.from({ length: 10 }, (_, index) =>
    getMonsterIdForSpawnRoll(index + 1),
  );
  const gradeCounts = results.reduce((counts, id) => {
    counts[MONSTERS[id].grade] += 1;
    return counts;
  }, { normal: 0, advanced: 0, elite: 0 });

  assert.deepEqual(gradeCounts, { normal: 5, advanced: 3, elite: 2 });
  assert.equal(results.filter((id) => id === 'purpleBat').length, 3);
  assert.equal(results.filter((id) => id === 'blueBat').length, 2);
  assert.equal(results.filter((id) => id === 'yellowBat').length, 3);
  assert.equal(results.filter((id) => id === 'greenBat').length, 2);
});

test('monster spawn roll rejects values outside the 1-10 range', () => {
  assert.throws(() => getMonsterIdForSpawnRoll(0), RangeError);
  assert.throws(() => getMonsterIdForSpawnRoll(11), RangeError);
  assert.throws(() => getMonsterIdForSpawnRoll(1.5), RangeError);
});

test('yellow bat self-destruct warning blinks every 300ms and detonates at 2 seconds', () => {
  assert.equal(SELF_DESTRUCT_BLINK_INTERVAL, 300);
  assert.equal(SELF_DESTRUCT_WARNING_DURATION, 2000);
  assert.equal(getSelfDestructWarningState(0), 'warning-on');
  assert.equal(getSelfDestructWarningState(299), 'warning-on');
  assert.equal(getSelfDestructWarningState(300), 'warning-off');
  assert.equal(getSelfDestructWarningState(600), 'warning-on');
  assert.equal(getSelfDestructWarningState(1999), 'warning-on');
  assert.equal(getSelfDestructWarningState(2000), 'detonate');
});

test('yellow bat self-destruct damages only within 150px and grants no experience', () => {
  assert.equal(SELF_DESTRUCT_RADIUS, 150);
  assert.equal(SELF_DESTRUCT_DAMAGE, 20);
  assert.equal(isWithinSelfDestructRadius(150), true);
  assert.equal(isWithinSelfDestructRadius(150.01), false);
  assert.deepEqual(resolveSelfDestruct(150), {
    playerDamage: 20,
    experienceReward: 0,
  });
  assert.deepEqual(resolveSelfDestruct(151), {
    playerDamage: 0,
    experienceReward: 0,
  });
});
