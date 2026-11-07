import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { finalScore, scoreBreakdown } from '@snac-hunters/engine';
import type { GameState } from '@snac-hunters/engine';
import { gameData } from '../game/config';
import { useGame } from '../game/store';
import { useT } from '../game/useT';
import { HpBar } from './HpBar';
import { Icon } from './Icon';
import { QuestsModal } from './Quests';

/**
 * Barra superior de la partida: inicio, misiones, puntaje en vivo y HPie. El puntaje sigue la
 * sección 3 del feedback (2026-11-03): el de la expedición en curso, el de la mejor y el de la
 * partida (el mejor run, o el final si cayó el jefe).
 */
export function Hud({ game, glowHp = false }: { game: GameState; glowHp?: boolean }) {
  const t = useT();
  const goHome = useGame((s) => s.goHome);
  const [questsOpen, setQuestsOpen] = useState(false);
  const run = game.run ? scoreBreakdown(game, gameData).total : null;
  return (
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
        onClick={() => setQuestsOpen(true)}
        className="grid min-h-[48px] min-w-[44px] shrink-0 place-items-center rounded-xl bg-black/40"
        aria-label={t('hud.quests')}
        title={t('hud.quests')}
      >
        <img src="/assets/icons/quest.png" alt="" className="h-8 w-8 object-contain" />
      </button>
      <dl
        data-guide-target="hud"
        className="flex gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-center text-white"
      >
        <Stat label={t('hud.runs')} value={game.runs} />
        <Stat label={t('hud.run')} value={run ?? '-'} />
        <Stat label={t('hud.best')} value={game.bestRun?.total ?? 0} />
        <Stat label={t('hud.score')} value={finalScore(game, gameData)} strong />
      </dl>
      <HpBar hp={game.hp} maxHp={game.maxHp} glow={glowHp} />
      <AnimatePresence>
        {questsOpen && <QuestsModal game={game} onClose={() => setQuestsOpen(false)} />}
      </AnimatePresence>
    </header>
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
