import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  canLeaveTown,
  payableOptions,
  rechargeTargets,
  townOptions,
  trophyCapacity,
} from '@snac-hunters/engine';
import type {
  Ability,
  AlchemyPick,
  DieKind,
  GameState,
  QuestSlot,
  SpecialDieKind,
  TownOption,
  TownOptionState,
  TownQuest,
} from '@snac-hunters/engine';
import { AbilityCard } from '../components/AbilityCard';
import { Button } from '../components/Button';
import { FaceIcon } from '../components/DieView';
import { Hud } from '../components/Hud';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { RichText } from '../components/RichText';
import { CompletedQuests, CostIcon, QuestBoard } from '../components/Quests';
import { TrophySlot, TrophyToken } from '../components/Trophy';
import { gameConfig, gameData, getAbility, getQuest } from '../game/config';
import { costName, kindName } from '../game/i18n';
import type { MessageKey } from '../game/i18n';
import { useGame } from '../game/store';
import { useT } from '../game/useT';

const KIND_BG: Record<DieKind, string> = {
  red: 'bg-die-red',
  orange: 'bg-die-orange',
  blue: 'bg-die-blue',
  purple: 'bg-die-purple',
  green: 'bg-die-green',
  white: 'bg-die-white',
};

const COLORS: readonly { die: SpecialDieKind; symbol: 'Horn' | 'Wing' | 'Tail' | 'Claw' }[] = [
  { die: 'orange', symbol: 'Horn' },
  { die: 'blue', symbol: 'Wing' },
  { die: 'purple', symbol: 'Tail' },
  { die: 'green', symbol: 'Claw' },
];

function owned(ids: readonly string[]): Ability[] {
  return ids.map(getAbility).filter((a): a is Ability => a !== undefined);
}

/**
 * Fase en el pueblo (manual p. 14–15 y tablero del juego de mesa): descansar, misiones de
 * aldeano y del Huntmaster (cada una con sus 3 misiones en un desplegable), saqueo, alquimista,
 * entrenamiento y forja (feedback 2026-11-11). Cada opción usa el arte del pueblo del cliente.
 */
