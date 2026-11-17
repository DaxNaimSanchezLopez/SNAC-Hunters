import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { finalScore, runsUntilPielandHit, scoreBreakdown } from '@snac-hunters/engine';
import type { GameState } from '@snac-hunters/engine';
import { gameConfig, gameData } from '../game/config';
import { useGame } from '../game/store';
import { useT } from '../game/useT';
import { HpBar } from './HpBar';
import { Icon } from './Icon';
import { LogModal } from './LogModal';
import { QuestsModal } from './Quests';

/**
 * Barra superior de la partida: inicio, misiones, registro, puntaje en vivo y HPie. Feedback
 * 2026-11-11: solo el puntaje actual (el del run en curso, o el final si cayó el jefe) y el
 * mejor; ya no el número de runs.
 */
export function Hud({ game, glowHp = false }: { game: GameState; glowHp?: boolean }) {
  const t = useT();
  const goHome = useGame((s) => s.goHome);
  const [open, setOpen] = useState<'quests' | 'log' | null>(null);
  const current = game.run || game.bossDefeated ? scoreBreakdown(game, gameData).total : null;
  return (
    <div className="flex flex-col gap-1.5">
      <header className="flex items-center justify-between gap-1.5">
        <button
          type="button"
          onClick={goHome}
          className="min-h-[48px] min-w-[44px] shrink-0 rounded-xl bg-black/40 text-xl font-bold text-white"
          aria-label={t('hud.homeLabel')}
        >
          <Icon name="back" className="mx-auto h-6 w-6" />
        </button>
        <button
          type="button"
          data-guide-target="quests"
          onClick={() => setOpen('quests')}
          className="grid min-h-[48px] min-w-[44px] shrink-0 place-items-center rounded-xl bg-black/40"
          aria-label={t('hud.quests')}
          title={t('hud.quests')}
        >
          <img src="/assets/icons/quest.png" alt="" className="h-8 w-8 object-contain" />
        </button>
        <button
          type="button"
          onClick={() => setOpen('log')}
          className="grid min-h-[48px] min-w-[44px] shrink-0 place-items-center rounded-xl bg-black/40 text-white"
          aria-label={t('hud.log')}
          title={t('hud.log')}
        >
          <Icon name="list" className="h-6 w-6" />
        </button>
        <dl
          data-guide-target="hud"
          className="flex gap-2.5 rounded-full bg-black/40 px-3 py-1 text-center text-white"
        >
          <Stat label={t('hud.current')} value={current ?? '-'} />
          <Stat label={t('hud.best')} value={finalScore(game, gameData)} strong />
        </dl>
        <HpBar hp={game.hp} maxHp={game.maxHp} glow={glowHp} />
        <AnimatePresence>
          {open === 'quests' && <QuestsModal game={game} onClose={() => setOpen(null)} />}
          {open === 'log' && <LogModal onClose={() => setOpen(null)} />}
        </AnimatePresence>
      </header>
      <Threat game={game} />
    </div>
  );
}

/**
 * V1: las dos formas de perder — vidas del cazador y PV de Pieland. Feedback 2026-11-11: la
 * calavera derecha, blanca = vida disponible y negra = usada (PNG ya pintados, sin filtros).
 */
export function Threat({ game }: { game: GameState }) {
  const t = useT();
  const { lives, pieland } = game;
  const left = runsUntilPielandHit(game, gameData);
  return (
    <div
      data-guide-target="threat"
      className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-2xl bg-black/45 px-3 py-1 text-xs font-bold text-white"
    >
      <span className="flex items-center gap-1" aria-label={`${t('hud.lives')}: ${lives}`}>
        {t('hud.lives')}
        {Array.from({ length: gameConfig.lives }, (_, i) => (
          <img
            key={i}
            src={i < lives ? '/assets/icons/life.png' : '/assets/icons/life-used.png'}
            alt=""
            className="h-4 w-5 object-contain"
          />
        ))}
      </span>
      <span className="flex items-center gap-1" aria-label={`${t('hud.pieland')}: ${pieland.hp}`}>
        {t('hud.pieland')}
        {Array.from({ length: gameConfig.pieland.hp }, (_, i) => (
          <img
            key={i}
            src="/assets/icons/octopie-white.png"
            alt=""
            className={`h-4 w-4 object-contain ${i < pieland.hp ? '' : 'opacity-25'}`}
          />
        ))}
      </span>
      <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[11px]">
        {left === null
          ? t('hud.countdownSafe')
          : left <= 1
            ? t('hud.countdownNow')
            : t('hud.countdown', { n: left })}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  strong,
}: {
  label: string;
  value: number | string;
  strong?: boolean;
}) {
  return (
    <div className="flex flex-col-reverse leading-none">
      <dt className="text-[9px] uppercase opacity-80">{label}</dt>
      <dd className={`font-comic ${strong ? 'text-yellow-300' : ''}`}>{value}</dd>
    </div>
  );
}
