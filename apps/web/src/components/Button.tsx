import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-yellow-300 text-bark',
  secondary: 'bg-white text-bark',
  danger: 'bg-die-red text-white',
};

/** Botón grande (≥ 48px) pensado para el pulgar en móvil. */
export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`min-h-[52px] rounded-2xl border-[3px] border-black px-4 font-comic text-lg shadow-[0_4px_0_#000] transition active:translate-y-1 active:shadow-none disabled:opacity-40 disabled:active:translate-y-0 ${VARIANTS[variant]} ${className}`}
    />
  );
}
