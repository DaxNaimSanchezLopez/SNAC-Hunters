import { Fragment } from 'react';

/**
 * Feedback final: en los textos, [wild], [heart], [damage] y [any] se ven como su ícono, y las
 * palabras clave (las que van en MAYÚSCULAS) van en negritas. Los saltos de línea se respetan.
 */
const ICONS: Record<string, { src: string; label: string }> = {
  wild: { src: '/assets/icons/face-wild.png', label: 'wild' },
  heart: { src: '/assets/icons/face-heart.png', label: 'heart' },
  damage: { src: '/assets/icons/face-damage.png', label: 'damage' },
  any: { src: '/assets/icons/slot-all.png', label: 'any' },
};

// Un ícono, o una palabra de 2+ letras en mayúsculas (puede llevar apóstrofo o guion: KO'd no)
const TOKEN = /(\[(?:wild|heart|damage|any)\]|(?<!\p{L})\p{Lu}[\p{Lu}'’-]*\p{Lu}(?!\p{L}))/gu;

export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(TOKEN);
  return (
    <span className={`whitespace-pre-line ${className ?? ''}`}>
      {parts.map((part, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
        const icon = part.startsWith('[') ? ICONS[part.slice(1, -1)] : undefined;
        if (icon) {
          return (
            <img
              key={i}
              src={icon.src}
              alt={icon.label}
              className="mx-0.5 inline-block h-[1.25em] w-[1.25em] -translate-y-px rounded-[4px] border border-black/60 bg-white object-contain align-middle"
            />
          );
        }
        return <strong key={i}>{part}</strong>;
      })}
    </span>
  );
}
