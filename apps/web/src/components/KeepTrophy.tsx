import { useState } from 'react';
import { typeName } from '../game/i18n';
import { useGame } from '../game/store';
import { useT } from '../game/useT';
import { Button } from './Button';
import { Modal } from './Modal';
import { QuestBoard, SecretQuestCard } from './Quests';
import { TrophyToken } from './Trophy';

/**
 * Trofeo ganado sin espacio libre: el jugador decide cuál tirar (manual p. 11). Feedback
 * 2026-11-11: mientras decide puede ver las misiones (secreta y del pueblo).
 */
export function KeepTrophy() {
  const t = useT();
  const { game, act } = useGame();
  const [quests, setQuests] = useState(false);
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
      <Button variant="secondary" className="mt-2 w-full" onClick={() => setQuests((q) => !q)}>
        {quests ? t('keep.hideQuests') : t('keep.showQuests')}
      </Button>
      {quests && (
        <div className="mt-3 grid gap-3">
          {game.secretQuest && <SecretQuestCard id={game.secretQuest} compact />}
          <h4 className="font-comic text-lg text-bark">{t('town.villager')}</h4>
          <QuestBoard game={game} kind="villager" />
          <h4 className="font-comic text-lg text-bark">{t('town.huntmaster')}</h4>
          <QuestBoard game={game} kind="huntmaster" />
        </div>
      )}
    </Modal>
  );
}
