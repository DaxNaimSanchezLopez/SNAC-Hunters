import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  actionError,
  availableDice,
  canReroll as dieCanReroll,
  canRerollAny,
  canUndo,
  findAbility,
  isActive,
  isWhiteWild,
  pendingDamage,
  pendingHits,
  previewOutcome,
  rechargeTargets,
  resolveOptions,
  slotsForFace,
  trophyCapacity,
  validSlotsFor,
} from '@snac-hunters/engine';
import type { Ability, GameSymbol, ResolveOption } from '@snac-hunters/engine';
import { AbilityCard } from '../components/AbilityCard';
import { Button } from '../components/Button';
import { Coach } from '../components/Coach';
import { DieView, FaceIcon } from '../components/DieView';
import { HpBar } from '../components/HpBar';
import { Hud } from '../components/Hud';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { MonsterCard } from '../components/MonsterCard';
import { TrophySlot, TrophyToken } from '../components/Trophy';
import { diceTable, gameData, getAbility, tutorialSteps } from '../game/config';
import { outcomeName, SYMBOLS, typeName } from '../game/i18n';
import { currentCombat, useGame } from '../game/store';
import { useT } from '../game/useT';

function stepIndex(id: string): number {
  const i = tutorialSteps.findIndex((s) => s.id === id);
  return i < 0 ? 0 : i;
}

/**
 * Elegir trofeo: al derrotar/estudiar (opciones del monstruo, con el daño elegido) o con "tres
 * iguales" (cualquiera).
 */
type TrophyChoice =
  | {
      readonly kind: 'resolve';
      readonly damage: number;
      readonly outcome: ResolveOption['outcome'];
    }
  | { readonly kind: 'ability'; readonly id: string };

/** Decisión que dejaría KO: hay que tocarla dos veces (feedback 2026-10-27). */
type Lethal = 'reroll' | 'resolve';

