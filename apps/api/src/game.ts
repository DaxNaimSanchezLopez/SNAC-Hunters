// Carga y valida config/ una sola vez por contenedor Lambda (Regla de oro 3: nada hardcodeado).
import { loadDiceTable, loadGameConfig, loadMonsters } from '@snac-hunters/engine';
import type { CombatSetup, Monster } from '@snac-hunters/engine';
import rawDice from '@snac-hunters/config/dice.json';
import rawGame from '@snac-hunters/config/game.json';
import rawMonsters from '@snac-hunters/config/monsters.json';

export const diceTable = loadDiceTable(rawDice);
export const gameConfig = loadGameConfig(rawGame);
export const monsters: readonly Monster[] = loadMonsters(rawMonsters);

/** El setup lo decide el servidor, nunca el cliente. */
export const serverSetup: CombatSetup = {
  dice: gameConfig.player.startingDice,
  hp: gameConfig.player.startingHp,
  maxHp: gameConfig.player.maxHp,
};
