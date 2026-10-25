// Datos de prueba compartidos. Copia de config/ para que los tests del engine no dependan de I/O.
import * as fc from 'fast-check';
import type { GameConfig } from '../schemas.js';
import type { Ability, DiceTable, GameSymbol, Monster, SecretQuest, Slot } from '../types.js';

export const SYMBOLS: readonly GameSymbol[] = ['Horn', 'Wing', 'Claw', 'Tail'];
export const VALID_SLOTS: readonly Slot[] = ['Horn', 'Wing', 'Claw', 'Tail', 'all', 'damage'];

export const DICE: DiceTable = {
  red: ['Claw', 'Horn', 'heart', 'Wing', 'Tail', 'heart'],
  orange: ['Horn', 'Horn', 'Horn', 'Horn', 'wild', 'wild'],
  blue: ['Wing', 'Wing', 'Wing', 'Wing', 'wild', 'wild'],
  purple: ['Tail', 'Tail', 'Tail', 'Tail', 'wild', 'wild'],
  green: ['Claw', 'Claw', 'Claw', 'Claw', 'wild', 'wild'],
  white: ['damage', 'damage', 'damage', 'blank', 'blank', 'wild'],
};

/** Tabla trucada: cada tipo de dado siempre saca la misma cara. Útil para casos límite. */
export function fixedTable(
  overrides: Partial<Record<keyof DiceTable, DiceTable['red'][number]>>,
): DiceTable {
  const table = { ...DICE } as Record<keyof DiceTable, DiceTable['red']>;
  for (const [kind, face] of Object.entries(overrides)) {
    table[kind as keyof DiceTable] = Array(6).fill(face);
  }
  return table;
}

export const GARDEN_SALAAD: Monster = {
  id: 'garden-salaad',
  name: 'Garden Salaad',
  type: 'Claw',
  slots: ['Claw', 'Claw', 'Horn', 'all'],
  trophies: ['Claw', 'Horn'],
  pun: 'You may want to leaf it alone',
};

export const PORCUPINEAPPLE: Monster = {
  id: 'porcupineapple',
  name: 'Porcupineapple',
  type: 'Claw',
  slots: ['Claw', 'Claw', 'Horn', 'damage'],
  trophies: ['Claw', 'Horn'],
  pun: 'Some real sour spines',
};

export const BEEHOLDER: Monster = {
  id: 'beeholder',
  name: 'Beeholder',
  type: 'Wing',
  slots: ['Wing', 'Wing', 'Horn', 'all'],
  trophies: ['Wing', 'Horn'],
  pun: 'Roll 2B4 damage',
};

export const validMonsterArbitrary = fc.record({
  id: fc.string({ minLength: 1 }),
  name: fc.string({ minLength: 1 }),
  type: fc.constantFrom<GameSymbol>(...SYMBOLS),
  slots: fc.tuple(
    fc.constantFrom<Slot>(...VALID_SLOTS),
    fc.constantFrom<Slot>(...VALID_SLOTS),
    fc.constantFrom<Slot>(...VALID_SLOTS),
    fc.constantFrom<Slot>(...VALID_SLOTS),
  ),
  trophies: fc.array(fc.constantFrom<GameSymbol>(...SYMBOLS), { minLength: 1, maxLength: 2 }),
  pun: fc.string(),
});

