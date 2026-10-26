import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { trophyCapacity } from '@snac-hunters/engine';
import type { Ability, DieKind, GameState } from '@snac-hunters/engine';
import { AbilityCard } from '../components/AbilityCard';
import { Button } from '../components/Button';
import { Hud } from '../components/Hud';
import { Modal } from '../components/Modal';
import { TrophySlot, TrophyToken } from '../components/Trophy';
import { gameConfig, gameData, getAbility } from '../game/config';
import { formatHp, kindName } from '../game/i18n';
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

function owned(ids: readonly string[]): Ability[] {
  return ids.map(getAbility).filter((a): a is Ability => a !== undefined);
}

/** Fase en el pueblo (manual p. 14–15): descansar, comprar con trofeos y salir a cazar. */
export function TownScreen({ game }: { game: GameState }) {
  const t = useT();
  const act = useGame((s) => s.act);
  const [pay, setPay] = useState<number[]>([]);
  const { town } = gameConfig;
  const capacity = trophyCapacity(game, gameData);
  const items = owned(game.items.map((i) => i.id));
  const skills = owned(game.skills);
  const noActions = game.townActions <= 0;

  function togglePay(i: number) {
    setPay((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  }

  /** Paga con los trofeos elegidos; si no eligió los justos, con los primeros. */
  function buy(kind: Ability['kind']) {
    const cost = kind === 'item' ? town.itemCost : town.skillCost;
    const chosen = pay.length === cost ? pay : game.trophies.map((_, i) => i).slice(0, cost);
    setPay([]);
    act({ type: 'buy', kind, pay: chosen });
  }

  return (
    <div
      className="min-h-[100dvh] bg-cover bg-top"
      style={{
        backgroundImage:
          'linear-gradient(rgba(20,10,0,.35),rgba(20,10,0,.75)),url(/assets/bg/town.jpg)',
      }}
    >
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
            <p className="text-xs text-white/75">
              {t('town.trophiesHint')} {t('town.payHint')}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {game.trophies.map((s, i) => (
                <TrophyToken
                  key={`${s}-${i}`}
                  symbol={s}
                  selected={pay.includes(i)}
                  onClick={() => togglePay(i)}
                />
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

        <div data-guide-target="actions" className="grid grid-cols-3 gap-2 rounded-2xl">
          <TownSign
            img="/assets/town/rest.png"
            title={t('town.rest')}
            text={t('town.restText')}
            disabled={noActions}
            onClick={() => act({ type: 'rest' })}
          />
          <TownSign
            img="/assets/town/villager.png"
            title={t('town.buyItem')}
            text={t('town.buyItemText', { n: town.itemCost })}
            disabled={noActions || game.trophies.length < town.itemCost}
            onClick={() => buy('item')}
          />
          <TownSign
            img="/assets/town/huntmaster.png"
            title={t('town.buySkill')}
            text={t('town.buySkillText', { n: town.skillCost })}
            disabled={noActions || game.trophies.length < town.skillCost}
            onClick={() => buy('skill')}
          />
        </div>

        <section
          data-guide-target="cards"
          className="rounded-3xl border-4 border-black bg-black/55 p-3 text-white"
        >
          <h2 className="font-comic text-lg">
            {t('town.items', { n: items.length, max: town.maxItems })}
          </h2>
          <CardRow
            cards={items}
            empty={t('town.emptyItems')}
            spent={(a) => game.items.find((i) => i.id === a.id)?.ready === false}
          />
          <h2 className="mt-3 font-comic text-lg">
            {t('town.skills', { n: skills.length, max: town.maxSkills })}
          </h2>
          <CardRow cards={skills} empty={t('town.emptySkills')} spent={() => false} />
        </section>

        <Button
          data-guide-target="leave"
          onClick={() => act({ type: 'leave' })}
          className="text-xl"
        >
          {t('town.leave')}
          <span className="block font-sans text-xs">
            {t('town.leaveText', { hp: formatHp(game.hp), max: game.maxHp })}
          </span>
        </Button>
        <Button variant="secondary" onClick={() => act({ type: 'finish' })}>
          {t('town.finish')}
        </Button>
      </div>

      <AnimatePresence>{game.offer && <Offer game={game} />}</AnimatePresence>
    </div>
  );
}

function TownSign(props: {
  img: string;
  title: string;
  text: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      onClick={props.onClick}
      disabled={props.disabled}
      className="flex min-h-[48px] flex-col items-center rounded-2xl border-[3px] border-black bg-sherbet p-2 text-center shadow-[0_4px_0_#000] disabled:opacity-45"
    >
      <img src={props.img} alt="" className="h-16 object-contain" draggable={false} />
      <span className="mt-1 font-comic text-sm leading-tight text-bark">{props.title}</span>
      <span className="text-[11px] leading-tight text-bark/75">{props.text}</span>
    </motion.button>
  );
}

function CardRow(props: {
  cards: readonly Ability[];
  empty: string;
  spent: (a: Ability) => boolean;
}) {
  const t = useT();
  if (props.cards.length === 0) return <p className="text-sm text-white/60">{props.empty}</p>;
  return (
    <div className="mt-1 grid grid-cols-3 gap-2">
      {props.cards.map((a) => (
        <AbilityCard
          key={a.id}
          ability={a}
          dimmed={props.spent(a)}
          badge={props.spent(a) ? t('town.spent') : undefined}
        />
      ))}
    </div>
  );
}

/** Cartas robadas tras pagar: se elige una (o ninguna). Con 3 del mismo tipo, hay que reemplazar. */
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
      <Button
        variant="secondary"
        className="mt-3 w-full"
        onClick={() => (chosen ? setChosen(null) : act({ type: 'pick', abilityId: null }))}
      >
        {chosen ? t('town.back') : t('town.decline')}
      </Button>
    </Modal>
  );
}
