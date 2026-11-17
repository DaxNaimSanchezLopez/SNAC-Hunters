import type { DieKind, GameState } from '@snac-hunters/engine';
import { getAbility } from '../game/config';
import { kindName } from '../game/i18n';
import { useGame } from '../game/store';
import { useT } from '../game/useT';
import { AbilityCard } from './AbilityCard';
import { Button } from './Button';
import { Modal } from './Modal';
import { TrophyToken } from './Trophy';

const KIND_BG: Record<DieKind, string> = {
  red: 'bg-die-red',
  orange: 'bg-die-orange',
  blue: 'bg-die-blue',
  purple: 'bg-die-purple',
  green: 'bg-die-green',
  white: 'bg-die-white',
};

/** ¿Toca mostrar el equipo inicial? Justo al salir a la primera expedición, una sola vez. */
export function showsStartGear(game: GameState | null, startSeen: string | null): boolean {
  return (
    game !== null &&
    game.phase === 'trail' &&
    game.runs === 1 &&
    game.run?.fights === 0 &&
    game.position === null &&
    startSeen !== game.seed
  );
}

/**
 * Feedback 2026-11-11: al empezar, una pantalla le muestra al jugador el objeto y el trofeo
 * iniciales (manual p. 7) para que sepa que los recibió.
 */
export function StartGear({ game }: { game: GameState }) {
  const t = useT();
  const seeStart = useGame((s) => s.seeStart);
  return (
    <Modal title={t('start.title')}>
      <p className="text-sm text-bark/80">{t('start.text')}</p>
      <h4 className="mt-3 font-comic text-lg text-bark">{t('start.item')}</h4>
      <div className="mt-1 grid gap-2">
        {game.items.map((i) => {
          const ability = getAbility(i.id);
          return ability ? <AbilityCard key={i.id} ability={ability} row /> : null;
        })}
      </div>
      <h4 className="mt-3 font-comic text-lg text-bark">{t('start.trophy')}</h4>
      <div className="mt-1 flex flex-wrap gap-2 rounded-2xl bg-bark/80 p-2">
        {game.trophies.map((s, i) => (
          <TrophyToken key={`${s}-${i}`} symbol={s} />
        ))}
      </div>
      <h4 className="mt-3 font-comic text-lg text-bark">{t('start.dice')}</h4>
      <div className="mt-1 flex flex-wrap gap-1">
        {game.dice.map((k, i) => (
          <span
            key={i}
            title={kindName(t, k)}
            className={`h-8 w-8 rounded-lg border-[3px] border-black ${KIND_BG[k]}`}
          />
        ))}
      </div>
      <Button className="mt-4 w-full" onClick={seeStart}>
        {t('start.go')}
      </Button>
    </Modal>
  );
}
