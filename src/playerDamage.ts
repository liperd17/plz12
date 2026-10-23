export const PLAYER_INVULNERABILITY_DURATION = 500;

export class PlayerDamageState {
  private invulnerableUntil = 0;

  reset() {
    this.invulnerableUntil = 0;
  }

  tryApplyDamage(currentHealth: number, damage: number, now: number) {
    if (now < this.invulnerableUntil) {
      return undefined;
    }

    this.invulnerableUntil = now + PLAYER_INVULNERABILITY_DURATION;
    return Math.max(0, currentHealth - damage);
  }
}
