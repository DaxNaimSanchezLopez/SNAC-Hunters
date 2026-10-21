import type { Ability } from '@snac-hunters/engine';
import { describeEffect } from '../game/i18n';
import { useT } from '../game/useT';

interface Props {
  readonly ability: Ability;
  readonly onClick?: () => void;
  /** Etiqueta encima de la carta (Gastado / Usada). */
  readonly badge?: string;
  readonly dimmed?: boolean;
  readonly selected?: boolean;
  readonly compact?: boolean;
}

/** Carta de habilidad con el arte del cliente y su efecto en texto (traducido). */
export function AbilityCard({ ability, onClick, badge, dimmed, selected, compact }: Props) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={selected}
      aria-label={`${ability.name}: ${describeEffect(t, ability.effect)}`}
      className={`relative shrink-0 overflow-hidden rounded-xl border-[3px] border-black bg-white text-left shadow-[0_3px_0_#000] transition active:translate-y-0.5 ${
        compact ? 'w-28' : 'w-full'
      } ${dimmed ? 'opacity-45 grayscale' : ''} ${selected ? 'ring-4 ring-yellow-300' : ''}`}
    >
      <img
        src={`/assets/abilities/${ability.id}.png`}
        alt=""
        className="block w-full object-contain"
        draggable={false}
      />
      {!compact && (
        <span className="block px-2 py-1 text-xs leading-tight text-bark">
          <b>{t(ability.kind === 'item' ? 'ability.item' : 'ability.skill')}:</b>{' '}
          {describeEffect(t, ability.effect)}
          {ability.bonus === 'trophySlot' && ` · ${t('ability.bonus')}`}
        </span>
      )}
      {badge && (
        <span className="absolute left-1 top-1 rounded-full border-2 border-black bg-white px-2 text-[10px] font-bold uppercase">
          {badge}
        </span>
      )}
    </button>
  );
}
