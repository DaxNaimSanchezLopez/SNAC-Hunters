// Integración: persistencia del progreso, sesiones interrumpidas y estado corrupto.
// En jsdom no hay IndexedDB, así que idbStorage usa su respaldo en memoria (mismo contrato).
import { describe, it, expect, beforeEach } from 'vitest';
import { availableDice, validSlotsFor } from '@snac-hunters/engine';
import { summarize } from '../game/analytics';
import type { AnalyticsEvent } from '../game/analytics';
import { idbStorage } from '../game/persistence';
import { rebuild, useGame } from '../game/store';

const KEY = 'snac-hunters:v1';

beforeEach(async () => {
  await idbStorage.removeItem(KEY);
  useGame.setState({ screen: 'home', active: null, combat: null });
});

describe('persistencia del juego', () => {
  it('guarda solo seed + acciones y reanuda el combate tras recargar', async () => {
    const game = useGame.getState();
    game.startTutorial();
    const combat = useGame.getState().combat!;
    const die = availableDice(combat).find((d) => validSlotsFor(combat, d.id).length > 0)!;
    game.toggleDie(die.id);
    useGame.getState().tapSlot(validSlotsFor(combat, die.id)[0]!);

    const saved = JSON.parse((await idbStorage.getItem(KEY))!) as {
      state: Record<string, unknown>;
    };
    expect(Object.keys(saved.state).sort()).toEqual(['active', 'progress', 'tutorialStep']);

    // "Cerrar el navegador": se borra el estado en memoria y se rehidrata desde el almacenamiento
    const snapshot = (await idbStorage.getItem(KEY))!;
    useGame.setState({ combat: null, active: null, screen: 'home' });
    await idbStorage.setItem(KEY, snapshot);
    await useGame.persist.rehydrate();
    const resumed = useGame.getState();
    expect(resumed.screen).toBe('combat');
    expect(resumed.combat?.assignments.filter(Boolean)).toHaveLength(1);
    expect(resumed.combat?.dice).toEqual(combat.dice);
  });

  it('descarta un combate guardado corrupto sin romper el progreso', async () => {
    await idbStorage.setItem(
      KEY,
      JSON.stringify({
        state: {
          active: {
            mode: 'hunt',
            monsterId: 'beeholder',
            seed: 'x',
            actions: [{ type: 'assign', dieId: 'd99', slot: 0 }],
            recorded: false,
          },
          progress: { points: 7 },
          tutorialStep: 3,
        },
        version: 0,
      }),
    );
    await useGame.persist.rehydrate();
    const s = useGame.getState();
    expect(s.active).toBeNull();
    expect(s.screen).toBe('home');
    expect(s.progress.points).toBe(7);
    expect(s.progress.trophies).toEqual({});
  });

  it('rebuild devuelve null con monstruo inexistente', () => {
    expect(
      rebuild({ mode: 'hunt', monsterId: 'nope', seed: 'x', actions: [], recorded: false }),
    ).toBeNull();
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
