import { finalScore, findQuest } from '@snac-hunters/engine';
import type { GameState } from '@snac-hunters/engine';
import { gameConfig, gameData } from '../game/config';
import { typeName } from '../game/i18n';
import { useGame } from '../game/store';
import { useT } from '../game/useT';
import { HpBar } from './HpBar';

/** Barra superior de la partida: inicio, puntaje en vivo, HPie, vidas y Pieland. */
export function Hud({ game, glowHp = false }: { game: GameState; glowHp?: boolean }) {
  const t = useT();
  const goHome = useGame((s) => s.goHome);
  return (
    <div className="flex flex-col gap-1.5">
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={goHome}
          className="min-h-[48px] min-w-[48px] shrink-0 rounded-xl bg-black/40 text-xl font-bold text-white"
          aria-label={t('hud.homeLabel')}
        >
          ←
        </button>
        <dl
          data-guide-target="hud"
          className="flex gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-center text-white"
        >
          <Stat label={t('hud.points')} value={game.points} />
          <Stat label={t('hud.kos')} value={game.kos} />
          <Stat label={t('hud.runs')} value={game.runs} />
          <Stat label={t('hud.score')} value={finalScore(game, gameData)} strong />
        </dl>
        <HpBar hp={game.hp} maxHp={game.maxHp} glow={glowHp} />
      </header>
      <Threat game={game} />
    </div>
  );
}

/** V1: las dos formas de perder — vidas del cazador y PV de Pieland con su cuenta regresiva. */
export function Threat({ game }: { game: GameState }) {
  const t = useT();
  const { lives, pieland } = game;
  return (
    <div
      data-guide-target="threat"
      className="flex items-center justify-between gap-2 rounded-full bg-black/45 px-3 py-1 text-xs font-bold text-white"
    >
      <span className="flex items-center gap-1" aria-label={`${t('hud.lives')}: ${lives}`}>
        {t('hud.lives')}
        {Array.from({ length: gameConfig.lives }, (_, i) => (
          <img
            key={i}
            src="/assets/icons/skull.png"
            alt=""
            className={`h-4 w-4 object-contain ${i < lives ? 'invert' : 'opacity-25'}`}
          />
        ))}
      </span>
      <span className="flex items-center gap-1" aria-label={`${t('hud.pieland')}: ${pieland.hp}`}>
        {t('hud.pieland')}
        {Array.from({ length: gameConfig.pieland.hp }, (_, i) => (
          <img
            key={i}
            src="/assets/icons/octopie.png"
            alt=""
            className={`h-4 w-4 object-contain invert ${i < pieland.hp ? '' : 'opacity-25'}`}
          />
        ))}
      </span>
      <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[11px]">
        {t('hud.countdown', { n: pieland.left })}
      </span>
    </div>
  );
}

/** Carta de misión secreta con su arte y qué da puntos (traducido). */
export function QuestCard({ game, compact = false }: { game: GameState; compact?: boolean }) {
  const t = useT();
  const quest = findQuest(gameData, game.quest);
  return (
    <div data-guide-target="quest" className="flex items-center gap-3 rounded-2xl p-1">
      <img
        src={`/assets/quests/${quest.id}.png`}
        alt={quest.name}
        className={`${compact ? 'h-24' : 'h-32'} shrink-0 rounded-lg border-2 border-black object-contain`}
      />
      <div className="text-white">
        <p className="font-comic text-lg leading-tight">
          {t('quest.title')}: {quest.name}
        </p>
        <p className="text-xs text-white/80">
          {t('quest.text', {
            type: typeName(t, quest.monsterType),
            a: typeName(t, quest.symbols[0]),
            b: typeName(t, quest.symbols[1]),
          })}
        </p>
      </div>
    </div>
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
