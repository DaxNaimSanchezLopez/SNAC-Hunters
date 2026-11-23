import { motion } from 'framer-motion';
import { finalScore } from '@snac-hunters/engine';
import { Button } from '../components/Button';
import { gameData, isEnabled } from '../game/config';
import type { Lang } from '../game/i18n';
import { canFinish, useGame } from '../game/store';
import type { FinishedGame } from '../game/store';
import { useT } from '../game/useT';

/** Selector español / inglés al inicio del juego (feedback V0). */
export function LanguageToggle() {
  const t = useT();
  const { lang, setLang } = useGame();
  const options: Lang[] = ['es', 'en'];
  return (
    <div role="radiogroup" aria-label={t('lang.title')} className="flex justify-center gap-2">
      {options.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={lang === l}
          onClick={() => setLang(l)}
          className={`min-h-[48px] min-w-[96px] rounded-full border-[3px] border-black px-4 font-comic text-lg shadow-[0_3px_0_#000] ${
            lang === l ? 'bg-yellow-300 text-bark' : 'bg-white/80 text-bark/70'
          }`}
        >
          {t(l === 'es' ? 'lang.es' : 'lang.en')}
        </button>
      ))}
    </div>
  );
}

export function HomeScreen() {
  const t = useT();
  const {
    game,
    topScores,
    tutorialDone,
    langChosen,
    newGame,
    continueGame,
    startTutorial,
    resetAll,
  } = useGame();
  const playing = game !== null && game.phase !== 'over';
  // Fuera de un combate, empezar otra partida la termina y guarda su puntuación (su mejor run)
  const finishable = game !== null && canFinish(game);

  return (
    <div className="flex min-h-[100dvh] flex-col gap-4 px-4 py-6">
      <motion.header
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-center"
      >
        <img src="/assets/pieland-logo.png" alt="Pieland" className="mx-auto h-10 object-contain" />
        <h1 className="mt-2 font-comic text-5xl text-yellow-300 drop-shadow-[0_4px_0_#000]">
          SNAC Hunters
        </h1>
        <p className="font-comic text-lg text-white drop-shadow-[0_2px_0_#000]">
          {t('home.subtitle')}
        </p>
      </motion.header>

      {!langChosen && (
        <p className="text-center font-comic text-xl text-white drop-shadow-[0_2px_0_#000]">
          {t('lang.title')}
        </p>
      )}
      <LanguageToggle />

      <motion.img
        src="/assets/huntmaster.png"
        alt={t('home.huntmaster')}
        className="mx-auto h-36 object-contain drop-shadow-[0_6px_0_rgba(0,0,0,0.4)]"
        animate={{ y: [0, -8, 0] }}
        transition={{ repeat: Infinity, duration: 3 }}
      />

      <section className="rounded-3xl border-4 border-black bg-sherbet/95 p-4 text-center shadow-[0_6px_0_#000]">
        <h2 className="font-comic text-2xl text-bark">{t('home.topScores')}</h2>
        <ol className="mt-2 grid gap-2">
          {podium(topScores).map((entry, i) => (
            <TopScore key={i} rank={i + 1} entry={entry} />
          ))}
        </ol>
      </section>

      <div className="mt-auto grid gap-3">
        {playing && (
          <Button onClick={continueGame}>
            {t('home.continue')}
            {/* Feedback 2026-11-03: el puntaje se puede consultar en cualquier momento */}
            <span className="block font-sans text-xs">
              {t('home.current', { n: finalScore(game, gameData) })}
            </span>
          </Button>
        )}
        <Button
          variant={playing || !tutorialDone ? 'secondary' : 'primary'}
          onClick={() => newGame()}
        >
          {t('home.new')}
        </Button>
        {playing && (
          <p className="-mt-2 text-center text-xs text-white/80">
            {t(finishable ? 'home.newWarning' : 'home.newWarningRun')}
          </p>
        )}
        {isEnabled('tutorial') && (
          <>
            <Button
              variant={tutorialDone || playing ? 'secondary' : 'primary'}
              onClick={() => newGame(true)}
            >
              {tutorialDone ? t('home.tutorialAgain') : t('home.tutorial')}
              <span className="block font-sans text-xs">{t('home.tutorialText')}</span>
            </Button>
            <button
              type="button"
              onClick={startTutorial}
              className="min-h-[48px] text-sm font-bold text-white underline"
            >
              {t('home.practice')}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={resetAll}
          className="min-h-[48px] text-sm text-white/70 underline"
        >
          {t('home.reset')}
        </button>
      </div>
    </div>
  );
}

const MEDALS = ['bg-yellow-300', 'bg-gray-200', 'bg-orange-300'];

/** Puntaje de ejemplo del podio (feedback final): una meta para los jugadores nuevos. */
interface SampleScore {
  readonly name: string;
  readonly level: 'low' | 'mid' | 'high';
  readonly score: number;
}

const SAMPLES: readonly SampleScore[] = [
  { name: 'Colonel Custard', level: 'high', score: 3000 },
  { name: 'Samurpie', level: 'mid', score: 2000 },
  { name: 'Flunkie', level: 'low', score: 800 },
];

type PodiumEntry = { readonly sample: SampleScore } | { readonly game: FinishedGame };

/**
 * Los 3 mejores entre los puntajes de ejemplo y los del jugador: conforme el jugador los supera,
 * sus partidas van reemplazando a los de ejemplo. A igualdad gana el del jugador.
 */
function podium(games: readonly FinishedGame[]): PodiumEntry[] {
  const score = (e: PodiumEntry) => ('game' in e ? e.game.score : e.sample.score);
  return [
    ...games.map((game): PodiumEntry => ({ game })),
    ...SAMPLES.map((sample): PodiumEntry => ({ sample })),
  ]
    .sort((a, b) => score(b) - score(a))
    .slice(0, 3);
}

/** Un puesto del podio (feedback del cliente, 2026-10-27): siempre se ven los 3 lugares. */
function TopScore({ rank, entry }: { rank: number; entry: PodiumEntry }) {
  const t = useT();
  return (
    <li className="flex items-center gap-3 rounded-2xl border-2 border-black bg-white px-3 py-1.5 text-left">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-black font-comic text-lg ${MEDALS[rank - 1] ?? ''}`}
      >
        {rank}
      </span>
      {'sample' in entry ? (
        <>
          <span className="flex flex-1 flex-col leading-tight">
            <span className="font-comic text-lg text-bark">{entry.sample.name}</span>
            <span className="text-[11px] text-bark/60">
              {t(`home.level.${entry.sample.level}`)}
            </span>
          </span>
          <span className="font-comic text-2xl text-bark/70">{entry.sample.score}</span>
        </>
      ) : (
        <>
          <span className="flex flex-1 flex-col leading-tight">
            <span className="font-comic text-lg text-bark">
              {t('home.you')}
              {entry.game.bossDefeated && (
                <span className="ml-1 rounded-full border border-black bg-purple-800 px-1.5 align-middle font-sans text-[10px] font-bold text-white">
                  {t('home.boss')}
                </span>
              )}
            </span>
            <span className="text-[11px] text-bark/60">
              {t('home.snacs', { n: entry.game.defeated })} ·{' '}
              {new Date(entry.game.at).toLocaleDateString()}
            </span>
          </span>
          <span className="font-comic text-2xl text-bark">{entry.game.score}</span>
        </>
      )}
    </li>
  );
}
