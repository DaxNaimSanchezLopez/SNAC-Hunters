import { typeName } from '../game/i18n';
import { useGame } from '../game/store';
import { useT } from '../game/useT';
import { Button } from './Button';
import { Modal } from './Modal';
import { TrophyToken } from './Trophy';

/** Trofeo ganado sin espacio libre: el jugador decide cuál tirar (manual p. 11). */
export function KeepTrophy() {
  const t = useT();
  const { game, act } = useGame();
  const pending = game?.pendingTrophy;
  if (!game || !pending) return null;
  return (
    <Modal title={t('keep.title')}>
      <p className="text-sm text-bark/80">{t('keep.text', { symbol: typeName(t, pending) })}</p>
      <div className="my-3 flex justify-center">
        <TrophyToken symbol={pending} size="h-20" />
      </div>
      <div className="flex flex-wrap justify-center gap-2 rounded-2xl bg-bark/80 p-2">
        {game.trophies.map((s, i) => (
          <TrophyToken key={i} symbol={s} onClick={() => act({ type: 'keep', discard: i })} />
        ))}
      </div>
      <Button
        variant="secondary"
        className="mt-3 w-full"
        onClick={() => act({ type: 'keep', discard: null })}
      >
        {t('keep.discardNew')}
      </Button>
    </Modal>
  );
}
