// Estado global (Zustand). Regla de oro 1: aquí NO se calculan reglas; todo pasa por el engine.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  applyAction,
  CombatError,
  pickEncounterPair,
  replayCombat,
  startCombat,
} from '@snac-hunters/engine';
import type { CombatAction, CombatState, GameSymbol, Outcome } from '@snac-hunters/engine';
import { flush, track } from './analytics';
import { submitRun } from './api';
import {
  diceTable,
  gameConfig,
  getMonster,
  isEnabled,
  monsters,
  playerSetup,
  tutorialSteps,
} from './config';
import { idbStorage } from './persistence';

export type Screen = 'home' | 'pick' | 'combat' | 'result';

export interface ActiveCombat {
  readonly mode: 'tutorial' | 'hunt';
  readonly monsterId: string;
  readonly seed: string;
  readonly actions: readonly CombatAction[];
  readonly recorded: boolean;
}

export interface Progress {
  readonly points: number;
  readonly trophies: Partial<Record<GameSymbol, number>>;
  readonly outcomes: Partial<Record<Outcome, number>>;
  readonly kos: number;
  readonly tutorialDone: boolean;
}

export interface ServerStatus {
  readonly state: 'idle' | 'pending' | 'ok' | 'rejected' | 'offline' | 'disabled';
  readonly message?: string;
}

interface GameStore {
  hydrated: boolean;
  screen: Screen;
  active: ActiveCombat | null;
  combat: CombatState | null;
  selected: string[];
  tutorialStep: number;
  pair: [string, string] | null;
  progress: Progress;
  server: ServerStatus;
  toast: string | null;
  toastSeq: number;

  startTutorial(): void;
  openHunt(): void;
  startHunt(monsterId: string): void;
  toggleDie(dieId: string): void;
  tapSlot(slot: number): void;
  reroll(): void;
  resolve(trophy?: GameSymbol): void;
  nextTutorialStep(): void;
  goHome(): void;
  resetProgress(): void;
  clearToast(): void;
}

const EMPTY_PROGRESS: Progress = {
  points: 0,
  trophies: {},
  outcomes: {},
  kos: 0,
  tutorialDone: false,
};

