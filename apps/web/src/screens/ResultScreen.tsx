import { motion } from 'framer-motion';
import { canHunt, hasHuntingDice } from '@snac-hunters/engine';
import type { CombatState, Outcome } from '@snac-hunters/engine';
import { Button } from '../components/Button';
import { Hud } from '../components/Hud';
import { MonsterPortrait } from '../components/MonsterCard';
import { TrophyToken } from '../components/Trophy';
import { gameConfig } from '../game/config';
import { typeName } from '../game/i18n';
import type { MessageKey } from '../game/i18n';
import { useGame } from '../game/store';
import { useT } from '../game/useT';

const LOOK: Record<Outcome, { icon: string; tone: string }> = {
  defeat: { icon: '/assets/icons/defeat.png', tone: 'text-green-700' },
  study: { icon: '/assets/icons/sherbert-forest.png', tone: 'text-blue-700' },
  flee: { icon: '/assets/icons/shield.png', tone: 'text-bark' },
  ko: { icon: '/assets/icons/skull.png', tone: 'text-red-700' },
};

function OutcomeCard({ combat, children }: { combat: CombatState; children?: React.ReactNode }) {
  const t = useT();
  const outcome = combat.outcome as Outcome;
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="rounded-3xl border-4 border-black bg-sherbet p-5 text-center shadow-[0_6px_0_#000]"
    >
      <img src={LOOK[outcome].icon} alt="" className="mx-auto h-14 object-contain" />
      <h1 className={`mt-2 font-comic text-4xl ${LOOK[outcome].tone}`}>
        {t(`result.${outcome}` as MessageKey)}
      </h1>
      {combat.ko && outcome === 'defeat' && (
        <p className="text-sm text-red-700">{t('result.koDefeat')}</p>
      )}
      <MonsterPortrait
        monster={combat.monster}
        className={`mx-auto my-3 h-32 ${outcome === 'defeat' ? 'grayscale' : ''}`}
      />
      {combat.trophy && (
        <div className="flex items-center justify-center gap-3">
          <TrophyToken symbol={combat.trophy} />
          <span className="font-comic text-xl">
            {t('result.trophy', { symbol: typeName(t, combat.trophy) })}
          </span>
        </div>
      )}
      {children}
    </motion.div>
  );
}

/** Resultado de un combate de la expedición: seguir cazando o volver al pueblo. */
export function ResultScreen() {
  const t = useT();
  const { game, act } = useGame();
  const combat = game?.combat;
  const run = game?.run;
  if (!game || !combat || !run) return null;
  const ended = run.status === 'ended';

  return (
    <div className="flex min-h-[100dvh] flex-col gap-4 px-3 py-3">
      <Hud game={game} />
      <OutcomeCard combat={combat}>
        <p data-guide-target="status" className="mt-2 text-sm text-bark/80">
          {t('result.status', { hp: game.hp, max: game.maxHp, dice: run.pool.length })}
        </p>
        {ended && run.endedBy !== 'town' && (
          <p className="mt-2 rounded-xl border-2 border-black bg-orange-200 px-3 py-2 text-sm font-bold">
            {run.endedBy === 'ko'
              ? t('result.runOver.ko', { n: gameConfig.scoring.koWeight })
              : t('result.runOver.flee')}
          </p>
        )}
        {!ended && !hasHuntingDice(run) && (
          <p className="mt-2 rounded-xl border-2 border-black bg-red-200 px-3 py-2 text-sm font-bold text-red-900">
            {t('result.noDice')}
          </p>
        )}
      </OutcomeCard>
      <div className="mt-auto grid gap-3">
        {canHunt(run) && (
          <Button
            variant={hasHuntingDice(run) ? 'primary' : 'secondary'}
            onClick={() => act({ type: 'continue' })}
          >
            {t('result.continue')}
          </Button>
        )}
        <Button
          variant={canHunt(run) && hasHuntingDice(run) ? 'secondary' : 'primary'}
          onClick={() => act({ type: 'return' })}
        >
          {t('result.town')}
        </Button>
      </div>
    </div>
  );
}

/** Fin del tutorial: un combate suelto, sin expedición. */
export function TutorialResultScreen() {
  const t = useT();
  const { tutorialCombat, goHome, newGame, game } = useGame();
  if (!tutorialCombat) return null;
  return (
    <div className="flex min-h-[100dvh] flex-col justify-center gap-4 px-4 py-6">
      <OutcomeCard combat={tutorialCombat}>
        <p className="mt-3 font-comic text-lg text-bark">{t('result.tutorialDone')}</p>
      </OutcomeCard>
      <div className="grid gap-3">
        {!game && <Button onClick={() => newGame()}>{t('result.startGame')}</Button>}
        <Button variant={game ? 'primary' : 'secondary'} onClick={goHome}>
          {t('result.home')}
        </Button>
      </div>
    </div>
  );
}
