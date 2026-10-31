import { motion } from 'framer-motion';

export function HpBar({ hp, maxHp, glow = false }: { hp: number; maxHp: number; glow?: boolean }) {
  return (
    <div
      aria-label={`HPie ${hp} de ${maxHp}`}
      data-guide-target="hp"
      className={`flex shrink-0 items-center gap-0.5 rounded-full bg-black/40 px-2 py-1 ${glow ? 'ring-4 ring-yellow-300' : ''}`}
    >
      {Array.from({ length: maxHp }, (_, i) => (
        <motion.img
          key={i}
          src="/assets/icons/hp.png"
          alt=""
          animate={{
            opacity: i < hp ? 1 : 0.2,
            scale: i < hp ? 1 : 0.8,
            filter: i < hp ? 'none' : 'grayscale(1)',
          }}
          className="h-5 w-5 object-contain"
        />
      ))}
    </div>
  );
}
