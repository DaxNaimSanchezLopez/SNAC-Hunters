// Carga y valida config/ una sola vez por contenedor Lambda (Regla de oro 3: nada hardcodeado).
import {
  loadAbilities,
  loadDiceTable,
  loadGameConfig,
  loadMonsters,
  loadQuests,
} from '@snac-hunters/engine';
import type { GameData, Monster } from '@snac-hunters/engine';
import rawAbilities from '@snac-hunters/config/abilities.json';
import rawDice from '@snac-hunters/config/dice.json';
import rawGame from '@snac-hunters/config/game.json';
import rawMonsters from '@snac-hunters/config/monsters.json';
import rawQuests from '@snac-hunters/config/quests.json';

export const diceTable = loadDiceTable(rawDice);
export const gameConfig = loadGameConfig(rawGame);
export const monsters: readonly Monster[] = loadMonsters(rawMonsters);
export const abilities = loadAbilities(rawAbilities);
export const quests = loadQuests(rawQuests);

/** Las reglas, los dados y el contenido los decide el servidor, nunca el cliente. */
export const gameData: GameData = {
  config: gameConfig,
  monsters,
  abilities,
  quests,
  dice: diceTable,
};
