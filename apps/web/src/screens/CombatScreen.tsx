import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { availableDice, previewOutcome, validSlotsFor } from '@snac-hunters/engine';
import type { GameSymbol } from '@snac-hunters/engine';
import { Button } from '../components/Button';
import { Coach } from '../components/Coach';
import { DieView } from '../components/DieView';
import { HpBar } from '../components/HpBar';
import { MonsterCard } from '../components/MonsterCard';
import { tutorialSteps } from '../game/config';
import { useGame } from '../game/store';

const OUTCOME_LABEL = { defeat: 'Derrotar', study: 'Estudiar', flee: 'Huir' } as const;

export const TROPHY_IMG = (s: GameSymbol) => `/assets/trophies/${s.toLowerCase()}.png`;

function stepIndex(id: string): number {
  const i = tutorialSteps.findIndex((s) => s.id === id);
  return i < 0 ? 0 : i;
}

export function CombatScreen() {
  const {
    combat,
    active,
    selected,
    tutorialStep,
    toggleDie,
    tapSlot,
    reroll,
    resolve,
    nextTutorialStep,
    goHome,
  } = useGame();
  const [choosingTrophy, setChoosingTrophy] = useState(false);
  if (!combat || !active) return null;

  const tutorial = active.mode === 'tutorial';
  const step = tutorial ? tutorialSteps[tutorialStep] : undefined;
  const highlight = step?.highlight;
  // En el tutorial se desbloquean los botones a medida que se explican
  const canReroll = !tutorial || tutorialStep >= stepIndex('reroll');
  const canResolve = !tutorial || tutorialStep >= stepIndex('outcomes');

  const pool = availableDice(combat);
  const spent = combat.dice.filter((d) => combat.spent.includes(d.id));
  const preview = previewOutcome(combat);
  const lit = selected.length === 1 && selected[0] ? validSlotsFor(combat, selected[0]) : [];

  function onResolve() {
    if (preview === 'flee') resolve();
    else setChoosingTrophy(true);
  }

  return (
    <div className="flex min-h-[100dvh] flex-col gap-3 px-3 pb-36 pt-3">
      <header className="flex items-center justify-between">
        <button
          type="button"
          onClick={goHome}
          className="min-h-[48px] rounded-xl bg-black/40 px-3 text-sm font-bold text-white"
          aria-label="Volver al inicio"
        >
          ← Salir
        </button>
        <span className="rounded-full bg-black/40 px-3 py-1 font-comic text-white">
          {tutorial ? 'Tutorial' : 'Sherbert Forest'}
        </span>
        <HpBar hp={combat.hp} maxHp={combat.maxHp} glow={highlight === 'hp'} />
      </header>

      <MonsterCard
        combat={combat}
        highlightSlots={lit}
        onSlot={tapSlot}
        glow={highlight === 'monster'}
      />

      {tutorial && (
        <Coach
          step={step}
          index={tutorialStep}
          total={tutorialSteps.length}
          onNext={nextTutorialStep}
        />
      )}

      <section
        aria-label="Tu reserva de dados"
        className={`rounded-3xl border-4 border-black bg-black/45 p-3 ${highlight === 'dice' ? 'ring-4 ring-yellow-300' : ''}`}
      >
        <div className="mb-2 flex items-baseline justify-between text-white">
          <h3 className="font-comic text-lg">Tu reserva</h3>
          <span className="text-xs opacity-80">
            Relanzamientos: {combat.rerolls} · Dados blancos:{' '}
            {combat.dice.filter((d) => d.kind === 'white').length}
          </span>
        </div>
        <div className="flex min-h-[64px] flex-wrap gap-2">
          {pool.map((d) => (
            <DieView
              key={d.id}
              die={d}
              selected={selected.includes(d.id)}
              onClick={() => toggleDie(d.id)}
            />
          ))}
          {pool.length === 0 && (
            <p className="text-sm text-white/70">No te quedan dados en la reserva.</p>
          )}
        </div>
        {spent.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1">
            <span className="mr-1 text-xs text-white/70">Gastados:</span>
            {spent.map((d) => (
              <DieView key={d.id} die={d} small dimmed />
            ))}
          </div>
        )}
      </section>

      {/* Zona del pulgar: acciones principales fijas abajo */}
      <footer className="fixed inset-x-0 bottom-0 z-20 border-t-4 border-black bg-bark/95 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
          <Button
            variant="secondary"
            onClick={reroll}
            disabled={!canReroll || selected.length === 0}
            className={highlight === 'reroll' ? 'ring-4 ring-yellow-300' : ''}
          >
            Relanzar {selected.length > 0 ? `(${selected.length})` : ''}
            <span className="block text-xs font-sans">+1 dado blanco</span>
          </Button>
          <Button
            onClick={onResolve}
            disabled={!canResolve || preview === null}
            className={highlight === 'resolve' ? 'ring-4 ring-white' : ''}
          >
            {preview ? OUTCOME_LABEL[preview] : 'Resolver'}
            <span className="block text-xs font-sans">
              {preview
                ? `${combat.assignments.filter(Boolean).length}/4 espacios`
                : 'cubre 1+ espacios'}
            </span>
          </Button>
        </div>
      </footer>

      <AnimatePresence>
        {choosingTrophy && (
          <motion.div
            className="fixed inset-0 z-30 grid place-items-end bg-black/60 p-3 sm:place-items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setChoosingTrophy(false)}
          >
            <motion.div
              initial={{ y: 80 }}
              animate={{ y: 0 }}
              className="w-full max-w-md rounded-3xl border-4 border-black bg-sherbet p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-comic text-2xl text-bark">Elige tu trofeo</h3>
              <p className="text-sm text-bark/70">
                {preview === 'defeat' ? '¡Derrotaste al SNAC!' : 'Estudiaste al SNAC; escapará.'}{' '}
                Los trofeos sustituyen símbolos y se gastan en el pueblo.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {combat.monster.trophies.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setChoosingTrophy(false);
                      resolve(t);
                    }}
                    className="rounded-2xl border-[3px] border-black bg-white p-2 shadow-[0_4px_0_#000] active:translate-y-1"
                  >
                    <img
                      src={TROPHY_IMG(t)}
                      alt={`Trofeo ${t}`}
                      className="mx-auto h-24 object-contain"
                    />
                    <span className="font-comic">{t}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
