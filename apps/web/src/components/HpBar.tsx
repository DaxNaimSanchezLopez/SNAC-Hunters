import { motion } from 'framer-motion';
import { formatHp } from '../game/i18n';

/** Vida en corazones; el daño del dado blanco quita medio corazón, así que se dibujan mitades. */
export function HpBar({ hp, maxHp, glow = false }: { hp: number; maxHp: number; glow?: boolean }) {
  return (
    <div
      aria-label={`HPie ${formatHp(hp)} de ${maxHp}`}
      className={`flex shrink-0 items-center gap-0.5 rounded-full bg-black/40 px-2 py-1 ${glow ? 'ring-4 ring-yellow-300' : ''}`}
    >
      {Array.from({ length: maxHp }, (_, i) => {
        // 1 = lleno, 0.5 = medio, 0 = vacío
        const fill = Math.min(1, Math.max(0, hp - i));
        return (
          <motion.span
            key={i}
            className="relative block h-5 w-5"
            animate={{ scale: fill > 0 ? 1 : 0.8 }}
          >
            <img
              src="/assets/icons/hp.png"
              alt=""
              className="absolute inset-0 h-full w-full object-contain opacity-20 grayscale"
            />
            <motion.img
              src="/assets/icons/hp.png"
              alt=""
              className="absolute inset-0 h-full w-full object-contain"
              initial={false}
              animate={{ clipPath: `inset(0 ${(1 - fill) * 100}% 0 0)` }}
              transition={{ duration: 0.3 }}
            />
          </motion.span>
        );
      })}
    </div>
  );
}
