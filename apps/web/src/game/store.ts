// Estado global (Zustand). Regla de oro 1: aquí NO se calculan reglas; todo pasa por el engine.
// La partida se guarda como seed + acciones y se reconstruye con `replayGame`, igual que en
// el servidor; el tutorial es un combate suelto con seed fija.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  ABILITY_INPUTS,
  applyAction,
  applyGameAction,
  availableDice,
  canRerollAny,
  CombatError,
  finalScore,
  isRollable,
  newGame,
  replayGame,
  startCombat,
} from '@snac-hunters/engine';
import type {
  CombatAction,
  CombatState,
  GameAction,
  GameState,
  GameSymbol,
} from '@snac-hunters/engine';
import { flush, track } from './analytics';
import { submitGame } from './api';
import {
  diceTable,
  gameConfig,
  gameData,
  getAbility,
  getMonster,
  isEnabled,
  playerSetup,
  tutorialSteps,
} from './config';
import { activeLesson, completesLesson, guide } from './guide';
import { faceName, translate } from './i18n';
import type { Lang, MessageKey, Vars } from './i18n';
import { idbStorage } from './persistence';

export type Screen = 'home' | 'game' | 'tutorial';

export interface SavedGame {
  readonly seed: string;
  readonly actions: readonly GameAction[];
}

export interface FinishedGame {
  readonly gameId: string;
  readonly score: number;
  readonly points: number;
  readonly kos: number;
  readonly runs: number;
  readonly defeated: number;
  readonly at: number;
}

export interface ServerStatus {
  readonly state: 'idle' | 'pending' | 'ok' | 'rejected' | 'offline' | 'disabled';
  readonly message?: string;
}

interface GameStore {
  hydrated: boolean;
  lang: Lang;
  langChosen: boolean;
  screen: Screen;
  saved: SavedGame | null;
  game: GameState | null;
  tutorialActions: readonly CombatAction[];
  tutorialCombat: CombatState | null;
  tutorialStep: number;
  tutorialDone: boolean;
  history: readonly FinishedGame[];
  /** Partida guiada activa (la primera partida, o al elegir "Aprender a jugar"). */
  guideOn: boolean;
  /** Lecciones de la guía ya vistas. */
  guideSeen: readonly string[];
  /** Dados seleccionados: para colocar (uno), conservar al relanzar o activar una habilidad. */
  selected: string[];
  /** Trofeo del inventario seleccionado para colocarlo en el monstruo. */
  selectedTrophy: number | null;
  server: ServerStatus;
  toast: string | null;
  toastSeq: number;

  setLang(lang: Lang): void;
  newGame(guided?: boolean): void;
  dismissLesson(id: string): void;
  skipGuide(): void;
  continueGame(): void;
  act(action: GameAction): void;
  startTutorial(): void;
  nextTutorialStep(): void;
  toggleDie(dieId: string): void;
  selectTrophy(index: number | null): void;
  tapSlot(slot: number): void;
  rerollRest(): void;
  activateAbility(abilityId: string, trophy?: GameSymbol): void;
  resolve(trophy?: GameSymbol): void;
  goHome(): void;
  resetAll(): void;
  clearToast(): void;
}

const HISTORY_SIZE = 10;