export function TownScreen({ game }: { game: GameState }) {
  const t = useT();
  const act = useGame((s) => s.act);
  const goHome = useGame((s) => s.goHome);
  const [modal, setModal] = useState<'alchemist' | 'forge' | 'training' | null>(null);
  const { town } = gameConfig;
  const capacity = trophyCapacity(game, gameData);
  const items = owned(game.items.map((i) => i.id));
  const skills = owned(game.skills);
  // El engine decide qué opción está abierta, usada o disponible
  const options = townOptions(game, gameData);
  const canLeave = canLeaveTown(game, gameData);
  // Cloning Tool cargado: objetos que puede recargar
  const recharge = rechargeTargets(game, gameData);
  // Entrenamiento: con varios objetos gastados se elige cuál recargar (feedback final)
  const spentItems = game.items.filter((i) => !i.ready).map((i) => i.id);
  const train = () =>
    spentItems.length > 1 ? setModal('training') : act({ type: 'training', item: spentItems[0] });

  const sign = (option: TownOption, img: string, onClick?: () => void) => (
    <TownSign
      key={option}
      img={img}
      title={t(
        `town.${option === 'item' ? 'villager' : option === 'skill' ? 'huntmaster' : option}` as MessageKey,
      )}
      text={t(
        `town.${option === 'item' ? 'villager' : option === 'skill' ? 'huntmaster' : option}Text` as MessageKey,
      )}
      status={options[option]}
      onClick={onClick}
    />
  );

  return (
    // El fondo del pueblo lo pone App en toda la ventana, no solo en la columna del juego
    <div className="min-h-[100dvh]">
      <div className="flex flex-col gap-3 px-3 pb-8 pt-3">
        <Hud game={game} />

        <div className="flex items-baseline justify-between text-white">
          <h1 className="font-comic text-3xl drop-shadow-[0_3px_0_#000]">{t('town.title')}</h1>
          <span className="rounded-full bg-black/50 px-3 py-1 text-sm font-bold">
            {t('town.actions', { n: game.townActions, max: town.actionsPerVisit })}
          </span>
        </div>

        <section className="rounded-3xl border-4 border-black bg-black/55 p-3 text-white">
          <div data-guide-target="trophies" className="rounded-2xl p-1">
            <h2 className="font-comic text-lg">
              {t('town.trophies', { n: game.trophies.length, max: capacity })}
            </h2>
            <p className="text-xs text-white/75">{t('town.trophiesHint')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {game.trophies.map((s, i) => (
                <TrophyToken key={`${s}-${i}`} symbol={s} />
              ))}
              {Array.from({ length: Math.max(0, capacity - game.trophies.length) }, (_, i) => (
                <TrophySlot key={`empty-${i}`} />
              ))}
            </div>
          </div>
          <div data-guide-target="dice" className="mt-2 rounded-2xl p-1">
            <h2 className="font-comic text-lg">{t('town.dice')}</h2>
            <div className="mt-1 flex flex-wrap gap-1">
              {game.dice.map((k, i) => (
                <span
                  key={i}
                  title={kindName(t, k)}
                  className={`h-8 w-8 rounded-lg border-[3px] border-black ${KIND_BG[k]}`}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Partida guiada: solo se muestran las opciones ya desbloqueadas, en el orden en que se
            abren (feedback final) */}
        <div data-guide-target="actions" className="grid gap-2 md:grid-cols-2 md:items-start">
          {sign('rest', '/assets/town/rest-scene.png', () => act({ type: 'rest' }))}
          <QuestHouse game={game} kind="villager" status={options.item} />
          {sign('training', '/assets/town/training-sign.png', train)}
          {sign('alchemist', '/assets/town/alchemist-sign.png', () => setModal('alchemist'))}
          <QuestHouse game={game} kind="huntmaster" status={options.skill} />
          {sign('scavenge', '/assets/town/scavenge-sign.png', () => act({ type: 'scavenge' }))}
          {sign('forge', '/assets/town/forge-sign.png', () => setModal('forge'))}
        </div>

        <div className="rounded-3xl border-4 border-black bg-black/55 p-3 text-white">
          <CompletedQuests game={game} />
        </div>

        <section
          data-guide-target="cards"
          className="rounded-3xl border-4 border-black bg-black/55 p-3 text-white"
        >
          <h2 className="font-comic text-lg">
            {t('town.items', { n: items.length, max: town.maxItems })}
          </h2>
          {recharge.length > 0 && <p className="text-xs text-white/75">{t('town.rechargeHint')}</p>}
          <CardRow
            cards={items}
            empty={t('town.emptyItems')}
            spent={(a) => game.items.find((i) => i.id === a.id)?.ready === false}
            recharge={(a) =>
              recharge.includes(a.id) ? () => act({ type: 'recharge', target: a.id }) : undefined
            }
          />
          <h2 className="mt-3 font-comic text-lg">
            {t('town.skills', { n: skills.length, max: town.maxSkills })}
          </h2>
          <CardRow cards={skills} empty={t('town.emptySkills')} spent={() => false} />
        </section>

        <Button
          data-guide-target="leave"
          onClick={() => act({ type: 'leave' })}
          disabled={!canLeave}
          className="text-xl"
        >
          {t('town.leave')}
          <span className="block font-sans text-xs">
            {canLeave
              ? t('town.leaveText', { hp: game.hp, max: game.maxHp })
              : t('town.leaveLocked', { n: game.townActions })}
          </span>
        </Button>
        {/* Feedback 2026-10-27: no termina la partida, se puede volver a ella desde el menú */}
        <Button variant="secondary" onClick={goHome}>
          {t('town.mainMenu')}
        </Button>
      </div>

      <AnimatePresence>
        {game.offer && <Offer game={game} />}
        {modal === 'alchemist' && <AlchemistModal onClose={() => setModal(null)} />}
        {modal === 'forge' && <ForgeModal onClose={() => setModal(null)} />}
        {modal === 'training' && (
          <TrainingModal items={spentItems} onClose={() => setModal(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Alquimista ("Choose 2" del tablero): dos distintas de las tres opciones. */
function AlchemistModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const act = useGame((s) => s.act);
  const [picks, setPicks] = useState<AlchemyPick[]>([]);
  const toggle = (p: AlchemyPick) =>
    setPicks((cur) =>
      cur.includes(p) ? cur.filter((x) => x !== p) : cur.length < 2 ? [...cur, p] : cur,
    );
  return (
    <Modal title={t('town.alchemistTitle')} onClose={onClose}>
      <img src="/assets/town/alchemist-scene.png" alt="" className="mx-auto h-28 object-contain" />
      <div className="mt-2 grid gap-2">
        {(['hp', 'trophy', 'slot'] as const).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={picks.includes(p)}
            onClick={() => toggle(p)}
            className={`flex min-h-[48px] items-center gap-2 rounded-2xl border-[3px] border-black px-3 text-left font-comic shadow-[0_3px_0_#000] ${
              picks.includes(p) ? 'bg-yellow-300' : 'bg-white'
            }`}
          >
            <span className="grid h-6 w-6 place-items-center rounded-md border-2 border-black bg-white">
              {picks.includes(p) && <Icon name="check" className="h-4 w-4" />}
            </span>
            {t(`town.alchemist.${p}`)}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onClose}>
          {t('town.cancel')}
        </Button>
        <Button
          disabled={picks.length !== 2}
          onClick={() => {
            onClose();
            act({ type: 'alchemist', picks });
          }}
        >
          {t('town.alchemistConfirm')}
        </Button>
      </div>
    </Modal>
  );
}

/** Entrenamiento (feedback final): +1 dado rojo y se elige qué objeto gastado recargar. */
function TrainingModal({ items, onClose }: { items: readonly string[]; onClose: () => void }) {
  const t = useT();
  const act = useGame((s) => s.act);
  return (
    <Modal title={t('town.trainingTitle')} onClose={onClose}>
      <img src="/assets/town/training-scene.png" alt="" className="mx-auto h-28 object-contain" />
      <div className="mt-2 grid gap-2">
        {owned(items).map((a) => (
          <AbilityCard
            key={a.id}
            ability={a}
            row
            onClick={() => {
              onClose();
              act({ type: 'training', item: a.id });
            }}
          />
        ))}
      </div>
      <Button variant="secondary" className="mt-3 w-full" onClick={onClose}>
        {t('town.cancel')}
      </Button>
    </Modal>
  );
}

/** Forja: un dado rojo se cambia por un dado especial del color que se elija. */
function ForgeModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const act = useGame((s) => s.act);
  return (
    <Modal title={t('town.forgeTitle')} onClose={onClose}>
      <img src="/assets/town/forge-scene.png" alt="" className="mx-auto h-28 object-contain" />
      <div className="mt-2 grid grid-cols-2 gap-2">
        {COLORS.map(({ die, symbol }) => (
          <button
            key={die}
            type="button"
            onClick={() => {
              onClose();
              act({ type: 'forge', die });
            }}
            className="flex min-h-[48px] flex-col items-center gap-1 rounded-2xl border-[3px] border-black bg-white p-2 font-comic shadow-[0_3px_0_#000] active:translate-y-0.5"
          >
            <span
              className={`grid h-12 w-12 place-items-center rounded-xl border-[3px] border-black ${KIND_BG[die]}`}
            >
              <FaceIcon face={symbol} className="h-8 w-8" />
            </span>
            {kindName(t, die)}
          </button>
        ))}
      </div>
      <Button variant="secondary" className="mt-3 w-full" onClick={onClose}>
        {t('town.cancel')}
      </Button>
    </Modal>
  );
}

/**
 * Casa de misiones (aldeano u Huntmaster): su arte con el borde recto pegado al borde del
 * recuadro, y debajo un desplegable con sus 3 misiones (feedback 2026-11-11).
 */
function QuestHouse({
  game,
  kind,
  status,
}: {
  game: GameState;
  kind: TownQuest['kind'];
  status: TownOptionState;
}) {
  const t = useT();
  const setGuideUi = useGame((s) => s.setGuideUi);
  const [open, setOpen] = useState(false);
  if (!status.unlocked) return null;
  const villager = kind === 'villager';
  const count = game.quests.filter((q) => getQuest(q.id)?.kind === kind).length;
  return (
    <div
      data-guide-target={villager ? 'quests' : undefined}
      className={`overflow-hidden rounded-2xl border-[3px] border-black shadow-[0_4px_0_#000] ${
        status.used ? 'bg-gray-300' : 'bg-sherbet'
      }`}
    >
      <button
        type="button"
        onClick={() => {
          // Feedback final: la lección del aldeano aparece al abrir su casa
          if (villager && !open) setGuideUi({ villagerOpen: true });
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        className={`relative flex min-h-[112px] w-full items-stretch text-left ${
          villager ? '' : 'flex-row-reverse'
        }`}
      >
        {status.used && <UsedBadge />}
        {/* El borde recto del arte queda alineado con el borde del recuadro */}
        {/* Feedback final: Huntmaster y su cabaña (más recortada) del tamaño del aldeano */}
        <img
          src={villager ? '/assets/town/villager-scene.png' : '/assets/town/huntmaster-hut.png'}
          alt=""
          className={`h-28 w-28 shrink-0 self-end object-contain ${
            villager ? 'object-left-bottom' : 'object-right-bottom'
          } ${status.used ? 'opacity-60' : ''}`}
          draggable={false}
        />
        <span className="flex flex-1 flex-col justify-center gap-0.5 p-2">
          <span className="font-comic text-base leading-tight text-bark">
            {t(villager ? 'town.villager' : 'town.huntmaster')}
          </span>
          <span className="text-[11px] leading-tight text-bark/75">
            <RichText text={t(villager ? 'town.villagerText' : 'town.huntmasterText')} />
          </span>
          <span className="mt-1 flex items-center gap-1 text-xs font-bold text-bark">
            <Icon
              name="chevron"
              className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
            />
            {open ? t('town.hideQuests') : t('town.showQuests', { n: count })}
          </span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t-[3px] border-black bg-black/55 px-2"
          >
            <div className="py-2">
              <QuestBoard
                game={game}
                kind={kind}
                action={(slot) => <QuestActions game={game} slot={slot} />}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UsedBadge() {
  const t = useT();
  return (
    <span className="absolute right-1 top-1 z-10 flex items-center gap-0.5 rounded-full border-2 border-black bg-white px-1.5 text-[10px] font-bold uppercase">
      <Icon name="check" className="h-3 w-3" />
      {t('town.used')}
    </span>
  );
}

/** Por qué no se puede cumplir una misión ahora (o null si se puede). */
function blockedReason(game: GameState, option: TownOptionState): MessageKey | null {
  if (!option.unlocked) return 'town.questLocked';
  if (option.used) return 'town.questUsed';
  if (game.townActions <= 0) return 'town.questNoAction';
  return null;
}

/** Botones para cumplir una misión: uno por opción de pago (aldeano) o "entregar todo". */
function QuestActions({ game, slot }: { game: GameState; slot: QuestSlot }) {
  const t = useT();
  const act = useGame((s) => s.act);
  const quest = getQuest(slot.id);
  if (!quest) return null;
  const option: TownOption = quest.kind === 'villager' ? 'item' : 'skill';
  const blocked = blockedReason(game, townOptions(game, gameData)[option]);
  const payable = payableOptions(game, quest);
  if (blocked) return <p className="mt-1 text-[11px] font-bold opacity-70">{t(blocked)}</p>;
  if (payable.length === 0) {
    return <p className="mt-1 text-[11px] font-bold opacity-70">{t('town.questMissing')}</p>;
  }
  if (quest.kind === 'huntmaster') {
    return (
      <button
        type="button"
        onClick={() => act({ type: 'quest', id: quest.id })}
        className="mt-1 min-h-[44px] w-full rounded-xl border-[3px] border-black bg-yellow-300 font-comic shadow-[0_3px_0_#000] active:translate-y-0.5"
      >
        {t('town.questPayAll')}
      </button>
    );
  }
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {payable.map((cost) => (
        <button
          key={cost}
          type="button"
          onClick={() => act({ type: 'quest', id: quest.id, pay: cost })}
          className="flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-xl border-[3px] border-black bg-yellow-300 px-2 font-comic shadow-[0_3px_0_#000] active:translate-y-0.5"
        >
          {t('town.questPay', { what: costName(t, cost) })}
          <span className="scale-75">
            <CostIcon cost={cost} />
          </span>
        </button>
      ))}
    </div>
  );
}

function TownSign(props: {
  img: string;
  title: string;
  text: string;
  status: TownOptionState;
  onClick?: () => void;
}) {
  const { unlocked, used, available } = props.status;
  if (!unlocked) return null;
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={props.onClick}
      disabled={!available}
      className={`relative flex min-h-[48px] w-full items-center gap-2 rounded-2xl border-[3px] border-black p-2 text-left shadow-[0_4px_0_#000] disabled:opacity-50 ${
        used ? 'bg-gray-300' : 'bg-sherbet'
      }`}
    >
      {used && <UsedBadge />}
      <img src={props.img} alt="" className="h-20 w-28 shrink-0 object-contain" draggable={false} />
      <span className="flex flex-col">
        <span className="font-comic text-base leading-tight text-bark">{props.title}</span>
        <span className="text-[11px] leading-tight text-bark/75">
          <RichText text={props.text} />
        </span>
      </span>
    </motion.button>
  );
}

function CardRow(props: {
  cards: readonly Ability[];
  empty: string;
  spent: (a: Ability) => boolean;
  /** Cloning Tool: acción para recargar ese objeto, si se puede. */
  recharge?: (a: Ability) => (() => void) | undefined;
}) {
  const t = useT();
  if (props.cards.length === 0) return <p className="text-sm text-white/60">{props.empty}</p>;
  return (
    <div className="mt-1 grid grid-cols-3 gap-2">
      {props.cards.map((a) => {
        const spent = props.spent(a);
        const recharge = props.recharge?.(a);
        return (
          <div key={a.id} className="flex flex-col gap-1">
            <AbilityCard ability={a} dimmed={spent} badge={spent ? t('town.spent') : undefined} />
            {recharge && (
              <button
                type="button"
                onClick={recharge}
                className="min-h-[36px] rounded-lg border-2 border-black bg-yellow-300 font-comic text-sm text-bark"
              >
                {t('town.recharge')}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Cartas robadas tras cumplir una misión: hay que quedarse con una (feedback 2026-10-27). Con 3
 * del mismo tipo, la nueva reemplaza a otra.
 */
function Offer({ game }: { game: GameState }) {
  const t = useT();
  const act = useGame((s) => s.act);
  const [chosen, setChosen] = useState<string | null>(null);
  const offer = game.offer;
  if (!offer) return null;
  const { town } = gameConfig;
  const mine = offer.kind === 'item' ? game.items.map((i) => i.id) : game.skills;
  const max = offer.kind === 'item' ? town.maxItems : town.maxSkills;
  const full = mine.length >= max;

  function choose(id: string) {
    if (full) setChosen(id);
    else act({ type: 'pick', abilityId: id });
  }

  return (
    <Modal title={chosen ? t('town.replaceTitle', { max }) : t('town.offerTitle')}>
      <p className="text-sm text-bark/70">
        {offer.kind === 'item' ? t('town.offerItem') : t('town.offerSkill')}
      </p>
      <div className="mt-3 grid gap-3">
        {chosen
          ? owned(mine).map((a) => (
              <AbilityCard
                key={a.id}
                ability={a}
                onClick={() => act({ type: 'pick', abilityId: chosen, replace: a.id })}
              />
            ))
          : owned(offer.ids).map((a) => (
              <AbilityCard key={a.id} ability={a} onClick={() => choose(a.id)} />
            ))}
      </div>
      {chosen && (
        <Button variant="secondary" className="mt-3 w-full" onClick={() => setChosen(null)}>
          {t('town.back')}
        </Button>
      )}
    </Modal>
  );
}
