import { motion } from 'framer-motion';
import { finalScore, questTrophiesHeld, scoreBreakdown } from '@snac-hunters/engine';
import type { GameState } from '@snac-hunters/engine';
import { Button } from '../components/Button';
import { ServerBadge } from '../components/ServerBadge';
import { gameConfig, gameData } from '../game/config';
import { useGame } from '../game/store';
import { useT } from '../game/useT';

/**
 * Pantalla de puntaje (feedback del cliente, 2026-11-03, sección 3). Con el jefe derrotado:
 *   (puntos de cadena + misión × 10 + trofeos de misión × 10 + HPie × 10) × multiplicador.
 * Sin derrotarlo: el mejor run, sin HPie ni multiplicador.
 */
export function OverScreen({ game }: { game: GameState }) {
  const t = useT();
  const { newGame, goHome } = useGame();
  const { questKill, questTrophy, hp: hpValue } = gameConfig.scoring;
  const final = game.bossDefeated ? scoreBreakdown(game, gameData) : null;
  const best = game.bestRun;
  const parts = final ?? best;
  const questTrophies = final ? questTrophiesHeld(game, gameData) : (best?.questTrophies ?? 0);
  const rows = parts
    ? [
        { label: t('over.hunt'), value: parts.hunt },
        {
          label: t('over.questKills', { n: parts.questKills }),
          value: parts.questKills * questKill,
        },
        {
          label: t('over.questTrophies', { n: questTrophies }),
          value: questTrophies * questTrophy,
        },
        ...(final ? [{ label: t('over.hp', { n: final.hp }), value: final.hp * hpValue }] : []),
        ...(parts.cards > 0 ? [{ label: t('over.cards'), value: parts.cards }] : []),
        ...(final
          ? [{ label: t('over.multiplier', { runs: game.runs }), value: `×${final.multiplier}` }]
          : []),
      ]
    : [];

  return (
    <div className="flex min-h-[100dvh] flex-col justify-center gap-4 px-4 py-6">
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="rounded-3xl border-4 border-black bg-sherbet p-5 text-center shadow-[0_6px_0_#000]"
      >
        <img
          src={
            game.bossDefeated
              ? `/assets/monsters/${gameConfig.boss.id}.png`
              : '/assets/huntmaster-puppet.png'
          }
          alt=""
          className={`mx-auto h-24 object-contain ${game.bossDefeated ? 'grayscale' : ''}`}
        />
        <h1 className="font-comic text-4xl text-bark">
          {game.bossDefeated ? t('over.victory', { name: gameConfig.boss.name }) : t('over.title')}
        </h1>
        <p className="text-sm text-bark/70">
          {final
            ? t('over.finalText')
            : best
              ? t('over.unfinished', { run: best.run })
              : t('over.noRun')}
        </p>
        <dl className="mx-auto mt-3 max-w-xs text-left">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between border-b-2 border-bark/20 py-1">
              <dt>{r.label}</dt>
              <dd className="font-comic text-lg">{r.value}</dd>
            </div>
          ))}
          <div className="flex justify-between py-2 text-xl">
            <dt className="font-comic">{t('over.total')}</dt>
            <dd className="font-comic text-3xl text-green-700">{finalScore(game, gameData)}</dd>
          </div>
        </dl>
        <p className="text-sm text-bark/70">
          {t('over.defeated')}: {game.outcomes.defeat ?? 0}
        </p>
        <ServerBadge />
      </motion.div>
      <div className="grid gap-3">
        <Button onClick={() => newGame()}>{t('over.new')}</Button>
        <Button variant="secondary" onClick={goHome}>
          {t('result.home')}
        </Button>
      </div>
    </div>
  );
}
