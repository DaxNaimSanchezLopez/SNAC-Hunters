import { motion } from 'framer-motion';
import { Button } from '../components/Button';
import { MonsterPortrait, SlotIcon } from '../components/MonsterCard';
import { getMonster } from '../game/config';
import { useGame } from '../game/store';

/** Nodo de encuentro: el jugador elige entre dos SNACs de distinto tipo (estructura de run del brief). */
export function PickScreen() {
  const { pair, startHunt, goHome } = useGame();
  const options = (pair ?? []).map(getMonster).filter((m) => m !== undefined);

  return (
    <div className="flex min-h-[100dvh] flex-col gap-4 px-4 py-6">
      <h1 className="text-center font-comic text-3xl text-white drop-shadow-[0_3px_0_#000]">
        Elige tu presa
      </h1>
      <p className="-mt-3 text-center text-sm text-white/90">
        Dos rastros en Sherbert Forest. ¿Cuál sigues?
      </p>
      <div className="grid grid-cols-2 gap-3">
        {options.map((m, i) => (
          <motion.button
            key={m.id}
            type="button"
            initial={{ x: i === 0 ? -60 : 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            onClick={() => startHunt(m.id)}
            className="rounded-3xl border-4 border-black bg-sherbet p-3 text-left shadow-[0_6px_0_#000] active:translate-y-1"
          >
            <div className="flex items-start justify-between gap-1">
              <span className="break-all font-comic text-lg leading-tight text-bark">{m.name}</span>
              <SlotIcon slot={m.type} className="h-6 w-6 shrink-0" />
            </div>
            <MonsterPortrait monster={m} className="mx-auto h-28" />
            <div className="mt-2 grid grid-cols-4 gap-1">
              {m.slots.map((s, j) => (
                <span
                  key={j}
                  className="grid aspect-square place-items-center rounded-lg border-2 border-black bg-white"
                >
                  <SlotIcon slot={s} className="h-6 w-6" />
                </span>
              ))}
            </div>
          </motion.button>
        ))}
      </div>
      <Button variant="secondary" onClick={goHome} className="mt-auto">
        Volver
      </Button>
    </div>
  );
}
