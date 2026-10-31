import { motion } from 'framer-motion';
import { finalScore } from '@snac-hunters/engine';
import type { GameState } from '@snac-hunters/engine';
import { Button } from '../components/Button';
import { ServerBadge } from '../components/ServerBadge';
import { gameConfig } from '../game/config';
import { useGame } from '../game/store';
import { useT } from '../game/useT';

/** Pantalla de puntaje: puntos − KOs × koWeight − expediciones × runWeight (config/). */
export function OverScreen({ game }: { game: GameState }) {
  const t = useT();
  const { newGame, goHome } = useGame();
  const { koWeight, runWeight } = gameConfig.scoring;
  const rows = [
    { label: t('over.points'), value: game.points },
    { label: t('over.kos', { ko: koWeight }), value: -game.kos * koWeight },
    { label: t('over.runs', { run: runWeight }), value: -game.runs * runWeight },
  ];

  return (
    <div className="flex min-h-[100dvh] flex-col justify-center gap-4 px-4 py-6">
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="rounded-3xl border-4 border-black bg-sherbet p-5 text-center shadow-[0_6px_0_#000]"
      >
        <img src="/assets/huntmaster-puppet.png" alt="" className="mx-auto h-24 object-contain" />
        <h1 className="font-comic text-4xl text-bark">{t('over.title')}</h1>
        <p className="text-sm text-bark/70">
          {t('over.formula', { ko: koWeight, run: runWeight })}
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
            <dd className="font-comic text-3xl text-green-700">{finalScore(game, gameConfig)}</dd>
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
