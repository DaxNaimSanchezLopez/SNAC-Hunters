// Integración: persistencia de la partida, sesiones interrumpidas, estado corrupto e idioma.
// En jsdom no hay IndexedDB, así que idbStorage usa su respaldo en memoria (mismo contrato).
import { describe, it, expect, beforeEach } from 'vitest';
import { availableDice, isRollable } from '@snac-hunters/engine';
import { summarize } from '../game/analytics';
import type { AnalyticsEvent } from '../game/analytics';
import { activeLesson, guide } from '../game/guide';
import { translate } from '../game/i18n';
import type { MessageKey } from '../game/i18n';
import { idbStorage } from '../game/persistence';
import { rebuild, useGame } from '../game/store';

const KEY = 'snac-hunters:v2';

beforeEach(async () => {
  await idbStorage.removeItem(KEY);
  useGame.setState({ screen: 'home', saved: null, game: null, history: [], lang: 'es' });
});

describe('persistencia de la partida', () => {
  it('guarda solo seed + acciones y reanuda la partida tras recargar', async () => {
    const store = useGame.getState();
    store.newGame();
    useGame.getState().act({ type: 'start', die: 'green' });
    useGame.getState().act({ type: 'follow', index: 0 });
    const before = useGame.getState().game!;
    expect(before.phase).toBe('combat');

    const saved = JSON.parse((await idbStorage.getItem(KEY))!) as {
      state: Record<string, unknown>;
    };
    expect(Object.keys(saved.state).sort()).toEqual([
      'guideOn',
      'guideSeen',
      'history',
      'lang',
      'langChosen',
      'saved',
      'tutorialDone',
    ]);

    // "Cerrar el navegador": se borra el estado en memoria y se rehidrata desde el almacenamiento
    const snapshot = (await idbStorage.getItem(KEY))!;
    useGame.setState({ game: null, saved: null, screen: 'home' });
    await idbStorage.setItem(KEY, snapshot);
    await useGame.persist.rehydrate();
    const resumed = useGame.getState();
    expect(resumed.screen).toBe('home');
    expect(resumed.game).toEqual(before);
    resumed.continueGame();
    expect(useGame.getState().screen).toBe('game');
  });

  it('descarta una partida guardada corrupta sin perder el historial ni el idioma', async () => {
    await idbStorage.setItem(
      KEY,
      JSON.stringify({
        state: {
          saved: { seed: 'x', actions: [{ type: 'rest' }] },
          history: [{ gameId: 'a', score: 5, points: 9, kos: 1, runs: 1, defeated: 9, at: 1 }],
          lang: 'en',
          langChosen: true,
        },
        version: 0,
      }),
    );
    await useGame.persist.rehydrate();
    const s = useGame.getState();
    expect(s.game).toBeNull();
    expect(s.saved).toBeNull();
    expect(s.history).toHaveLength(1);
    expect(s.lang).toBe('en');
  });

  it('rebuild devuelve null con acciones ilegales', () => {
    expect(rebuild({ seed: 'x', actions: [{ type: 'continue' }] })).toBeNull();
    // La partida empieza eligiendo color y después sale de expedición, no al pueblo
    expect(rebuild({ seed: 'x', actions: [] })?.phase).toBe('setup');
    expect(rebuild({ seed: 'x', actions: [{ type: 'start', die: 'blue' }] })?.phase).toBe('trail');
  });
});

describe('controles del combate', () => {
  it('relanzar conserva los dados seleccionados y relanza el resto', () => {
    useGame.getState().newGame();
    useGame.getState().act({ type: 'start', die: 'green' });
    useGame.getState().act({ type: 'follow', index: 0 });
    const combat = useGame.getState().game!.combat!;
    const keep = availableDice(combat).filter((d) => isRollable(d.kind))[0]!;
    useGame.getState().toggleDie(keep.id);
    useGame.getState().rerollRest();
    const after = useGame.getState().game!.combat!;
    const roll = after.log.filter((e) => e.type === 'roll').at(-1);
    expect(roll?.type === 'roll' && roll.dieIds).not.toContain(keep.id);
    expect(after.dice.find((d) => d.id === keep.id)).toEqual(keep);
    expect(after.dice.filter((d) => d.kind === 'white')).toHaveLength(1);
  });

  it('terminar la partida la guarda en el historial con su puntaje final', () => {
    useGame.getState().newGame();
    useGame.getState().act({ type: 'start', die: 'green' });
    useGame.getState().act({ type: 'return' });
    useGame.getState().act({ type: 'finish' });
    const s = useGame.getState();
    expect(s.game?.phase).toBe('over');
    expect(s.history[0]).toMatchObject({ runs: 1, score: -1 });
  });

  it('una acción inválida muestra un aviso y no cambia la partida', () => {
    useGame.getState().newGame();
    useGame.getState().act({ type: 'start', die: 'green' });
    const before = useGame.getState().game;
    useGame.getState().act({ type: 'continue' });
    expect(useGame.getState().game).toBe(before);
    expect(useGame.getState().toast).toMatch(/fase/);
    useGame.setState({ lang: 'en' });
    useGame.getState().act({ type: 'continue' });
    expect(useGame.getState().toast).toBe(translate('en', 'combat.invalid'));
  });
});

