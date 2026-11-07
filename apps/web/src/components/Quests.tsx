import { oldestQuest } from '@snac-hunters/engine';
import type { GameState, QuestCost, QuestSlot } from '@snac-hunters/engine';
import { gameConfig, getQuest, getSecretQuest } from '../game/config';
import { costName, typeName } from '../game/i18n';
import { useGame } from '../game/store';
import { useT } from '../game/useT';
import { Button } from './Button';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { TypeIcon } from './MonsterCard';
import { TrophyToken } from './Trophy';

/** Lo que pide una misión: una ficha de trofeo o un corazón roto (se paga con HPie). */
export function CostIcon({ cost }: { cost: QuestCost }) {
  const t = useT();
  if (cost !== 'heart') return <TrophyToken symbol={cost} size="h-10" />;
  return (
    <span className="grid min-h-[48px] min-w-[48px] place-items-center" title={costName(t, cost)}>
      <img src="/assets/icons/face-damage.png" alt={costName(t, cost)} className="h-9 w-9" />
    </span>
  );
}

/**
 * Carta de misión secreta (Image files/secret quest cards). Se muestra el arte del cliente y,
 * debajo, lo que da en puntos según la sección 3 del feedback (2026-11-03).
 */
export function SecretQuestCard({ id, compact = false }: { id: string; compact?: boolean }) {
  const t = useT();
  const quest = getSecretQuest(id);
  if (!quest) return null;
  const { questKill, questTrophy } = gameConfig.scoring;
  const [a, b] = quest.symbols;
  return (
    <div className="overflow-hidden rounded-2xl border-[3px] border-black bg-white shadow-[0_3px_0_#000]">
      <img
        src={`/assets/secret-quests/${quest.id}.png`}
        alt={quest.name}
        className={`mx-auto block object-contain ${compact ? 'h-40' : 'h-56'}`}
        draggable={false}
      />
      <ul className="grid gap-1 border-t-2 border-black/20 px-2 py-1.5 text-xs leading-tight text-bark">
        <li className="flex items-center gap-1.5">
          <TypeIcon type={quest.monsterType} className="h-5 w-5" />
          {t('secret.monsters', { type: typeName(t, quest.monsterType), n: questKill })}
        </li>
        <li className="flex items-center gap-1.5">
          <img src="/assets/icons/quest.png" alt="" className="h-5 w-5 object-contain" />
          {t('secret.trophies', { a: typeName(t, a), b: typeName(t, b), n: questTrophy })}
        </li>
      </ul>
    </div>
  );
}

/**
 * Misión del tablero del pueblo, recreada de forma simplificada a partir de los escaneos
 * (Image files/Quests): tipo, título, trofeos/corazones que pide y recompensa. La más antigua
 * avisa que se retirará al volver al pueblo (feedback del cliente, 2026-11-03).
 */
export function QuestCard({
  slot,
  oldest,
  children,
}: {
  slot: QuestSlot;
  oldest: boolean;
  children?: React.ReactNode;
}) {
  const t = useT();
  const lang = useGame((s) => s.lang);
  const quest = getQuest(slot.id);
  if (!quest) return null;
  const villager = quest.kind === 'villager';
  return (
    <article
      className={`rounded-2xl border-[3px] border-black bg-[#e8c48f] p-2 text-bark shadow-[0_3px_0_#000] ${
        oldest ? 'ring-4 ring-orange-400' : ''
      }`}
    >
      <header className="flex items-center justify-between gap-2">
        <span
          className={`rounded-full border-2 border-black px-2 text-[10px] font-bold uppercase text-white ${
            villager ? 'bg-blue-700' : 'bg-red-800'
          }`}
        >
          {t(villager ? 'quest.villager' : 'quest.huntmaster')}
        </span>
        <span className="text-[10px] font-bold">{t(`quest.reward.${quest.kind}`)}</span>
      </header>
      <h4 className="mt-1 font-comic text-base leading-tight">{quest.name[lang]}</h4>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <span className="text-xs font-bold">{t(villager ? 'quest.one' : 'quest.all')}</span>
        {quest.cost.map((cost, i) => (
          <CostIcon key={`${cost}-${i}`} cost={cost} />
        ))}
      </div>
      {oldest && (
        <p className="mt-1 flex items-start gap-1 rounded-lg bg-orange-200 px-2 py-1 text-[11px] font-bold leading-tight">
          <Icon name="warning" className="h-4 w-4" />
          {t('quest.oldest')}
        </p>
      )}
      {children}
    </article>
  );
}

/** Tablero de misiones a la vista (la más antigua lleva el aviso). */
export function QuestBoard({
  game,
  action,
}: {
  game: GameState;
  /** Botones para cumplir la misión (solo en el pueblo). */
  action?: (slot: QuestSlot) => React.ReactNode;
}) {
  const oldest = oldestQuest(game);
  return (
    <div className="grid gap-2">
      {game.quests.map((slot) => (
        <QuestCard key={slot.id} slot={slot} oldest={slot.id === oldest}>
          {action?.(slot)}
        </QuestCard>
      ))}
    </div>
  );
}

/** Misiones cumplidas: se pueden consultar en cualquier momento. */
export function CompletedQuests({ game }: { game: GameState }) {
  const t = useT();
  const lang = useGame((s) => s.lang);
  return (
    <details className="rounded-2xl bg-black/10 p-2 text-sm">
      <summary className="min-h-[32px] cursor-pointer font-bold">
        {t('town.completed', { n: game.completedQuests.length })}
      </summary>
      {game.completedQuests.length === 0 ? (
        <p className="text-xs opacity-70">{t('town.noCompleted')}</p>
      ) : (
        <ul className="mt-1 grid gap-1">
          {game.completedQuests.map((id, i) => {
            const quest = getQuest(id);
            return (
              <li key={`${id}-${i}`} className="flex items-center gap-1 text-xs">
                <Icon name="check" className="h-4 w-4" />
                {quest?.name[lang] ?? id}
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}

/** Ventana de misiones (desde el HUD): misión secreta, tablero del pueblo y cumplidas. */
export function QuestsModal({ game, onClose }: { game: GameState; onClose: () => void }) {
  const t = useT();
  return (
    <Modal title={t('quests.title')} onClose={onClose}>
      {game.secretQuest && (
        <section className="mt-2">
          <h4 className="font-comic text-lg text-bark">{t('quests.secret')}</h4>
          <SecretQuestCard id={game.secretQuest} compact />
        </section>
      )}
      <section className="mt-3">
        <h4 className="font-comic text-lg text-bark">{t('quests.board')}</h4>
        <QuestBoard game={game} />
      </section>
      <div className="mt-3">
        <CompletedQuests game={game} />
      </div>
      <Button variant="secondary" className="mt-3 w-full" onClick={onClose}>
        {t('quests.close')}
      </Button>
    </Modal>
  );
}
