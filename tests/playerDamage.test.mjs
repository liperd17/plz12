import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLAYER_INVULNERABILITY_DURATION,
  PlayerDamageState,
} from '../src/playerDamage.ts';

test('applies damage on contact and blocks repeated hits for 500ms', () => {
  const playerDamage = new PlayerDamageState();

  assert.equal(PLAYER_INVULNERABILITY_DURATION, 500);
  assert.equal(playerDamage.tryApplyDamage(100, 5, 1000), 95);
  assert.equal(playerDamage.tryApplyDamage(95, 5, 1499), undefined);
  assert.equal(playerDamage.tryApplyDamage(95, 5, 1500), 90);
});

test('shares invulnerability across all monster contacts', () => {
  const playerDamage = new PlayerDamageState();

  assert.equal(playerDamage.tryApplyDamage(100, 5, 0), 95);
  assert.equal(playerDamage.tryApplyDamage(95, 5, 250), undefined);
});

test('does not reduce health below zero', () => {
  const playerDamage = new PlayerDamageState();

  assert.equal(playerDamage.tryApplyDamage(3, 5, 0), 0);
});

test('reset clears invulnerability for a restarted game', () => {
  const playerDamage = new PlayerDamageState();

  playerDamage.tryApplyDamage(100, 5, 1000);
  playerDamage.reset();

  assert.equal(playerDamage.tryApplyDamage(95, 5, 1100), 90);
});
