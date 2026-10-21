import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  availableDice,
  canRerollAny,
  isRollable,
  previewOutcome,
  slotsForFace,
  validSlotsFor,
} from '@snac-hunters/engine';
import type { Ability, GameSymbol } from '@snac-hunters/engine';
import { AbilityCard } from '../components/AbilityCard';
import { Button } from '../components/Button';
import { Coach } from '../components/Coach';
import { DieView } from '../components/DieView';
import { HpBar } from '../components/HpBar';
import { Hud } from '../components/Hud';
import { Modal } from '../components/Modal';
import { MonsterCard } from '../components/MonsterCard';
import { TrophyToken } from '../components/Trophy';
import { tutorialSteps } from '../game/config';
import { outcomeName, SYMBOLS, typeName } from '../game/i18n';
import { currentCombat, useGame } from '../game/store';
import { useT } from '../game/useT';

function stepIndex(id: string): number {
  const i = tutorialSteps.findIndex((s) => s.id === id);
  return i < 0 ? 0 : i;
}

/** Elegir trofeo: al derrotar/estudiar (opciones del monstruo) o con "tres iguales" (cualquiera). */
type TrophyChoice =
  { readonly kind: 'resolve' } | { readonly kind: 'ability'; readonly id: string };

export function CombatScreen() {
  const t = useT();
  const state = useGame();
  const {
    screen,
    game,
    selected,
    selectedTrophy,
    tutorialStep,
    toggleDie,
    selectTrophy,
    tapSlot,
    rerollRest,
    activateAbility,
    resolve,
    nextTutorialStep,
    goHome,
  } = state;
  const [choosing, setChoosing] = useState<TrophyChoice | null>(null);
  const combat = currentCombat(state);
  if (!combat) return null;

  const tutorial = screen === 'tutorial';
  const step = tutorial ? tutorialSteps[tutorialStep] : undefined;
  const highlight = step?.highlight;
  // En el tutorial se desbloquean los botones a medida que se explican
  const canReroll = !tutorial || tutorialStep >= stepIndex('reroll');
  const canResolve = !tutorial || tutorialStep >= stepIndex('outcomes');

  const pool = availableDice(combat);
  const spent = combat.dice.filter((d) => combat.spent.includes(d.id));
  const preview = previewOutcome(combat);
  const rerollCount = pool.filter((d) => isRollable(d.kind) && !selected.includes(d.id)).length;
  const whiteOnly = !canRerollAny(combat);

  const selectedTrophySymbol =
    selectedTrophy !== null ? (combat.trophies[selectedTrophy] ?? null) : null;
  const lit =
    selectedTrophySymbol !== null
      ? slotsForFace(combat, selectedTrophySymbol)
      : selected.length === 1 && selected[0]
        ? validSlotsFor(combat, selected[0])
        : [];

  function onResolve() {
    if (preview === 'flee') resolve();
    else setChoosing({ kind: 'resolve' });
  }

  function onAbility(ability: Ability) {
    if (ability.effect.type === 'triple' && selected.length === 3) {
      setChoosing({ kind: 'ability', id: ability.id });
    } else {
      activateAbility(ability.id);
    }
  }

  function onTrophyChosen(symbol: GameSymbol) {
    const choice = choosing;
    setChoosing(null);
    if (choice?.kind === 'ability') activateAbility(choice.id, symbol);
    else resolve(symbol);
  }

  const trophyOptions: readonly GameSymbol[] =
    choosing?.kind === 'ability' ? SYMBOLS : combat.monster.trophies;

  return (
    <div className="flex min-h-[100dvh] flex-col gap-3 px-3 pb-36 pt-3">
      {game && !tutorial ? (
        <Hud game={{ ...game, hp: combat.hp }} glowHp={highlight === 'hp'} />
      ) : (
        <header className="flex items-center justify-between">
          <button
            type="button"
            onClick={goHome}
            className="min-h-[48px] rounded-xl bg-black/40 px-3 text-sm font-bold text-white"
            aria-label={t('hud.homeLabel')}
          >
            {t('hud.home')}
          </button>
          <span className="rounded-full bg-black/40 px-3 py-1 font-comic text-white">
            {t('combat.tutorial')}
          </span>
          <HpBar hp={combat.hp} maxHp={combat.maxHp} glow={highlight === 'hp'} />
        </header>
      )}

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
        aria-label={t('combat.pool')}
        data-guide-target="dice"
        className={`rounded-3xl border-4 border-black bg-black/45 p-3 ${highlight === 'dice' ? 'ring-4 ring-yellow-300' : ''}`}
      >
        <div className="mb-1 flex items-baseline justify-between text-white">
          <h3 className="font-comic text-lg">{t('combat.pool')}</h3>
          {/* Feedback V0: solo importa cuántos dados quedan, no cuántas veces se relanzó */}
          <span className="text-sm font-bold">{t('combat.available', { n: pool.length })}</span>
        </div>
        <p className="mb-2 text-xs text-white/75">{t('combat.keepHint')}</p>
        <div className="flex min-h-[64px] flex-wrap gap-2">
          <AnimatePresence mode="popLayout">
            {pool.map((d) => (
              <DieView
                key={d.id}
                die={d}
                selected={selected.includes(d.id)}
                onClick={() => toggleDie(d.id)}
              />
            ))}
          </AnimatePresence>
          {pool.length === 0 && <p className="text-sm text-white/70">{t('combat.noDice')}</p>}
        </div>
        {spent.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1">
            <span className="mr-1 text-xs text-white/70">{t('combat.spent')}</span>
            {spent.map((d) => (
              <DieView key={d.id} die={d} small dimmed />
            ))}
          </div>
        )}
      </section>

      {!tutorial && combat.trophies.length > 0 && (
        <section
          aria-label={t('combat.trophies')}
          data-guide-target="trophies"
          className="rounded-3xl border-4 border-black bg-black/45 p-3"
        >
          <h3 className="font-comic text-lg text-white">{t('combat.trophies')}</h3>
          <p className="mb-1 text-xs text-white/75">{t('combat.trophiesHint')}</p>
          <div className="flex flex-wrap gap-2">
            {combat.trophies.map((s, i) => (
              <TrophyToken
                key={`${s}-${i}`}
                symbol={s}
                selected={selectedTrophy === i}
                onClick={() => selectTrophy(i)}
              />
            ))}
          </div>
        </section>
      )}

      {!tutorial && combat.abilities.length > 0 && (
        <section
          aria-label={t('combat.abilities')}
          data-guide-target="abilities"
          className="rounded-3xl border-4 border-black bg-black/45 p-3"
        >
          <h3 className="font-comic text-lg text-white">{t('combat.abilities')}</h3>
          <p className="mb-2 text-xs text-white/75">{t('combat.abilityHint')}</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {combat.abilities.map((a) => {
              const used = combat.usedAbilities.includes(a.id);
              return (
                <AbilityCard
                  key={a.id}
                  ability={a}
                  compact
                  dimmed={used}
                  badge={used ? t('combat.used') : undefined}
                  onClick={used ? undefined : () => onAbility(a)}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Zona del pulgar: acciones principales fijas abajo */}
      <footer className="fixed inset-x-0 bottom-0 z-20 border-t-4 border-black bg-bark/95 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
          <Button
            variant="secondary"
            onClick={rerollRest}
            data-guide-target="reroll"
            disabled={!canReroll || (rerollCount === 0 && !whiteOnly)}
            className={highlight === 'reroll' ? 'ring-4 ring-yellow-300' : ''}
          >
            {whiteOnly ? t('combat.rerollWhite') : `${t('combat.reroll')} (${rerollCount})`}
            <span className="block font-sans text-xs">{t('combat.rerollHint')}</span>
          </Button>
          <Button
            onClick={onResolve}
            data-guide-target="resolve"
            disabled={!canResolve || preview === null}
            className={highlight === 'resolve' ? 'ring-4 ring-white' : ''}
          >
            {preview ? outcomeName(t, preview) : t('combat.resolve')}
            <span className="block font-sans text-xs">
              {preview
                ? t('combat.spaces', { n: combat.assignments.filter(Boolean).length })
                : t('combat.resolveHint')}
            </span>
          </Button>
        </div>
      </footer>

      <AnimatePresence>
        {choosing && (
          <Modal title={t('combat.chooseTrophy')} onClose={() => setChoosing(null)}>
            <p className="text-sm text-bark/70">
              {choosing.kind === 'ability' || preview === 'defeat'
                ? t('combat.defeatText')
                : t('combat.studyText')}{' '}
              {choosing.kind === 'ability' ? t('combat.anyTrophy') : t('combat.trophyUse')}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {trophyOptions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onTrophyChosen(s)}
                  className="rounded-2xl border-[3px] border-black bg-white p-2 shadow-[0_4px_0_#000] active:translate-y-1"
                >
                  <img
                    src={`/assets/trophies/${s.toLowerCase()}.png`}
                    alt=""
                    className="mx-auto h-20 object-contain"
                  />
                  <span className="font-comic">
                    {t('result.trophy', { symbol: typeName(t, s) })}
                  </span>
                </button>
              ))}
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
