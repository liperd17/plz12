import assert from 'node:assert/strict';
import test from 'node:test';
import { CHARACTERS, getCharacterEffectiveRange } from '../src/characters.ts';
import { createProjectileShot, getWeaponEffectiveRange } from '../src/weapons.ts';

test('red adventurer moves 30% faster and has half the effective attack range', () => {
  assert.equal(CHARACTERS.green.movementSpeedMultiplier, 1);
  assert.equal(CHARACTERS.red.movementSpeedMultiplier, 1.3);
  assert.equal(CHARACTERS.green.effectiveRangeMultiplier, 1);
  assert.equal(CHARACTERS.red.effectiveRangeMultiplier, 0.5);
});

test('character range multiplier applies to all weapon ranges and level bonuses', () => {
  for (const weaponId of ['basicAttack', 'rapidAttackA', 'slashAttack']) {
    for (const weaponLevel of [1, 5]) {
      const baseRange = getWeaponEffectiveRange(weaponId, weaponLevel);
      assert.equal(getCharacterEffectiveRange(baseRange, 'green'), baseRange);
      assert.equal(getCharacterEffectiveRange(baseRange, 'red'), baseRange * 0.5);
    }
  }
});

test('red adventurer projectiles stop at half the base range', () => {
  const shot = createProjectileShot('basicAttack', 0, 0, 200, 0, 1, 0.5);

  assert.equal(shot?.range, 200);
  assert.equal(createProjectileShot('basicAttack', 0, 0, 201, 0, 1, 0.5), undefined);
});