function newSeed(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

/** Reconstruye el combate desde seed + acciones. Devuelve null si los datos guardados son inválidos. */
export function rebuild(active: ActiveCombat): CombatState | null {
  const monster = getMonster(active.monsterId);
  if (!monster) return null;
  try {
    return replayCombat(monster, playerSetup, active.seed, active.actions, diceTable);
  } catch {
    return null;
  }
}

function damageMessage(before: CombatState, after: CombatState): string | null {
  const events = after.log.slice(before.log.length).filter((e) => e.type === 'damage');
  if (events.length === 0) return null;
  const blocked = events.filter((e) => e.type === 'damage' && e.blockedBy !== null).length;
  const hits = events.length - blocked;
  const parts = [];
  if (blocked) parts.push(`${blocked} daño bloqueado por corazón`);
  if (hits) parts.push(`-${hits} HPie`);
  return `¡Dado blanco! ${parts.join(' · ')}`;
}

export const useGame = create<GameStore>()(
  persist(
    (setState, getState) => {
      function begin(mode: ActiveCombat['mode'], monsterId: string, seed: string): void {
        const monster = getMonster(monsterId);
        if (!monster) return;
        const combat = startCombat(monster, playerSetup, seed, diceTable);
        setState({
          screen: 'combat',
          active: { mode, monsterId, seed, actions: [], recorded: false },
          combat,
          selected: [],
          server: { state: 'idle' },
          toastSeq: getState().toastSeq + 1,
          toast: damageMessage({ ...combat, log: [] }, combat),
        });
        void track('monster_seen', { monsterId, mode });
        void track('dice_rolled', { faces: combat.dice.map((d) => d.face) });
      }

      function finish(): void {
        const { active, combat, progress } = getState();
        if (
          !active ||
          !combat ||
          combat.status !== 'resolved' ||
          active.recorded ||
          !combat.outcome
        )
          return;
        const outcome = combat.outcome;
        const trophies = { ...progress.trophies };
        if (combat.trophy) trophies[combat.trophy] = (trophies[combat.trophy] ?? 0) + 1;
        const koPenalty = combat.ko && outcome !== 'ko' ? gameConfig.scoring.ko : 0;
        setState({
          screen: 'result',
          active: { ...active, recorded: true },
          progress: {
            points: progress.points + gameConfig.scoring[outcome] + koPenalty,
            trophies,
            outcomes: { ...progress.outcomes, [outcome]: (progress.outcomes[outcome] ?? 0) + 1 },
            kos: progress.kos + (combat.ko ? 1 : 0),
            tutorialDone: progress.tutorialDone || active.mode === 'tutorial',
          },
        });
        void track('combat_resolved', {
          outcome,
          rerolls: combat.rerolls,
          monsterId: active.monsterId,
        });
        if (active.mode === 'tutorial') void track('tutorial_complete');
        void validateOnServer(active);
      }

      async function validateOnServer(active: ActiveCombat): Promise<void> {
        if (!isEnabled('serverValidation')) {
          setState({ server: { state: 'disabled' } });
          return;
        }
        setState({ server: { state: 'pending' } });
        try {
          const res = await submitRun(active.monsterId, active.seed, active.actions);
          setState({
            server: res.valid
              ? { state: 'ok', message: `Servidor: ${res.outcome} (${res.points ?? 0} pts)` }
              : { state: 'rejected', message: res.error ?? 'Rechazado' },
          });
        } catch {
          setState({ server: { state: 'offline', message: 'Sin conexión con la API' } });
        }
        void flush();
      }

      function dispatch(action: CombatAction): void {
        const { active, combat, tutorialStep } = getState();
        if (!active || !combat) return;
        try {
          const next = applyAction(combat, action, diceTable);
          const step = tutorialSteps[tutorialStep];
          const advances =
            active.mode === 'tutorial' && step !== undefined && step.advance === action.type;
          setState({
            combat: next,
            active: { ...active, actions: [...active.actions, action] },
            selected: [],
            toastSeq: getState().toastSeq + 1,
            toast: damageMessage(combat, next),
            tutorialStep: advances ? tutorialStep + 1 : tutorialStep,
          });
          if (action.type === 'reroll') {
            const roll = [...next.log].reverse().find((e) => e.type === 'roll');
            const ids = roll?.type === 'roll' ? roll.dieIds : [];
            void track('dice_rolled', {
              faces: next.dice.filter((d) => ids.includes(d.id)).map((d) => d.face),
              reroll: true,
            });
          }
          if (next.status === 'resolved') finish();
        } catch (e) {
          setState({
            toastSeq: getState().toastSeq + 1,
            toast: e instanceof CombatError ? e.message : 'Acción inválida',
            selected: [],
          });
        }
      }

      return {
        hydrated: false,
        screen: 'home',
        active: null,
        combat: null,
        selected: [],
        tutorialStep: 0,
        pair: null,
        progress: EMPTY_PROGRESS,
        server: { state: 'idle' },
        toast: null,
        toastSeq: 0,

        startTutorial() {
          setState({ tutorialStep: 0 });
          void track('tutorial_start');
          begin('tutorial', gameConfig.tutorial.monsterId, gameConfig.tutorial.seed);
        },

        openHunt() {
          const [a, b] = pickEncounterPair(monsters, newSeed());
          setState({ screen: 'pick', pair: [a.id, b.id] });
        },

        startHunt(monsterId) {
          begin('hunt', monsterId, newSeed());
        },

        toggleDie(dieId) {
          const { selected } = getState();
          setState({
            selected: selected.includes(dieId)
              ? selected.filter((id) => id !== dieId)
              : [...selected, dieId],
          });
        },

        tapSlot(slot) {
          const { combat, selected } = getState();
          if (!combat) return;
          if (combat.assignments[slot] !== null) {
            dispatch({ type: 'unassign', slot });
          } else if (selected.length === 1 && selected[0]) {
            dispatch({ type: 'assign', dieId: selected[0], slot });
          } else {
            setState({
              toastSeq: getState().toastSeq + 1,
              toast: 'Primero toca UN dado y luego el espacio',
            });
          }
        },

        reroll() {
          dispatch({ type: 'reroll', dieIds: getState().selected });
        },

        resolve(trophy) {
          dispatch({ type: 'resolve', trophy });
        },

        nextTutorialStep() {
          setState({ tutorialStep: getState().tutorialStep + 1 });
        },

        goHome() {
          setState({ screen: 'home', active: null, combat: null, selected: [], pair: null });
        },

        resetProgress() {
          setState({ progress: EMPTY_PROGRESS, screen: 'home', active: null, combat: null });
        },

        clearToast() {
          setState({ toast: null });
        },
      };
    },
    {
      name: 'snac-hunters:v1',
      storage: createJSONStorage(() => idbStorage),
      // Solo se persiste lo mínimo: seed + acciones, nunca el estado calculado
      partialize: (s) => ({ active: s.active, progress: s.progress, tutorialStep: s.tutorialStep }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<GameStore>;
        const progress = { ...EMPTY_PROGRESS, ...(p.progress ?? {}) };
        const active = p.active && !p.active.recorded ? p.active : null;
        // Sesión interrumpida: se reanuda el combate re-simulándolo; si está corrupto se descarta
        const combat = active ? rebuild(active) : null;
        const resumable = active && combat && combat.status === 'active';
        return {
          ...current,
          progress,
          tutorialStep: typeof p.tutorialStep === 'number' ? p.tutorialStep : 0,
          active: resumable ? active : null,
          combat: resumable ? combat : null,
          screen: resumable ? 'combat' : 'home',
        };
      },
      onRehydrateStorage: () => () => {
        useGame.setState({ hydrated: true });
        void track('session_start');
      },
    },
  ),
);
