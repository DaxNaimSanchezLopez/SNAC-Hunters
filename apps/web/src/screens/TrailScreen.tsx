import { motion } from 'framer-motion';
import { canHunt } from '@snac-hunters/engine';
import type { GameState } from '@snac-hunters/engine';
import { Button } from '../components/Button';
import { Hud } from '../components/Hud';
import { getMonster } from '../game/config';
import { typeName } from '../game/i18n';
import { useGame } from '../game/store';
import { useT } from '../game/useT';

/**
 * Nodo de encuentro: dos rastros de distinto tipo. Feedback V0 (monstruos ocultos): antes del
 * combate solo se ve el tipo; el monstruo concreto se revela al empezar a pelear.
 */
export function TrailScreen({ game }: { game: GameState }) {
  const t = useT();
  const act = useGame((s) => s.act);
  const run = game.run;
  const types = (game.trail ?? []).map((id) => getMonster(id)?.type);
  const hunting = run !== null && canHunt(run);

  return (
    <div className="flex min-h-[100dvh] flex-col gap-4 px-3 py-3">
      <Hud game={game} />
      <div className="text-center text-white">
        <h1 className="font-comic text-3xl drop-shadow-[0_3px_0_#000]">{t('trail.title')}</h1>
        <p className="text-sm">
          {t('trail.subtitle', { run: game.runs, fight: (run?.fights ?? 0) + 1 })} ·{' '}
          {t('trail.pool', { n: run?.pool.length ?? 0 })}
        </p>
      </div>

      {hunting ? (
        <>
          <p className="text-center text-sm text-white/90">{t('trail.pick')}</p>
          <div data-guide-target="tracks" className="grid grid-cols-2 gap-3">
            {types.map(
              (type, i) =>
                type && (
                  <motion.button
                    key={i}
                    type="button"
                    initial={{ x: i === 0 ? -60 : 60, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    onClick={() => act({ type: 'follow', index: i })}
                    className="flex flex-col items-center gap-2 rounded-3xl border-4 border-black bg-sherbet p-4 shadow-[0_6px_0_#000] active:translate-y-1"
                  >
                    <span className="grid h-28 w-28 place-items-center rounded-full border-4 border-dashed border-bark/40 bg-bark/10">
                      <img
                        src={`/assets/trophies/${type.toLowerCase()}.png`}
                        alt=""
                        className="h-20 object-contain"
                      />
                    </span>
                    <span className="font-comic text-xl text-bark">
                      {t('trail.track', { type: typeName(t, type) })}
                    </span>
                    <span className="rounded-full border-2 border-black bg-yellow-300 px-4 py-1 font-comic">
                      {t('trail.follow')}
                    </span>
                  </motion.button>
                ),
            )}
          </div>
        </>
      ) : (
        <p className="rounded-2xl bg-black/50 p-3 text-center text-white">{t('trail.noDice')}</p>
      )}

      <Button variant="secondary" className="mt-auto" onClick={() => act({ type: 'return' })}>
        {t('trail.return')}
      </Button>
    </div>
  );
}
