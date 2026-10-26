import { finalScore } from '@snac-hunters/engine';
import type { GameState } from '@snac-hunters/engine';
import { gameConfig } from '../game/config';
import { useGame } from '../game/store';
import { useT } from '../game/useT';
import { HpBar } from './HpBar';
import { Icon } from './Icon';

/** Barra superior de la partida: inicio, puntaje en vivo y HPie. */
export function Hud({ game, glowHp = false }: { game: GameState; glowHp?: boolean }) {
  const t = useT();
  const goHome = useGame((s) => s.goHome);
  return (
    <header className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={goHome}
        className="min-h-[48px] min-w-[48px] shrink-0 rounded-xl bg-black/40 text-xl font-bold text-white"
        aria-label={t('hud.homeLabel')}
      >
        <Icon name="back" className="mx-auto h-6 w-6" />
      </button>
      <dl
        data-guide-target="hud"
        className="flex gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-center text-white"
      >
        <Stat label={t('hud.points')} value={game.points} />
        <Stat label={t('hud.kos')} value={game.kos} />
        <Stat label={t('hud.runs')} value={game.runs} />
        <Stat label={t('hud.score')} value={finalScore(game, gameConfig)} strong />
      </dl>
      <HpBar hp={game.hp} maxHp={game.maxHp} glow={glowHp} />
    </header>
  );
}

function Stat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex flex-col-reverse leading-none">
      <dt className="text-[9px] uppercase opacity-80">{label}</dt>
      <dd className={`font-comic ${strong ? 'text-yellow-300' : ''}`}>{value}</dd>
    </div>
  );
}
