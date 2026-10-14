import { motion } from 'framer-motion';
import type { GameSymbol } from '@snac-hunters/engine';
import { Button } from '../components/Button';
import { isEnabled } from '../game/config';
import { useGame } from '../game/store';
import { TROPHY_IMG } from './CombatScreen';

const SYMBOLS: GameSymbol[] = ['Horn', 'Wing', 'Claw', 'Tail'];

export function HomeScreen() {
  const { progress, startTutorial, openHunt, resetProgress } = useGame();

  return (
    <div className="flex min-h-[100dvh] flex-col gap-4 px-4 py-6">
      <motion.header
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-center"
      >
        <img src="/assets/pieland-logo.png" alt="Pieland" className="mx-auto h-10 object-contain" />
        <h1 className="mt-2 font-comic text-5xl text-yellow-300 drop-shadow-[0_4px_0_#000]">
          SNAC Hunters
        </h1>
        <p className="font-comic text-lg text-white drop-shadow-[0_2px_0_#000]">Sherbert Forest</p>
      </motion.header>

      <motion.img
        src="/assets/huntmaster.png"
        alt="El Huntmaster"
        className="mx-auto h-40 object-contain drop-shadow-[0_6px_0_rgba(0,0,0,0.4)]"
        animate={{ y: [0, -8, 0] }}
        transition={{ repeat: Infinity, duration: 3 }}
      />

      <section className="rounded-3xl border-4 border-black bg-sherbet/95 p-4 shadow-[0_6px_0_#000]">
        <h2 className="font-comic text-xl text-bark">Tu progreso</h2>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <Stat label="Puntos" value={progress.points} />
          <Stat label="Derrotados" value={progress.outcomes.defeat ?? 0} />
          <Stat label="KOs" value={progress.kos} />
        </div>
        <div className="mt-3 flex justify-around">
          {SYMBOLS.map((s) => (
            <div key={s} className="text-center">
              <img
                src={TROPHY_IMG(s)}
                alt={`Trofeos ${s}`}
                className={`h-12 object-contain ${progress.trophies[s] ? '' : 'opacity-30 grayscale'}`}
              />
              <span className="font-comic text-bark">×{progress.trophies[s] ?? 0}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-xs text-bark/60">
          Se guarda en tu dispositivo (IndexedDB)
        </p>
      </section>

      <div className="mt-auto grid gap-3">
        {isEnabled('tutorial') && (
          <Button onClick={startTutorial}>
            {progress.tutorialDone ? 'Repetir tutorial' : 'Aprender a jugar'}
          </Button>
        )}
        {isEnabled('freeHunt') && (
          <Button variant={progress.tutorialDone ? 'primary' : 'secondary'} onClick={openHunt}>
            Cazar en Sherbert Forest
          </Button>
        )}
        {!isEnabled('town') && (
          <p className="text-center text-xs text-white/80">
            Pueblo y jefe Pieous: desactivados por feature toggle
          </p>
        )}
        <button
          type="button"
          onClick={resetProgress}
          className="min-h-[48px] text-sm text-white/70 underline"
        >
          Reiniciar progreso
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border-2 border-black bg-white py-2">
      <div className="font-comic text-2xl text-bark">{value}</div>
      <div className="text-xs text-bark/70">{label}</div>
    </div>
  );
}
