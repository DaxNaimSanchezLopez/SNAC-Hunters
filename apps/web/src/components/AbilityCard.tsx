import type { Ability } from '@snac-hunters/engine';
import { describeEffect } from '../game/i18n';
import { useT } from '../game/useT';

interface Props {
  readonly ability: Ability;
  readonly onClick?: () => void;
  /** Etiqueta encima de la carta (Gastado / Usada / Pasiva). */
  readonly badge?: string;
  readonly dimmed?: boolean;
  readonly selected?: boolean;
  readonly compact?: boolean;
  /** Fila: arte pequeño a la izquierda y texto a la derecha (columna de habilidades en combate). */
  readonly row?: boolean;
}

/** Carta de habilidad con el arte del cliente y su efecto en texto (traducido). */
export function AbilityCard({ ability, onClick, badge, dimmed, selected, compact, row }: Props) {
  const t = useT();
  const text = (
    <>
      <b>{t(ability.kind === 'item' ? 'ability.item' : 'ability.skill')}:</b>{' '}
      {describeEffect(t, ability.effect)}
      {ability.bonus === 'trophySlot' && ` · ${t('ability.bonus')}`}
    </>
  );
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={selected}
      aria-label={`${ability.name}: ${describeEffect(t, ability.effect)}`}
      className={`relative shrink-0 overflow-hidden rounded-xl border-[3px] border-black bg-white text-left shadow-[0_3px_0_#000] transition active:translate-y-0.5 ${
        compact ? 'w-28' : 'w-full'
      } ${row ? 'flex min-h-[56px] items-center gap-2' : ''} ${dimmed ? 'opacity-50' : ''} ${
        selected ? 'ring-4 ring-yellow-300' : ''
      }`}
    >
      <img
        src={`/assets/abilities/${ability.id}.png`}
        alt=""
        className={row ? 'block w-24 shrink-0 object-contain' : 'block w-full object-contain'}
        draggable={false}
      />
      {row ? (
        <span className="flex flex-col py-1 pr-2 text-xs leading-tight text-bark">
          <span className="font-comic text-sm">{ability.name}</span>
          <span>{text}</span>
        </span>
      ) : (
        !compact && <span className="block px-2 py-1 text-xs leading-tight text-bark">{text}</span>
      )}
      {badge && (
        <span
          className={`absolute top-1 rounded-full border-2 border-black bg-white px-2 text-[10px] font-bold uppercase ${
            row ? 'right-1' : 'left-1'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
