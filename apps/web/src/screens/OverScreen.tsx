import { motion } from 'framer-motion';
import { scoreBreakdown } from '@snac-hunters/engine';
import type { GameState } from '@snac-hunters/engine';
import { Button } from '../components/Button';
import { ServerBadge } from '../components/ServerBadge';
import { gameConfig, gameData } from '../game/config';
import { useGame } from '../game/store';
import { useT } from '../game/useT';

/**
 * Pantalla final (feedback final, sección 6): puntos de cadena, de misión secreta y de misiones,
 * corazones que le quedan a Pieland, si se limpió Sherbert Forest y el puntaje final.
 */
export function OverScreen({ game }: { game: GameState }) {
  const t = useT();
  const { newGame, goHome } = useGame();
  const score = scoreBreakdown(game, gameData);
  const { heartBonus } = gameConfig.scoring;
  const rows: { label: string; value: number | string }[] = [
    { label: t('over.chain'), value: score.chain },
    { label: t('over.secret'), value: score.secret },
    { label: t('over.quests'), value: score.quests },
    ...(score.cards > 0 ? [{ label: t('over.cards'), value: score.cards }] : []),
    {
      label: t('over.hearts', { n: game.pieland.hp, pts: heartBonus }),
      value: score.cleared ? score.heartBonus : t('over.noBonus'),
    },
    {
      label: t(score.cleared ? 'over.cleared' : 'over.notCleared'),
      value: score.cleared ? score.clearedBonus : t('over.noBonus'),
    },
  ];

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
          className={`mx-auto h-24 object-contain ${game.bossDefeated ? 'opacity-60' : ''}`}
        />
        <h1 className="font-comic text-4xl text-bark">
          {game.bossDefeated ? t('over.victory', { name: gameConfig.boss.name }) : t('over.title')}
        </h1>
        {/* Por qué terminó: cayó Pieland o se dejó la partida */}
        {game.result === 'pieland' && (
          <p className="font-comic text-lg text-red-700">{t('over.result.pieland')}</p>
        )}
        <p className="text-sm text-bark/70">
          {t(score.cleared ? 'over.finalText' : 'over.unfinished')}
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
            <dd className="font-comic text-3xl text-green-700">{score.total}</dd>
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