describe('partida guiada (V0 = tutorial del juego de mesa)', () => {
  const lessonNow = () => {
    const s = useGame.getState();
    return s.guideOn ? activeLesson(s.game, s.guideSeen) : null;
  };

  it('la primera partida es guiada y empieza por la expedición, como el juego de mesa', () => {
    useGame.getState().newGame();
    expect(useGame.getState().guideOn).toBe(true);
    expect(useGame.getState().game?.phase).toBe('setup');
    expect(lessonNow()?.id).toBe('hunt-welcome');
    useGame.getState().dismissLesson('hunt-welcome');
    // Lección "hazlo tú": elegir el color del cazador
    expect(lessonNow()?.id).toBe('setup-color');
    useGame.getState().act({ type: 'start', die: 'orange' });
    expect(useGame.getState().guideSeen).toContain('setup-color');
    expect(useGame.getState().game).toMatchObject({ phase: 'trail' });
    expect(useGame.getState().game?.dice).toContain('orange');
    const seen: string[] = [];
    while (lessonNow()?.advance === 'next') {
      seen.push(lessonNow()!.id);
      useGame.getState().dismissLesson(lessonNow()!.id);
    }
    expect(seen).toEqual(['hunt-dice', 'trail-hidden']);
    // Lección "hazlo tú": se cumple al seguir un rastro
    expect(lessonNow()?.id).toBe('trail-follow');
    useGame.getState().act({ type: 'follow', index: 0 });
    expect(useGame.getState().guideSeen).toContain('trail-follow');
    expect(lessonNow()?.id).toBe('combat-monster');
  });

  it('en combate explica el SNAC, los dados y cómo colocar uno', () => {
    useGame.getState().newGame(true);
    useGame.getState().act({ type: 'start', die: 'green' });
    useGame.getState().act({ type: 'follow', index: 0 });
    const ids: string[] = [];
    for (let i = 0; i < 3 && lessonNow()?.advance === 'next'; i++) {
      ids.push(lessonNow()!.id);
      useGame.getState().dismissLesson(lessonNow()!.id);
    }
    expect(ids[0]).toBe('combat-monster');
    expect(ids).toContain('combat-dice');
  });

  it('al volver al pueblo explica la recuperación y el puntaje; la última lección cierra la guía', () => {
    useGame.getState().newGame(true);
    useGame.getState().act({ type: 'start', die: 'green' });
    useGame.setState({
      guideSeen: guide
        .filter((l) => l.phase !== 'town' || !l.when.includes('returnVisit'))
        .map((l) => l.id),
    });
    useGame.getState().act({ type: 'return' });
    expect(lessonNow()?.id).toBe('town-return');
    for (let i = 0; i < 5 && lessonNow(); i++) useGame.getState().dismissLesson(lessonNow()!.id);
    expect(useGame.getState()).toMatchObject({ guideOn: false, tutorialDone: true });
  });

  it('después de terminar una partida, la nueva ya no es guiada; se puede saltar la guía', () => {
    useGame.setState({
      history: [{ gameId: 'a', score: 1, points: 1, kos: 0, runs: 0, defeated: 1, at: 1 }],
    });
    useGame.getState().newGame();
    expect(useGame.getState().guideOn).toBe(false);
    useGame.getState().newGame(true);
    useGame.getState().skipGuide();
    expect(lessonNow()).toBeNull();
  });
});

describe('i18n', () => {
  it('cada texto existe en español e inglés y las variables se sustituyen', () => {
    expect(translate('es', 'town.actions', { n: 1, max: 2 })).toBe('Acciones: 1/2');
    expect(translate('en', 'town.actions', { n: 1, max: 2 })).toBe('Actions: 1/2');
    expect(translate('en', 'combat.keepHint')).toBe(
      'Select the dice to keep, and re-roll the remaining.',
    );
    const key: MessageKey = 'face.Horn';
    expect([translate('es', key), translate('en', key)]).toEqual(['Hacha', 'Axe']);
  });
});

describe('resumen de analítica', () => {
  const ev = (type: string, at: number, sessionId: string, data = {}): AnalyticsEvent => ({
    type,
    at,
    sessionId,
    data,
  });

  it('mide la duración del tutorial aunque termine en otra sesión', () => {
    const s = summarize([
      ev('tutorial_start', 0, 'a'),
      ev('tutorial_complete', 120_000, 'b'),
      ev('combat_resolved', 120_000, 'b', { outcome: 'defeat', rerolls: 2 }),
      ev('dice_rolled', 1, 'a', { faces: ['Horn', 'heart', 'Horn', 'wild'] }),
    ]);
    expect(s.sessions).toBe(2);
    expect(s.avgTutorialSeconds).toBe(120);
    expect(s.outcomes).toEqual({ defeat: 1 });
    expect(s.avgRerolls).toBe(2);
    expect(s.faceShare.Horn).toBe(0.5);
  });
});
