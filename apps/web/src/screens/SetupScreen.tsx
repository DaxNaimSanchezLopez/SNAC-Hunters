import { motion } from 'framer-motion';
import type { GameState, GameSymbol, SpecialDieKind } from '@snac-hunters/engine';
import { FaceIcon } from '../components/DieView';
import { Hud } from '../components/Hud';
import { faceName, kindName } from '../game/i18n';
import { useGame } from '../game/store';
import { useT } from '../game/useT';

/** Cada color de cazador trae su dado especial: 4 caras de su símbolo y 2 comodines. */
const COLORS: readonly { die: SpecialDieKind; symbol: GameSymbol; bg: string }[] = [
  { die: 'orange', symbol: 'Horn', bg: 'bg-die-orange' },
  { die: 'blue', symbol: 'Wing', bg: 'bg-die-blue' },
  { die: 'purple', symbol: 'Tail', bg: 'bg-die-purple' },
  { die: 'green', symbol: 'Claw', bg: 'bg-die-green' },
];

/** Preparación (manual p. 7): cada jugador toma el dado especial de su color. */
export function SetupScreen({ game }: { game: GameState }) {
  const t = useT();
  const act = useGame((s) => s.act);
  // La partida guiada desbloquea el pueblo poco a poco (lo decide el engine)
  const guideOn = useGame((s) => s.guideOn);
  return (
    <div className="flex min-h-[100dvh] flex-col gap-4 px-3 py-3">
      <Hud game={game} />
      <div className="text-center text-white">
        <h1 className="font-comic text-3xl drop-shadow-[0_3px_0_#000]">{t('setup.title')}</h1>
        <p className="text-sm">{t('setup.subtitle')}</p>
      </div>
      <div data-guide-target="colors" className="grid grid-cols-2 gap-3">
        {COLORS.map(({ die, symbol, bg }, i) => (
          <motion.button
            key={die}
            type="button"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: i * 0.06 }}
            onClick={() => act({ type: 'start', die, guided: guideOn })}
            className="flex min-h-[48px] flex-col items-center gap-2 rounded-3xl border-4 border-black bg-sherbet p-3 shadow-[0_6px_0_#000] active:translate-y-1"
          >
            <span
              className={`${bg} grid h-16 w-16 place-items-center rounded-xl border-[3px] border-black shadow-[0_4px_0_#000]`}
            >
              <FaceIcon face={symbol} className="h-10 w-10" />
            </span>
            <span className="font-comic text-lg leading-none text-bark">
              {t('setup.die', { color: kindName(t, die) })}
            </span>
            <span className="text-xs leading-tight text-bark/80">
              {t('setup.faces', { symbol: faceName(t, symbol) })}
            </span>
          </motion.button>
        ))}
      </div>
      <p className="text-center text-sm text-white/90">{t('setup.hint')}</p>
    </div>
  );
}