// RF-14: Habilidades de prueba (una de cada efecto; copia de config/abilities.json)
export const ABILITIES: readonly Ability[] = [
  {
    id: 'meaty-crossbow',
    name: 'Meaty Crossbow',
    kind: 'item',
    effect: { type: 'triple', symbol: 'Wing' },
  },
  {
    id: 'x-ray-laser',
    name: 'X-Ray Laser',
    kind: 'item',
    effect: { type: 'triple', symbol: 'Claw' },
  },
  {
    id: 'extra-ammo',
    name: 'Extra Ammo',
    kind: 'item',
    effect: { type: 'double', symbol: 'Wing' },
    bonus: 'trophySlot',
  },
  {
    id: 'auto-aimer',
    name: 'Auto-Aimer',
    kind: 'item',
    effect: { type: 'wild', symbol: 'Wing' },
    bonus: 'trophySlot',
  },
  {
    id: 'pierfect-shot',
    name: 'Pierfect Shot',
    kind: 'skill',
    effect: { type: 'special', die: 'blue' },
  },
  {
    id: 'double-damage',
    name: 'Double Damage',
    kind: 'skill',
    effect: { type: 'convert', symbol: 'Wing' },
  },
  {
    id: 'ambidexterity',
    name: 'Ambidexterity',
    kind: 'skill',
    effect: { type: 'convert', symbol: 'Horn' },
  },
];

// V1: cartas restantes (una de cada efecto nuevo)
export const V1_ABILITIES: readonly Ability[] = [
  { id: 'lucky-find', name: 'Lucky Find', kind: 'skill', effect: { type: 'lucky', die: 'green' } },
  { id: 'cursed-gauntlet', name: 'Cursed Gauntlet', kind: 'item', effect: { type: 'gauntlet' } },
  { id: 'double-healing', name: 'Double Healing', kind: 'skill', effect: { type: 'shield' } },
  {
    id: 'cloning-tool',
    name: 'Cloning Tool',
    kind: 'item',
    effect: { type: 'recharge' },
    bonus: 'trophySlot',
  },
  {
    id: 'piebix-cube',
    name: 'Piebix Cube',
    kind: 'item',
    effect: { type: 'points', by: 'specialDice' },
  },
  {
    id: 'varied-samples',
    name: 'Varied Samples',
    kind: 'skill',
    effect: { type: 'points', by: 'trophyTypes' },
  },
  {
    id: 'well-traveled',
    name: 'Well Traveled',
    kind: 'skill',
    effect: { type: 'points', by: 'monsterTypes' },
  },
];

// RF-17: Misiones secretas de prueba (copia de config/quests.json)
export const QUESTS: readonly SecretQuest[] = [
  { id: 'axe-and-claw', name: 'Axe and Claw', monsterType: 'Claw', symbols: ['Horn', 'Claw'] },
  { id: 'longclaw', name: 'Longclaw', monsterType: 'Claw', symbols: ['Wing', 'Claw'] },
];

/** Jefe de prueba de 6 espacios. */
export const BOSS: Monster = {
  id: 'pieous',
  name: 'Pieous Assassin',
  type: 'Wing',
  slots: ['Wing', 'Wing', 'Horn', 'Claw', 'Tail', 'Wing'],
  trophies: ['Horn', 'Wing', 'Claw', 'Tail'],
  pun: 'Boss',
  boss: true,
};

export function ability(id: string): Ability {
  const found = [...ABILITIES, ...V1_ABILITIES].find((a) => a.id === id);
  if (!found) throw new Error(`fixture: no existe la habilidad ${id}`);
  return found;
}

// RF-15: Configuración de prueba (misma forma que config/game.json)
export const CONFIG: GameConfig = {
  player: {
    maxHp: 4,
    startingHp: 4,
    startingDice: ['red', 'red', 'red', 'red', 'green'],
    trophySlots: 2,
    startingTrophies: 1,
    startingItems: 1,
  },
  lives: 3,
  pieland: { hp: 5, countdown: [6, 5, 4, 3, 2] },
  map: { columns: 2, minNodes: 2, maxNodes: 2 },
  boss: { id: 'pieous', name: 'Pieous Assassin', pun: 'Boss', slots: 6 },
  town: { actionsPerVisit: 2, itemCost: 1, skillCost: 2, offerSize: 3, maxItems: 3, maxSkills: 3 },
  tutorial: { monsterId: 'garden-salaad', seed: 'tutorial' },
  features: {},
  scoring: {
    defeat: 1,
    study: 0,
    flee: 0,
    ko: -1,
    koWeight: 3,
    runWeight: 1,
    victoryBonus: 5,
    pointsCardMax: 4,
  },
};
