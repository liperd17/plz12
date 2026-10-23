import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getMonsterIdForSpawnRoll,
  MONSTER_IDS,
  MONSTERS,
} from '../src/monsters.ts';
import { advanceProjectile, applyDamageToHealth } from '../src/weapons.ts';

test('all three bat types have the requested speed, health, and size', () => {
  assert.deepEqual(MONSTER_IDS, ['purpleBat', 'blueBat', 'greenBat']);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(MONSTERS).map(([id, monster]) => [
        id,
        { speed: monster.speed, health: monster.health, size: monster.size },
      ]),
    ),
    {
      purpleBat: { speed: 120, health: 20, size: 32 },
      blueBat: { speed: 144, health: 10, size: 32 },
      greenBat: { speed: 60, health: 200, size: 96 },
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

test('monster spawn roll selects the requested 6:3:1 ratio', () => {
  const results = Array.from({ length: 10 }, (_, index) =>
    getMonsterIdForSpawnRoll(index + 1),
  );

  assert.equal(results.filter((id) => id === 'purpleBat').length, 6);
  assert.equal(results.filter((id) => id === 'blueBat').length, 3);
  assert.equal(results.filter((id) => id === 'greenBat').length, 1);
});

test('monster spawn roll rejects values outside the 1-10 range', () => {
  assert.throws(() => getMonsterIdForSpawnRoll(0), RangeError);
  assert.throws(() => getMonsterIdForSpawnRoll(11), RangeError);
  assert.throws(() => getMonsterIdForSpawnRoll(1.5), RangeError);
});