export function CombatScreen() {
  const t = useT();
  const state = useGame();
  const {
    screen,
    game,
    selected,
    selectedTrophies,
    tutorialStep,
    toggleDie,
    selectTrophy,
    tapSlot,
    tapDamage,
    autoFill,
    heal,
    rerollRest,
    activateAbility,
    undoAbility,
    resolve,
    nextTutorialStep,
    goHome,
    act,
  } = state;
  const [choosing, setChoosing] = useState<TrophyChoice | null>(null);
  const [resolving, setResolving] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [armed, setArmed] = useState<Lethal | null>(null);
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
  // Feedback 2026-11-11: el espacio de daño es opcional; el engine da las formas de resolver
  const options = resolveOptions(combat);
  const best = options.at(-1);
  // El comodín blanco no se relanza: se queda en la bandeja (feedback 2026-11-03)
  const rerollCount = pool.filter((d) => dieCanReroll(d) && !selected.includes(d.id)).length;
  const whiteWild = pool.some(isWhiteWild);
  const slotCount = combat.monster.slots.length;
  const boss = combat.monster.boss === true;
  const whiteOnly = !canRerollAny(combat);

  const snacDamage = pendingDamage(combat);
  // Daño de los blancos: se recibe al relanzar o resolver, salvo el que tenga corazón encima
  const hits = pendingHits(combat);
  const whiteHits = hits.filter((h) => h.heart === null).length;
  const covered = combat.assignments.filter(Boolean).length + (best?.damage ?? 0);
  const kills = (o: ResolveOption) => whiteHits + o.damage >= combat.hp;
  // Avisos de KO: relanzar cobra el daño pendiente; resolver, también el daño que se elija
  const rerollKills = whiteHits >= combat.hp;
  const resolveKills = options.length > 0 && options.every(kills);
  const tokens = pool.some((d) => d.kind === 'token' && !d.color);

  // Con una sola pieza elegida (dado o trofeo) se iluminan los espacios donde cabe
  const picked = selected.length + selectedTrophies.length;
  const trophySymbol =
    picked === 1 && selectedTrophies[0] !== undefined
      ? (combat.trophies[selectedTrophies[0]] ?? null)
      : null;
  const lit =
    trophySymbol !== null
      ? slotsForFace(combat, trophySymbol)
      : picked === 1 && selected[0]
        ? validSlotsFor(combat, selected[0])
        : [];

  /** La primera vez que una decisión deja KO solo se avisa; la segunda, se confirma. */
  function confirmLethal(kind: Lethal, lethal: boolean, run: () => void) {
    if (lethal && armed !== kind) {
      setArmed(kind);
      return;
    }
    setArmed(null);
    run();
  }

  function finishResolve(option: ResolveOption) {
    setResolving(false);
    // Huir no da trofeo, y el jefe tampoco
    if (option.outcome === 'flee' || boss) resolve(undefined, option.damage);
    else setChoosing({ kind: 'resolve', damage: option.damage, outcome: option.outcome });
  }

  function onResolve() {
    if (options.length > 1) {
      setArmed(null);
      setResolving(true);
      return;
    }
    const [only] = options;
    if (only) confirmLethal('resolve', kills(only), () => finishResolve(only));
  }

  // Con un corazón elegido se iluminan los daños que puede cubrir
  const heartPicked =
    picked === 1 && selected[0] !== undefined
      ? pool.find((d) => d.id === selected[0])?.face === 'heart'
      : false;
  // Corazones elegidos: también sirven para curarse (feedback 2026-10-27)
  const hearts = pool.filter((d) => d.face === 'heart' && selected.includes(d.id)).length;
  const healable = Math.min(hearts, combat.maxHp - combat.hp);
  const capacity = game && !tutorial ? trophyCapacity(game, gameData) : 0;

  function onAbility(ability: Ability) {
    // Los símbolos pueden ser dados o trofeos: cuentan los dos
    if (ability.effect.type === 'triple' && picked === 3) {
      // Feedback 2026-11-11: validar antes de pedir el trofeo (un blanco vacío no sirve)
      const error = actionError(
        combat!,
        {
          type: 'ability',
          abilityId: ability.id,
          dieIds: selected,
          trophies: selectedTrophies,
          trophy: 'Horn',
        },
        diceTable,
      );
      if (error) activateAbility(ability.id, 'Horn');
      else setChoosing({ kind: 'ability', id: ability.id });
    } else {
      activateAbility(ability.id);
    }
  }

  function onTrophyChosen(symbol: GameSymbol) {
    const choice = choosing;
    setChoosing(null);
    if (choice?.kind === 'ability') activateAbility(choice.id, symbol);
    else resolve(symbol, choice?.kind === 'resolve' ? choice.damage : undefined);
  }

  const trophyOptions: readonly GameSymbol[] =
    choosing?.kind === 'ability' ? SYMBOLS : combat.monster.trophies;

  // Feedback 2026-11-11: todas las cartas del cazador, en gris las que no se pueden usar ahora
  const recharge = game && !tutorial ? rechargeTargets(game, gameData) : [];
  const cards: { ability: Ability; ready: boolean }[] =
    game && !tutorial
      ? [
          ...game.items.map((i) => ({ ability: findAbility(gameData, i.id), ready: i.ready })),
          ...game.skills.map((id) => ({ ability: findAbility(gameData, id), ready: true })),
        ]
      : combat.abilities.map((ability) => ({ ability, ready: true }));

  function cardProps(ability: Ability, ready: boolean) {
    if (ability.effect.type === 'recharge') {
      const usable = ready && recharge.length > 0;
      return {
        dimmed: !usable,
        badge: ready ? (usable ? t('combat.recharge') : undefined) : t('combat.itemSpent'),
        onClick: usable ? () => setCloning(true) : undefined,
      };
    }
    const listed = combat!.abilities.some((a) => a.id === ability.id);
    if (!isActive(ability)) return { dimmed: true, badge: t('combat.passive') };
    if (!ready && !listed) return { dimmed: true, badge: t('combat.itemSpent') };
    const used = combat!.usedAbilities.includes(ability.id);
    // Deshacer solo hasta relanzar (feedback 2026-10-27)
    const undoable = used && canUndo(combat!, ability.id);
    return {
      dimmed: used,
      badge: used ? t(undoable ? 'combat.undo' : 'combat.used') : undefined,
      onClick: undoable
        ? () => undoAbility(ability.id)
        : used
          ? undefined
          : () => onAbility(ability),
    };
  }

  return (
    <div className="flex min-h-[100dvh] flex-col gap-3 px-3 pt-3">
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
            <span className="flex items-center gap-1">
              <Icon name="back" className="h-5 w-5" />
              {t('hud.home')}
            </span>
          </button>
          <span className="rounded-full bg-black/40 px-3 py-1 font-comic text-white">
            {t('combat.tutorial')}
          </span>
          <HpBar hp={combat.hp} maxHp={combat.maxHp} glow={highlight === 'hp'} />
        </header>
      )}

      {/* En pantallas grandes: el monstruo a la izquierda y los dados y cartas a la derecha */}
      <div className="grid gap-3 md:grid-cols-2 md:items-start">
        <div className="flex flex-col gap-3 md:sticky md:top-3">
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
        </div>

        <div className="flex flex-col gap-3">
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
            <div className="mb-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={autoFill}
                disabled={pool.length === 0}
                aria-label={t('combat.autoLabel')}
                title={t('combat.autoLabel')}
                className="min-h-[40px] rounded-xl border-[3px] border-black bg-yellow-300 px-3 font-comic text-bark shadow-[0_3px_0_#000] active:translate-y-0.5 disabled:opacity-40"
              >
                {t('combat.auto')}
              </button>
              {healable > 0 && (
                <button
                  type="button"
                  onClick={heal}
                  className="flex min-h-[40px] items-center gap-1 rounded-xl border-[3px] border-black bg-die-red px-3 font-comic text-white shadow-[0_3px_0_#000] active:translate-y-0.5"
                >
                  <img src="/assets/icons/hp.png" alt="" className="h-5 w-5 object-contain" />
                  {t('combat.heal', { n: healable })}
                </button>
              )}
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
            {tokens && (
              <p className="mt-2 rounded-lg bg-amber-300/90 px-2 py-1 text-[11px] font-bold leading-tight text-bark">
                {t('combat.tempWild')}
              </p>
            )}
            {whiteWild && (
              <p className="mt-2 flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-[11px] font-bold leading-tight text-bark">
                <Icon name="lock" className="h-4 w-4" />
                {t('combat.whiteWild')}
              </p>
            )}
            {hits.length > 0 && (
              <div
                data-guide-target="pending"
                className="mt-3 rounded-2xl border-2 border-dashed border-red-300 bg-red-950/40 p-2"
              >
                <p className="text-xs font-bold text-red-100">{t('combat.pending')}</p>
                <p className="mb-2 text-[11px] leading-tight text-white/75">
                  {t('combat.pendingHint')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {hits.map(({ die, heart }) => (
                    <button
                      key={die.id}
                      type="button"
                      onClick={() => tapDamage(die.id)}
                      aria-label={heart ? t('combat.covered') : t('combat.uncovered')}
                      className={`relative min-h-[48px] min-w-[48px] rounded-xl ${
                        heartPicked && !heart ? 'ring-4 ring-yellow-300' : ''
                      }`}
                    >
                      <DieView die={die} />
                      {heart && (
                        <span className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-lg border-2 border-black bg-die-red">
                          <FaceIcon face="heart" className="h-4 w-4" />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {spent.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1">
                <span className="mr-1 text-xs text-white/70">{t('combat.spent')}</span>
                {spent.map((d) => (
                  <DieView key={d.id} die={d} small dimmed />
                ))}
              </div>
            )}
          </section>

          {!tutorial && capacity > 0 && (
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
                    selected={selectedTrophies.includes(i)}
                    onClick={() => selectTrophy(i)}
                  />
                ))}
                {/* Espacios libres del inventario: se empieza con 2 */}
                {Array.from(
                  { length: Math.max(0, capacity - (game?.trophies.length ?? 0)) },
                  (_, i) => (
                    <TrophySlot key={`empty-${i}`} />
                  ),
                )}
              </div>
            </section>
          )}

          {!tutorial && cards.length > 0 && (
            <section
              aria-label={t('combat.abilities')}
              data-guide-target="abilities"
              className="rounded-3xl border-4 border-black bg-black/45 p-3"
            >
              <h3 className="font-comic text-lg text-white">{t('combat.abilities')}</h3>
              <p className="mb-2 text-xs text-white/75">{t('combat.abilityHint')}</p>
              {/* Feedback 2026-11-11: en columna, sin desplazamiento horizontal */}
              <div className="flex flex-col gap-2">
                {cards.map(({ ability, ready }) => (
                  <AbilityCard
                    key={ability.id}
                    ability={ability}
                    row
                    {...cardProps(ability, ready)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Zona del pulgar: acciones principales pegadas a la interfaz (feedback 2026-11-11) */}
      <footer className="sticky bottom-0 z-20 -mx-3 mt-auto border-t-4 border-black bg-bark/95 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 md:mx-0 md:rounded-t-3xl md:border-x-4">
        <div className="mx-auto grid max-w-xl grid-cols-2 gap-3">
          <Button
            variant={rerollKills ? 'danger' : 'secondary'}
            onClick={() => confirmLethal('reroll', rerollKills, rerollRest)}
            data-guide-target="reroll"
            // Feedback final: conservar todo y relanzar solo los dados blancos también se puede
            disabled={!canReroll}
            className={highlight === 'reroll' ? 'ring-4 ring-yellow-300' : ''}
          >
            {whiteOnly || rerollCount === 0
              ? t('combat.rerollWhite')
              : `${t('combat.reroll')} (${rerollCount})`}
            <span className="block font-sans text-xs">
              {rerollKills
                ? t(armed === 'reroll' ? 'combat.koConfirm' : 'combat.koWarning')
                : t('combat.rerollHint') +
                  (whiteHits > 0 ? ` · ${t('combat.hit', { n: whiteHits })}` : '')}
            </span>
          </Button>
          <Button
            variant={resolveKills ? 'danger' : 'primary'}
            onClick={onResolve}
            data-guide-target="resolve"
            disabled={!canResolve || preview === null}
            className={highlight === 'resolve' ? 'ring-4 ring-white' : ''}
          >
            {best ? outcomeName(t, best.outcome) : t('combat.resolve')}
            <span className="block font-sans text-xs">
              {resolveKills
                ? t(armed === 'resolve' ? 'combat.koConfirm' : 'combat.koWarning')
                : best
                  ? t('combat.spaces', { n: covered, max: slotCount }) +
                    (options.length > 1
                      ? ` · ${t('combat.resolveTitle')}`
                      : best.damage + whiteHits > 0
                        ? ` · ${t('combat.hit', { n: best.damage + whiteHits })}`
                        : '')
                  : t('combat.resolveHint')}
            </span>
          </Button>
        </div>
      </footer>

      <AnimatePresence>
        {resolving && (
          <Modal title={t('combat.resolveTitle')} onClose={() => setResolving(false)}>
            {snacDamage > 0 && <p className="text-sm text-bark/70">{t('combat.resolveHelp')}</p>}
            <table className="mt-3 w-full border-separate border-spacing-y-2 text-left">
              <thead className="text-xs uppercase text-bark/70">
                <tr>
                  <th className="px-2">{t('combat.option')}</th>
                  <th className="px-2">{t('combat.optionDamage')}</th>
                </tr>
              </thead>
              <tbody>
                {options.map((o) => {
                  const total = o.damage + whiteHits;
                  const lethal = kills(o);
                  return (
                    <tr key={o.outcome}>
                      <td colSpan={2}>
                        <button
                          type="button"
                          onClick={() => finishResolve(o)}
                          className={`grid min-h-[52px] w-full grid-cols-2 items-center rounded-2xl border-[3px] border-black px-3 text-left font-comic shadow-[0_3px_0_#000] active:translate-y-0.5 ${
                            lethal ? 'bg-die-red text-white' : 'bg-white text-bark'
                          }`}
                        >
                          <span>{outcomeName(t, o.outcome)}</span>
                          <span>
                            {total === 0 ? t('combat.noDamage') : t('combat.damage', { n: total })}
                            {lethal && (
                              <span className="block font-sans text-xs">
                                {t('combat.koWarning')}
                              </span>
                            )}
                          </span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Button variant="secondary" className="mt-2 w-full" onClick={() => setResolving(false)}>
              {t('town.cancel')}
            </Button>
          </Modal>
        )}
        {cloning && game && (
          <Modal title={t('combat.rechargeTitle')} onClose={() => setCloning(false)}>
            <p className="text-sm text-bark/70">{t('combat.rechargeText')}</p>
            <div className="mt-3 grid gap-2">
              {recharge.length === 0 && (
                <p className="text-sm text-bark/70">{t('combat.noRecharge')}</p>
              )}
              {recharge.map((id) => {
                const ability = getAbility(id);
                if (!ability) return null;
                return (
                  <AbilityCard
                    key={id}
                    ability={ability}
                    onClick={() => {
                      setCloning(false);
                      act({ type: 'recharge', target: id });
                    }}
                  />
                );
              })}
            </div>
            <Button variant="secondary" className="mt-3 w-full" onClick={() => setCloning(false)}>
              {t('town.cancel')}
            </Button>
          </Modal>
        )}
        {choosing && (
          <Modal title={t('combat.chooseTrophy')} onClose={() => setChoosing(null)}>
            <p className="text-sm text-bark/70">
              {choosing.kind === 'ability' || choosing.outcome === 'defeat'
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
