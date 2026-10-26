// RF-12: Expedición (run) — funciones puras sobre el estado entre combates.
// Pueblo → salir → combates encadenados → volver al pueblo (por decisión, huida o KO).
// Lo gastado en un combate sigue gastado el resto de la expedición; al volver al pueblo
// se recuperan los dados y se retiran todos los dados blancos (D-14, D-15).

import { CombatError, isRollable, isValidHp, replayCombat } from './combat.js';
import type { CombatAction, CombatSetup, CombatState } from './combat.js';
import type { DiceTable, DieKind, Monster } from './types.js';

export type RunEnd = 'town' | 'flee' | 'ko';

/** Recursos con los que sale del pueblo el personaje. */
export interface RunSetup {
  readonly dice: readonly DieKind[];
  readonly maxHp: number;
  /** HPie con el que sale (por defecto, el máximo): solo descansar lo recupera. */
  readonly hp?: number;
}

export interface RunState {
  readonly hp: number;
  readonly maxHp: number;
  /** Dados disponibles para el próximo combate, incluidos los blancos que quedaron en blanco. */
  readonly pool: readonly DieKind[];
  /** Combates ya resueltos en esta expedición. */
  readonly fights: number;
  readonly status: 'active' | 'ended';
  readonly endedBy: RunEnd | null;
}

export interface RunFight {
  readonly monster: Monster;
  readonly seed: number | string;
  readonly actions: readonly CombatAction[];
}

/**
 * Sale del pueblo con todos los dados y el HPie que tenga. Empezar una expedición nueva
 * es también la recuperación en el pueblo: no se arrastra nada de la anterior.
 */
export function startRun(setup: RunSetup): RunState {
  if (setup.dice.length === 0) throw new CombatError('La reserva de dados está vacía');
  if (setup.dice.includes('white')) {
    throw new CombatError('Los dados blancos no salen del pueblo');
  }
  if (!Number.isInteger(setup.maxHp) || setup.maxHp < 1) {
    throw new CombatError(`HPie inválido: ${setup.maxHp}`);
  }
  const hp = setup.hp ?? setup.maxHp;
  if (!isValidHp(hp, setup.maxHp)) {
    throw new CombatError(`HPie inválido: ${hp}`);
  }
  return {
    hp,
    maxHp: setup.maxHp,
    pool: [...setup.dice],
    fights: 0,
    status: 'active',
    endedBy: null,
  };
}

/** ¿Puede enfrentar otro monstruo? Hace falta seguir en expedición y tener dados. */
export function canHunt(run: RunState): boolean {
  return run.status === 'active' && run.pool.length > 0;
}

/** Setup del siguiente combate: los dados y el HPie que quedan, no los iniciales. */
export function runCombatSetup(run: RunState): CombatSetup {
  if (run.status !== 'active') throw new CombatError('La expedición ya terminó');
  if (run.pool.length === 0) throw new CombatError('No quedan dados: vuelve al pueblo');
  return { dice: run.pool, hp: run.hp, maxHp: run.maxHp };
}

/**
 * Dados que siguen en la reserva al terminar un combate:
 * - Los usados en el monstruo, los corazones que bloquearon daño y los blancos que
 *   hicieron daño quedan gastados.
 * - Un blanco que no salió en blanco ya se activó (daño o comodín) y sale de la reserva.
 * - Un blanco que salió en blanco se queda, así que el riesgo crece en cada combate.
 * - Los símbolos que consume una habilidad también quedan gastados.
 */
export function remainingPool(combat: CombatState): DieKind[] {
  // Trofeos y símbolos de habilidad no son dados: nunca pasan al siguiente combate
  return combat.dice.flatMap((d) =>
    isRollable(d.kind) &&
    !combat.spent.includes(d.id) &&
    !combat.assignments.includes(d.id) &&
    (d.kind !== 'white' || d.face === 'blank')
      ? [d.kind]
      : [],
  );
}

/** Aplica el resultado de un combate resuelto. Huir o quedar KO terminan la expedición. */
export function endCombat(run: RunState, combat: CombatState): RunState {
  if (run.status !== 'active') throw new CombatError('La expedición ya terminó');
  if (combat.status !== 'resolved') throw new CombatError('El combate no ha terminado');
  const endedBy: RunEnd | null = combat.ko ? 'ko' : combat.outcome === 'flee' ? 'flee' : null;
  return {
    ...run,
    hp: combat.hp,
    pool: remainingPool(combat),
    fights: run.fights + 1,
    status: endedBy ? 'ended' : 'active',
    endedBy,
  };
}

/** El jugador decide volver al pueblo entre combates. */
export function returnToTown(run: RunState): RunState {
  if (run.status !== 'active') throw new CombatError('La expedición ya terminó');
  return { ...run, status: 'ended', endedBy: 'town' };
}

/**
 * Regla de oro 2 a nivel expedición: re-simula cada combate con los dados y el HPie que
 * dejó el anterior. Lanza CombatError ante cualquier acción ilegal, combate sin terminar
 * o combate después de que la expedición terminó.
 */
export function replayRun(
  setup: RunSetup,
  fights: readonly RunFight[],
  table: DiceTable,
): { readonly run: RunState; readonly combats: readonly CombatState[] } {
  let run = startRun(setup);
  const combats: CombatState[] = [];
  for (const fight of fights) {
    const combat = replayCombat(
      fight.monster,
      runCombatSetup(run),
      fight.seed,
      fight.actions,
      table,
    );
    run = endCombat(run, combat);
    combats.push(combat);
  }
  return { run, combats };
}