function newSeed(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

/** Reconstruye la partida desde seed + acciones. Devuelve null si los datos guardados son inválidos. */
export function rebuild(saved: SavedGame): GameState | null {
  try {
    return replayGame(gameData, saved.seed, saved.actions);
  } catch {
    return null;
  }
}

/** Combate que se está jugando ahora mismo (tutorial o partida). */
export function currentCombat(s: Pick<GameStore, 'screen' | 'tutorialCombat' | 'game'>) {
  return s.screen === 'tutorial' ? s.tutorialCombat : (s.game?.combat ?? null);
}

function damageMessage(
  lang: Lang,
  before: CombatState | null,
  after: CombatState | null,
): string | null {
  if (!after) return null;
  const events = after.log.slice(before ? before.log.length : 0).filter((e) => e.type === 'damage');
  if (events.length === 0) return null;
  const blocked = events.filter((e) => e.type === 'damage' && e.blockedBy !== null).length;
  const hits = events.length - blocked;
  const parts = [translate(lang, 'combat.whiteDie')];
  if (blocked) parts.push(translate(lang, 'combat.blocked', { n: blocked }));
  if (hits) parts.push(translate(lang, 'combat.hit', { n: hits }));
  return parts.join(' · ');
}

function rolledFaces(combat: CombatState): string[] {
  const roll = [...combat.log].reverse().find((e) => e.type === 'roll');
  const ids = roll?.type === 'roll' ? roll.dieIds : [];
  return combat.dice.filter((d) => ids.includes(d.id)).map((d) => d.face);
}

/** Analítica de cada transición de la partida (no es lógica de juego: solo registra). */
function trackTransition(before: GameState, after: GameState, action: GameAction): void {
  const combat = after.combat;
  if (action.type === 'follow' && combat) {
    void track('monster_seen', { monsterId: combat.monster.id, mode: 'hunt' });
    void track('dice_rolled', { faces: combat.dice.map((d) => d.face) });
  }
  if (action.type === 'combat' && action.action.type === 'reroll' && combat) {
    void track('dice_rolled', { faces: rolledFaces(combat), reroll: true });
  }
  if (after.phase === 'aftermath' && before.phase !== 'aftermath' && combat) {
    void track('combat_resolved', {
      outcome: combat.outcome,
      rerolls: combat.rerolls,
      monsterId: combat.monster.id,
    });
  }
  if (action.type === 'leave') void track('run_start', { run: after.runs });
  if (action.type === 'return') void track('run_end', { endedBy: before.run?.endedBy ?? 'town' });
  if (action.type === 'rest' || action.type === 'buy' || action.type === 'pick') {
    void track('town_action', { action: action.type });
  }
  if (action.type === 'finish') {
    void track('game_over', { score: finalScore(after, gameConfig), runs: after.runs });
  }
}

export const useGame = create<GameStore>()(
  persist(
    (setState, getState) => {
      const t = (key: MessageKey, vars?: Vars) => translate(getState().lang, key, vars);

      function toast(message: string | null): void {
        if (message) setState({ toast: message, toastSeq: getState().toastSeq + 1 });
      }

      function errorText(e: unknown): string {
        // Los mensajes del engine están en español; en inglés se muestra uno genérico
        return e instanceof CombatError && getState().lang === 'es'
          ? e.message
          : t('combat.invalid');
      }

      async function validateOnServer(saved: SavedGame): Promise<void> {
        if (!isEnabled('serverValidation')) {
          setState({ server: { state: 'disabled' } });
          return;
        }
        setState({ server: { state: 'pending' } });
        try {
          const res = await submitGame(saved.seed, saved.actions);
          setState({
            server: res.valid
              ? { state: 'ok', message: t('server.score', { score: res.score ?? 0 }) }
              : { state: 'rejected', message: res.error ?? '' },
          });
        } catch {
          setState({ server: { state: 'offline' } });
        }
        void flush();
      }

      function recordFinished(game: GameState): void {
        const entry: FinishedGame = {
          gameId: game.seed,
          score: finalScore(game, gameConfig),
          points: game.points,
          kos: game.kos,
          runs: game.runs,
          defeated: game.outcomes.defeat ?? 0,
          at: Date.now(),
        };
        setState({ history: [entry, ...getState().history].slice(0, HISTORY_SIZE) });
      }

      function act(action: GameAction): void {
        const { saved, game, guideOn, guideSeen } = getState();
        if (!saved || !game) return;
        const lesson = guideOn ? activeLesson(game, guideSeen) : null;
        let next: GameState;
        try {
          next = applyGameAction(game, action, gameData);
        } catch (e) {
          setState({ selected: [], selectedTrophy: null });
          toast(errorText(e));
          return;
        }
        const nextSaved = { ...saved, actions: [...saved.actions, action] };
        setState({ game: next, saved: nextSaved, selected: [], selectedTrophy: null });
        // Las lecciones de "hazlo tú" se cumplen al hacer la acción que piden
        if (lesson && completesLesson(lesson, action)) {
          setState({ guideSeen: [...getState().guideSeen, lesson.id] });
        }
        trackTransition(game, next, action);

        const fresh = action.type === 'follow' ? null : game.combat;
        toast(damageMessage(getState().lang, fresh, next.combat));
        if (action.type === 'return') toast(t('town.welcomeBack'));
        if (action.type === 'return' || action.type === 'finish') void validateOnServer(nextSaved);
        if (action.type === 'finish') recordFinished(next);
      }

      function tutorialDispatch(action: CombatAction): void {
        const { tutorialCombat, tutorialStep, tutorialActions } = getState();
        if (!tutorialCombat) return;
        try {
          const next = applyAction(tutorialCombat, action, diceTable);
          const step = tutorialSteps[tutorialStep];
          const advances = step !== undefined && step.advance === action.type;
          setState({
            tutorialCombat: next,
            tutorialActions: [...tutorialActions, action],
            selected: [],
            selectedTrophy: null,
            tutorialStep: advances ? tutorialStep + 1 : tutorialStep,
          });
          toast(damageMessage(getState().lang, tutorialCombat, next));
          if (action.type === 'reroll') {
            void track('dice_rolled', { faces: rolledFaces(next), reroll: true });
          }
          if (next.status === 'resolved') {
            setState({ tutorialDone: true });
            void track('combat_resolved', {
              outcome: next.outcome,
              rerolls: next.rerolls,
              monsterId: next.monster.id,
            });
            void track('tutorial_complete');
          }
        } catch (e) {
          setState({ selected: [], selectedTrophy: null });
          toast(errorText(e));
        }
      }

      function combatDispatch(action: CombatAction): void {
        if (getState().screen === 'tutorial') tutorialDispatch(action);
        else act({ type: 'combat', action });
      }

      return {
        hydrated: false,
        lang: 'es',
        langChosen: false,
        screen: 'home',
        saved: null,
        game: null,
        tutorialActions: [],
        tutorialCombat: null,
        tutorialStep: 0,
        tutorialDone: false,
        history: [],
        guideOn: false,
        guideSeen: [],
        selected: [],
        selectedTrophy: null,
        server: { state: 'idle' },
        toast: null,
        toastSeq: 0,

        setLang(lang) {
          setState({ lang, langChosen: true });
          void track('language_set', { lang });
        },

        newGame(guided) {
          const seed = newSeed();
          // La primera partida siempre es guiada: V0 enseña el juego de mesa
          const guideOn = guided ?? getState().history.length === 0;
          setState({
            guideOn,
            guideSeen: [],
            saved: { seed, actions: [] },
            game: newGame(gameData, seed),
            screen: 'game',
            server: { state: 'idle' },
            selected: [],
            selectedTrophy: null,
          });
          void track('game_start', { guided: guideOn });
          if (guideOn) void track('tutorial_start', { mode: 'guided' });
        },

        dismissLesson(id) {
          const lesson = guide.find((l) => l.id === id);
          setState({ guideSeen: [...getState().guideSeen, id] });
          if (lesson?.final) {
            setState({ guideOn: false, tutorialDone: true });
            void track('tutorial_complete', { mode: 'guided' });
          }
        },

        skipGuide() {
          setState({ guideOn: false });
          void track('tutorial_skipped');
        },

        continueGame() {
          if (getState().game) setState({ screen: 'game' });
        },

        act,

        startTutorial() {
          const monster = getMonster(gameConfig.tutorial.monsterId);
          if (!monster) return;
          const combat = startCombat(monster, playerSetup, gameConfig.tutorial.seed, diceTable);
          setState({
            screen: 'tutorial',
            tutorialCombat: combat,
            tutorialActions: [],
            tutorialStep: 0,
            selected: [],
            selectedTrophy: null,
          });
          void track('tutorial_start');
          void track('monster_seen', { monsterId: monster.id, mode: 'tutorial' });
          void track('dice_rolled', { faces: combat.dice.map((d) => d.face) });
        },

        nextTutorialStep() {
          setState({ tutorialStep: getState().tutorialStep + 1 });
        },

        toggleDie(dieId) {
          const { selected } = getState();
          setState({
            selectedTrophy: null,
            selected: selected.includes(dieId)
              ? selected.filter((id) => id !== dieId)
              : [...selected, dieId],
          });
        },

        selectTrophy(index) {
          const same = getState().selectedTrophy === index;
          setState({ selectedTrophy: same ? null : index, selected: [] });
        },

        tapSlot(slot) {
          const state = getState();
          const combat = currentCombat(state);
          if (!combat) return;
          const { selected, selectedTrophy } = state;
          if (combat.assignments[slot] !== null) {
            combatDispatch({ type: 'unassign', slot });
          } else if (selectedTrophy !== null) {
            combatDispatch({ type: 'trophy', index: selectedTrophy, slot });
          } else if (selected.length === 1 && selected[0]) {
            combatDispatch({ type: 'assign', dieId: selected[0], slot });
          } else {
            toast(t('combat.tapDieFirst'));
          }
        },

        // Feedback V0: se seleccionan los dados que se CONSERVAN y se relanza el resto
        rerollRest() {
          const state = getState();
          const combat = currentCombat(state);
          if (!combat) return;
          const dieIds = availableDice(combat)
            .filter((d) => isRollable(d.kind) && !state.selected.includes(d.id))
            .map((d) => d.id);
          if (dieIds.length === 0 && canRerollAny(combat)) {
            toast(t('combat.deselect'));
            return;
          }
          combatDispatch({ type: 'reroll', dieIds });
        },

        activateAbility(abilityId, trophy) {
          const state = getState();
          const ability = getAbility(abilityId);
          if (!ability || ability.effect.type === 'special') return;
          const need = ABILITY_INPUTS[ability.effect.type];
          if (state.selected.length !== need) {
            toast(
              t('combat.needDice', {
                name: ability.name,
                n: need,
                symbol: faceName(t, ability.effect.symbol),
              }),
            );
            return;
          }
          combatDispatch({ type: 'ability', abilityId, dieIds: state.selected, trophy });
        },

        resolve(trophy) {
          combatDispatch({ type: 'resolve', trophy });
        },

        goHome() {
          setState({ screen: 'home', selected: [], selectedTrophy: null });
        },

        resetAll() {
          setState({
            saved: null,
            game: null,
            history: [],
            tutorialDone: false,
            guideOn: false,
            guideSeen: [],
            screen: 'home',
            server: { state: 'idle' },
          });
        },

        clearToast() {
          setState({ toast: null });
        },
      };
    },
    {
      name: 'snac-hunters:v2',
      storage: createJSONStorage(() => idbStorage),
      // Solo se persiste lo mínimo: seed + acciones, nunca el estado calculado
      partialize: (s) => ({
        lang: s.lang,
        langChosen: s.langChosen,
        saved: s.saved,
        tutorialDone: s.tutorialDone,
        history: s.history,
        guideOn: s.guideOn,
        guideSeen: s.guideSeen,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<GameStore>;
        // Sesión interrumpida: se reanuda la partida re-simulándola; si está corrupta se descarta
        const game = p.saved ? rebuild(p.saved) : null;
        return {
          ...current,
          lang: p.lang === 'en' ? 'en' : 'es',
          langChosen: p.langChosen === true,
          tutorialDone: p.tutorialDone === true,
          history: Array.isArray(p.history) ? p.history : [],
          guideOn: game !== null && p.guideOn === true,
          guideSeen: Array.isArray(p.guideSeen) ? p.guideSeen : [],
          saved: game ? (p.saved ?? null) : null,
          game,
          screen: 'home',
        };
      },
      onRehydrateStorage: () => () => {
        useGame.setState({ hydrated: true });
        void track('session_start');
      },
    },
  ),
);
