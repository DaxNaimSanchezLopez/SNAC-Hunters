// Íconos de interfaz dibujados en SVG: nada de emojis ni símbolos que el sistema pinte como
// emoji (se ven distinto en cada celular). Heredan el color del texto con currentColor.
const PATHS = {
  back: 'M15 5 8 12l7 7',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5 10 17 19 7',
  cross: 'M6 6l12 12M18 6 6 18',
  warning: 'M12 4 2.5 20h19L12 4zM12 10v4.5M12 17.2v.3',
  tap: 'M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V12m0-1a1.5 1.5 0 0 1 3 0v3.5c0 3-2 5.5-5 5.5h-1.2a5 5 0 0 1-4-2l-2.6-3.6a1.5 1.5 0 0 1 2.3-1.9L9 13.5',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'tap' ? 1.8 : 3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`inline-block shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
