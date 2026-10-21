import type { GameSymbol } from '@snac-hunters/engine';
import { typeName } from '../game/i18n';
import { useT } from '../game/useT';

export const TROPHY_IMG = (s: GameSymbol) => `/assets/trophies/${s.toLowerCase()}.png`;

/** Ficha de trofeo del inventario. Lleva el símbolo de dado que representa. */
export function TrophyToken({
  symbol,
  selected = false,
  onClick,
  size = 'h-14',
}: {
  symbol: GameSymbol;
  selected?: boolean;
  onClick?: () => void;
  size?: string;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={selected}
      aria-label={t('result.trophy', { symbol: typeName(t, symbol) })}
      className={`relative grid min-h-[48px] min-w-[48px] place-items-center rounded-xl p-0.5 transition ${
        selected ? '-translate-y-1 bg-yellow-200 ring-4 ring-yellow-300' : ''
      }`}
    >
      <img src={TROPHY_IMG(symbol)} alt="" className={`${size} object-contain`} draggable={false} />
      <img
        src={`/assets/icons/face-${symbol}.png`}
        alt=""
        className="absolute bottom-0 right-0 h-5 w-5 rounded-full border-2 border-black bg-white object-contain p-0.5"
      />
    </button>
  );
}

/** Espacio vacío para trofeos (la capacidad depende de las cartas que tengas). */
export function TrophySlot() {
  return <span className="h-14 w-11 rounded-xl border-2 border-dashed border-white/50" />;
}
