// Capa de datos: todo valor de juego viene de config/, validado con Zod por el engine.
import {
  loadAbilities,
  loadDiceTable,
  loadGameConfig,
  loadMonsters,
  loadQuests,
  loadTutorial,
} from '@snac-hunters/engine';
import type { Ability, CombatSetup, GameData, Monster } from '@snac-hunters/engine';
import rawAbilities from '@snac-hunters/config/abilities.json';
import rawDice from '@snac-hunters/config/dice.json';
import rawGame from '@snac-hunters/config/game.json';
import rawMonsters from '@snac-hunters/config/monsters.json';
import rawQuests from '@snac-hunters/config/quests.json';
import rawTutorial from '@snac-hunters/config/tutorial.json';

export const diceTable = loadDiceTable(rawDice);
export const gameConfig = loadGameConfig(rawGame);
export const monsters: readonly Monster[] = loadMonsters(rawMonsters);
export const tutorialSteps = loadTutorial(rawTutorial);
export const abilities: readonly Ability[] = loadAbilities(rawAbilities);
export const quests = loadQuests(rawQuests);

/** Lo mismo que usa el servidor para re-simular la partida. */
export const gameData: GameData = {
  config: gameConfig,
  monsters,
  abilities,
  quests,
  dice: diceTable,
};

/** Setup del tutorial: un combate suelto con los dados iniciales. */
export const playerSetup: CombatSetup = {
  dice: gameConfig.player.startingDice,
  hp: gameConfig.player.startingHp,
  maxHp: gameConfig.player.maxHp,
};

/**
 * Toggles apagados por el build (VITE_FEATURES_OFF="a,b"). Así un despliegue sin API, como la
 * prueba en Firebase Hosting, apaga la validación en servidor sin tocar config/game.json,
 * que comparte con la Lambda.
 */
const featuresOff = new Set(
  (import.meta.env.VITE_FEATURES_OFF ?? '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean),
);

/** Feature toggles: se activan/desactivan en config/game.json sin tocar código. */
export function isEnabled(feature: string): boolean {
  return gameConfig.features[feature] === true && !featuresOff.has(feature);
}

export function getMonster(id: string): Monster | undefined {
  return monsters.find((m) => m.id === id);
}

export function getAbility(id: string): Ability | undefined {
  return abilities.find((a) => a.id === id);
}

// Sin "/" final: la salida ApiUrl de CDK termina en "/" y produciría rutas como "/dev//runs"
export const API_URL: string = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001').replace(
  /\/+$/,
  '',
);
