import { motion } from 'framer-motion';
import type { CombatState, Monster, Slot } from '@snac-hunters/engine';
import { slotName, typeName } from '../game/i18n';
import { useT } from '../game/useT';
import { DieView } from './DieView';

export function MonsterPortrait({
  monster,
  className = '',
}: {
  monster: Monster;
  className?: string;
}) {
  return (
    <img
      src={`/assets/monsters/${monster.id}.png`}
      alt={monster.name}
      className={`object-contain drop-shadow-[0_6px_0_rgba(0,0,0,0.35)] ${className}`}
      draggable={false}
    />
  );
}

/** Icono de espacio. El espacio 'all' usa el símbolo "any 4" (feedback V0). */
export function SlotIcon({ slot, className = 'h-8 w-8' }: { slot: Slot; className?: string }) {
  const t = useT();
  return (
    <img
      src={`/assets/icons/slot-${slot}.png`}
      alt={slotName(t, slot)}
      className={`${className} object-contain`}
    />
  );
}

interface Props {
  readonly combat: CombatState;
  readonly highlightSlots: readonly number[];
  readonly onSlot: (slot: number) => void;
  readonly glow?: boolean;
}

export function MonsterCard({ combat, highlightSlots, onSlot, glow = false }: Props) {
  const t = useT();
  const { monster } = combat;
  return (
    <section
      aria-label={monster.name}
      data-guide-target="monster"
      className={`relative rounded-3xl border-4 border-black bg-sherbet/95 p-3 shadow-[0_6px_0_#000] ${
        glow ? 'ring-4 ring-yellow-300' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-comic text-2xl leading-none text-bark">{monster.name}</h2>
          <p className="mt-1 text-xs italic text-bark/70">"{monster.pun}"</p>
        </div>
        <span className="flex items-center gap-1 rounded-full border-2 border-black bg-white px-2 py-0.5 text-xs font-bold">
          <img
            src={`/assets/trophies/${monster.type.toLowerCase()}.png`}
            alt=""
            className="h-5 w-4 object-contain"
          />
          {t('monster.type', { type: typeName(t, monster.type) })}
        </span>
      </div>

      <MonsterPortrait monster={monster} className="mx-auto my-1 h-28 w-full sm:h-36" />

      <div className="grid grid-cols-4 gap-2">
        {monster.slots.map((slot, i) => {
          const dieId = combat.assignments[i];
          const die = dieId ? combat.dice.find((d) => d.id === dieId) : undefined;
          const lit = highlightSlots.includes(i);
          return (
            <motion.button
              key={i}
              type="button"
              onClick={() => onSlot(i)}
              aria-label={
                t('slot.label', { n: i + 1, slot: slotName(t, slot) }) +
                (die ? t('slot.covered') : '')
              }
              animate={lit ? { scale: [1, 1.08, 1] } : { scale: 1 }}
              transition={lit ? { repeat: Infinity, duration: 0.9 } : {}}
              className={`grid min-h-[64px] place-items-center rounded-2xl border-[3px] border-dashed p-1 ${
                lit
                  ? 'border-yellow-400 bg-yellow-100'
                  : die
                    ? 'border-black bg-white'
                    : 'border-black/50 bg-white/60'
              }`}
            >
              {die ? (
                <DieView die={die} small />
              ) : (
                <SlotIcon slot={slot} className="h-9 w-9 opacity-80" />
              )}
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
