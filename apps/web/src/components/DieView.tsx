import { motion } from 'framer-motion';
import type { Die, DieKind, Face } from '@snac-hunters/engine';

const KIND_BG: Record<DieKind, string> = {
  red: 'bg-die-red',
  orange: 'bg-die-orange',
  blue: 'bg-die-blue',
  purple: 'bg-die-purple',
  green: 'bg-die-green',
  white: 'bg-die-white',
};

export const FACE_LABEL: Record<Face, string> = {
  Horn: 'Hacha',
  Wing: 'Flecha',
  Claw: 'Lupa',
  Tail: 'Gancho',
  heart: 'Corazón',
  wild: 'Comodín',
  damage: 'Daño',
  blank: 'En blanco',
};

export function FaceIcon({ face, className = 'h-8 w-8' }: { face: Face; className?: string }) {
  if (face === 'blank') return <span className={className} />;
  return (
    <img
      src={`/assets/icons/face-${face}.png`}
      alt={FACE_LABEL[face]}
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

export function DieView({ die, selected = false, dimmed = false, onClick, small = false }: Props) {
  const size = small ? 'h-10 w-10' : 'h-14 w-14';
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={selected}
      aria-label={`Dado ${die.kind}: ${FACE_LABEL[die.face]}`}
      // La key con la cara hace que el dado "ruede" cada vez que cambia
      key={`${die.id}-${die.face}`}
      initial={{ rotate: -200, scale: 0.4, opacity: 0 }}
      animate={{
        rotate: 0,
        scale: selected ? 1.12 : 1,
        opacity: dimmed ? 0.35 : 1,
        y: selected ? -6 : 0,
      }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      className={`${size} ${KIND_BG[die.kind]} grid shrink-0 place-items-center rounded-xl border-[3px] border-black shadow-[0_4px_0_#000] ${
        selected ? 'ring-4 ring-yellow-300' : ''
      }`}
    >
      <FaceIcon face={die.face} className={small ? 'h-6 w-6' : 'h-9 w-9'} />
    </motion.button>
  );
}
