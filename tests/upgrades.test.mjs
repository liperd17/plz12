import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyMaxHealthUpgrade,
  createStatUpgradeLevels,
  getAttackIntervalSeconds,
  getStatMultiplier,
  rollUpgradeChoiceKinds,
  STAT_UPGRADE_IDS,
  STAT_UPGRADE_INCREASE,
  WEAPON_UPGRADE_CHANCE,
} from '../src/upgrades.ts';

test('stat upgrades add five percent of the base stat per upgrade', () => {
  assert.equal(STAT_UPGRADE_INCREASE, 0.05);
  assert.equal(getStatMultiplier(0), 1);
  assert.equal(getStatMultiplier(1), 1.05);
  assert.equal(getStatMultiplier(4), 1.2);
  assert.equal(getAttackIntervalSeconds(1.5, 4), 1.25);
});

test('max health upgrades increase current and maximum health by five base health', () => {
  assert.deepEqual(applyMaxHealthUpgrade(50, 100, 0), {
    currentHealth: 55,
    maxHealth: 105,
  });
  assert.deepEqual(applyMaxHealthUpgrade(90, 100, 3), {
    currentHealth: 95,
    maxHealth: 120,
  });
});

test('the stat reward pool contains all five requested stats at level zero', () => {
  assert.deepEqual(STAT_UPGRADE_IDS, [
    'movementSpeed',
    'range',
    'attackSpeed',
    'maxHealth',
    'damage',
  ]);
  assert.deepEqual(createStatUpgradeLevels(), {
    movementSpeed: 0,
    range: 0,
    attackSpeed: 0,
    maxHealth: 0,
    damage: 0,
  });
});

test('each reward slot independently uses a 60 percent weapon and 40 percent stat split', () => {
  assert.equal(WEAPON_UPGRADE_CHANCE, 0.6);
  assert.deepEqual(
    rollUpgradeChoiceKinds([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]),
    ['weapon', 'weapon', 'weapon', 'weapon', 'weapon', 'weapon', 'stat', 'stat', 'stat', 'stat'],
  );
});

test('upgrade reward rolls reject values outside the random roll range', () => {
  assert.throws(() => rollUpgradeChoiceKinds([-0.01]), RangeError);
  assert.throws(() => rollUpgradeChoiceKinds([1]), RangeError);
  assert.throws(() => rollUpgradeChoiceKinds([Number.NaN]), RangeError);
});
