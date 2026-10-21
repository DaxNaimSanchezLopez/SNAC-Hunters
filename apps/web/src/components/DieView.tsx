import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import type { Die, DieSource, Face } from '@snac-hunters/engine';
import { faceName, kindName } from '../game/i18n';
import { useT } from '../game/useT';

const KIND_BG: Record<DieSource, string> = {
  red: 'bg-die-red',
  orange: 'bg-die-orange',
  blue: 'bg-die-blue',
  purple: 'bg-die-purple',
  green: 'bg-die-green',
  white: 'bg-die-white',
  // Trofeo colocado como dado y símbolo creado por una habilidad: no se relanzan
  trophy: 'bg-yellow-200',
  token: 'bg-white border-dashed',
};

export function FaceIcon({ face, className = 'h-8 w-8' }: { face: Face; className?: string }) {
  const t = useT();
  if (face === 'blank') return <span className={className} />;
  return (
    <img
      src={`/assets/icons/face-${face}.png`}
      alt={faceName(t, face)}
      // Solo el corazón es rojo en el arte; en el dado físico se imprime en negro
      className={`${className} object-contain ${face === 'heart' ? 'brightness-0' : ''}`}
      draggable={false}
    />
  );
}

interface Props {
  readonly die: Die;
  readonly selected?: boolean;
  readonly dimmed?: boolean;
  readonly onClick?: () => void;
  readonly small?: boolean;
}

// Feedback V0: el dado blanco entra y se gasta con una animación corta y algo más lenta,
// para que el jugador vea que llegó (y cuándo se va).
const WHITE_ENTER = { y: -70, scale: 1.7, rotate: -90, opacity: 0 };
const ROLL_ENTER = { rotate: -200, scale: 0.4, opacity: 0 };
const WHITE_EXIT = { scale: 0.2, rotate: 160, opacity: 0, transition: { duration: 0.8 } };

export const DieView = forwardRef<HTMLDivElement, Props>(function DieView(
  { die, selected = false, dimmed = false, onClick, small = false },
  ref,
) {
  const t = useT();
  const size = small ? 'h-10 w-10' : 'h-14 w-14';
  const white = die.kind === 'white';
  return (
    // Un div con rol de botón: dentro de un espacio del monstruo (que ya es botón) no se anida
    // un <button>, y en la reserva sigue siendo accesible con teclado
    <motion.div
      ref={ref}
      role={onClick ? 'button' : 'img'}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      aria-pressed={onClick ? selected : undefined}
      aria-label={t('die.label', { kind: kindName(t, die.kind), face: faceName(t, die.face) })}
      layout
      initial={white ? WHITE_ENTER : ROLL_ENTER}
      animate={{
        rotate: 0,
        y: selected ? -6 : 0,
        scale: selected ? 1.12 : 1,
        opacity: dimmed ? 0.35 : 1,
      }}
      exit={white ? WHITE_EXIT : { scale: 0.5, opacity: 0 }}
      transition={
        white ? { duration: 0.9, ease: 'easeOut' } : { type: 'spring', stiffness: 260, damping: 18 }
      }
      className={`${size} ${KIND_BG[die.kind]} relative grid ${onClick ? 'cursor-pointer' : ''} shrink-0 place-items-center rounded-xl border-[3px] border-black shadow-[0_4px_0_#000] ${
        selected ? 'ring-4 ring-yellow-300' : ''
      } ${white && !dimmed ? 'shadow-[0_0_14px_4px_rgba(255,255,255,0.8)]' : ''}`}
    >
      {die.kind === 'trophy' && (
        <img
          src={`/assets/trophies/${die.face.toLowerCase()}.png`}
          alt=""
          className="absolute -right-2 -top-2 h-5 w-5 object-contain"
        />
      )}
      <FaceIcon face={die.face} className={small ? 'h-6 w-6' : 'h-9 w-9'} />
    </motion.div>
  );
});
