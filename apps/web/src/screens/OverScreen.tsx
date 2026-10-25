import { motion } from 'framer-motion';
import { findQuest, scoreBreakdown } from '@snac-hunters/engine';
import type { GameResult, GameState } from '@snac-hunters/engine';
import { Button } from '../components/Button';
import { QuestCard } from '../components/Hud';
import { ServerBadge } from '../components/ServerBadge';
import { gameConfig, gameData } from '../game/config';
import type { MessageKey } from '../game/i18n';
import { useGame } from '../game/store';
import { useT } from '../game/useT';

const LOOK: Record<GameResult, { img: string; tone: string }> = {
  victory: { img: '/assets/monsters/pieous.png', tone: 'text-green-700' },
  lives: { img: '/assets/icons/skull.png', tone: 'text-red-700' },
  pieland: { img: '/assets/icons/pie-skull.png', tone: 'text-red-700' },
  abandon: { img: '/assets/huntmaster-puppet.png', tone: 'text-bark' },
};

/**
 * Pantalla de puntaje (feedback V0 sección 6 y V1 sección 8): puntos − KOs × 3 − expediciones,
 * más la misión secreta, las cartas de puntos y el bonus por derrotar al jefe.
 */
export function OverScreen({ game }: { game: GameState }) {
  const t = useT();
  const { newGame, goHome } = useGame();
  const { koWeight } = gameConfig.scoring;
  const score = scoreBreakdown(game, gameData);
  const result = game.result ?? 'abandon';
  const rows = [
    { label: t('over.points'), value: score.points },
    { label: t('over.kos', { ko: koWeight }), value: -score.koPenalty },
    { label: t('over.runs'), value: -score.runPenalty },
    {
      label: t('over.questRow', { name: findQuest(gameData, game.quest).name }),
      value: score.quest,
    },
    { label: t('over.cardsRow'), value: score.cards },
    { label: t('over.victoryRow'), value: score.victory },
  ];

  return (
    <div className="flex min-h-[100dvh] flex-col justify-center gap-4 px-4 py-6">
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="rounded-3xl border-4 border-black bg-sherbet p-5 text-center shadow-[0_6px_0_#000]"
      >
        <img src={LOOK[result].img} alt="" className="mx-auto h-24 object-contain" />
        <h1 className={`font-comic text-4xl ${LOOK[result].tone}`}>
          {t(`over.${result}` as MessageKey)}
        </h1>
        <p className="text-sm text-bark/70">{t('over.formula', { ko: koWeight })}</p>
        <dl className="mx-auto mt-3 max-w-xs text-left">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between border-b-2 border-bark/20 py-1">
              <dt className="text-sm">{r.label}</dt>
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
        <div className="mt-3 rounded-2xl bg-bark/85 p-2 text-left">
          <QuestCard game={game} compact />
        </div>
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
