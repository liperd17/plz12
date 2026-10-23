export type CharacterId = 'green' | 'red';

type CharacterDefinition = {
  name: string;
  color: number;
  movementSpeedMultiplier: number;
  effectiveRangeMultiplier: number;
};

export const CHARACTERS: Record<CharacterId, CharacterDefinition> = {
  green: {
    name: '초록 모험가',
    color: 0x4ade80,
    movementSpeedMultiplier: 1,
    effectiveRangeMultiplier: 1,
  },
  red: {
    name: '빨간 모험가',
    color: 0xef4444,
    movementSpeedMultiplier: 1.3,
    effectiveRangeMultiplier: 0.5,
  },
};

export function getCharacterEffectiveRange(baseRange: number, characterId: CharacterId) {
  return baseRange * CHARACTERS[characterId].effectiveRangeMultiplier;
}
