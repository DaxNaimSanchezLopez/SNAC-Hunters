// Partida guiada: V0 es el tutorial del juego de mesa (feedback del cliente), así que la
// primera partida explica cada parte del juego justo cuando aparece. Los textos y las
// condiciones viven en config/guide.json; aquí solo se decide qué lección toca mostrar.
import { coveredSlots, loadGuide } from '@snac-hunters/engine';
import type { GameAction, GameState, GuideLesson } from '@snac-hunters/engine';
import rawGuide from '@snac-hunters/config/guide.json';

export const guide: readonly GuideLesson[] = loadGuide(rawGuide);

type Condition = GuideLesson['when'][number];

const CONDITIONS: Record<Condition, (g: GameState) => boolean> = {
  firstVisit: (g) => g.runs === 0,
  returnVisit: (g) => g.runs > 0,
  offer: (g) => g.offer !== null,
  damageSlot: (g) => g.combat?.monster.slots.includes('damage') ?? false,
  hasTrophies: (g) => (g.combat?.trophies.length ?? 0) > 0,
  hasAbilities: (g) => (g.combat?.abilities.length ?? 0) > 0,
  whiteDie: (g) => g.combat?.dice.some((d) => d.kind === 'white') ?? false,
  covered: (g) => (g.combat ? coveredSlots(g.combat) > 0 : false),
  runActive: (g) => g.run?.status === 'active',
  runEnded: (g) => g.run?.status === 'ended',
  boss: (g) => g.combat?.monster.boss === true,
};

/** Primera lección no vista cuya fase y condiciones se cumplen ahora mismo. */
export function activeLesson(game: GameState | null, seen: readonly string[]): GuideLesson | null {
  // Con un trofeo pendiente manda su propia ventana; la guía espera
  if (!game || game.pendingTrophy !== null) return null;
  return (
    guide.find(
      (lesson) =>
        !seen.includes(lesson.id) &&
        lesson.phase === game.phase &&
        // Con la oferta de cartas abierta solo se explica la oferta
        (game.offer === null || lesson.when.includes('offer')) &&
        lesson.when.every((c) => CONDITIONS[c](game)),
    ) ?? null
  );
}

/** ¿Esta acción del jugador cumple la lección que se estaba mostrando? */
export function completesLesson(lesson: GuideLesson, action: GameAction): boolean {
  if (lesson.advance === 'next') return false;
  return (
    action.type === lesson.advance ||
    (action.type === 'combat' && action.action.type === lesson.advance)
  );
}
