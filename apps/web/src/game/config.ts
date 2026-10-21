// Capa de datos: todo valor de juego viene de config/, validado con Zod por el engine.
import { loadDiceTable, loadGameConfig, loadMonsters, loadTutorial } from '@snac-hunters/engine';
import type { CombatSetup, Monster } from '@snac-hunters/engine';
import rawDice from '@snac-hunters/config/dice.json';
import rawGame from '@snac-hunters/config/game.json';
import rawMonsters from '@snac-hunters/config/monsters.json';
import rawTutorial from '@snac-hunters/config/tutorial.json';

export const diceTable = loadDiceTable(rawDice);
export const gameConfig = loadGameConfig(rawGame);
export const monsters: readonly Monster[] = loadMonsters(rawMonsters);
export const tutorialSteps = loadTutorial(rawTutorial);

export const playerSetup: CombatSetup = {
  dice: gameConfig.player.startingDice,
  hp: gameConfig.player.startingHp,
  maxHp: gameConfig.player.maxHp,
};

/** Feature toggles: se activan/desactivan en config/game.json sin tocar código. */
export function isEnabled(feature: string): boolean {
  return gameConfig.features[feature] === true;
}

export function getMonster(id: string): Monster | undefined {
  return monsters.find((m) => m.id === id);
}

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
