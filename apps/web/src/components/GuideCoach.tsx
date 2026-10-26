import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from './Icon';
import { activeLesson, guide } from '../game/guide';
import { useGame } from '../game/store';
import { useT } from '../game/useT';

/**
 * El Huntmaster explica la partida guiada. Las lecciones "Entendido" oscurecen el resto e
 * iluminan la parte del juego que explican; las de "hazlo tú" dejan jugar y se cumplen solas.
 */
export function GuideCoach() {
  const t = useT();
  const { game, guideOn, guideSeen, lang, dismissLesson, skipGuide } = useGame();
  const lesson = guideOn ? activeLesson(game, guideSeen) : null;
  const highlight = lesson?.highlight;

  useEffect(() => {
    if (!highlight) return;
    const targets = [...document.querySelectorAll(`[data-guide-target="${highlight}"]`)];
    targets.forEach((el) => el.classList.add('guide-focus'));
    targets[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return () => targets.forEach((el) => el.classList.remove('guide-focus'));
  }, [highlight, lesson?.id]);

  if (!lesson) return null;
  const blocking = lesson.advance === 'next';
  const text = lesson[lang];
  // En combate la barra de acciones ocupa el pie de la pantalla
  const bottom = game?.phase === 'combat' ? 'bottom-32' : 'bottom-3';

  return (
    <>
      {blocking && <div className="fixed inset-0 z-[15] bg-black/55" aria-hidden />}
      <AnimatePresence mode="wait">
        <motion.aside
          key={lesson.id}
          role="dialog"
          aria-live="polite"
          aria-label={text.title}
          initial={{ y: lesson.position === 'top' ? -30 : 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-x-3 z-50 mx-auto flex max-w-md items-end gap-2 ${
            lesson.position === 'top' ? 'top-3' : bottom
          }`}
        >
          <img
            src="/assets/huntmaster.png"
            alt="Huntmaster"
            className="h-16 w-16 shrink-0 object-contain drop-shadow-[0_3px_0_#000]"
          />
          <div className="flex-1 rounded-2xl rounded-bl-none border-[3px] border-black bg-white p-3 shadow-[0_4px_0_#000]">
            <div className="flex items-center justify-between gap-2">
              <p className="font-comic text-lg leading-tight text-bark">{text.title}</p>
              <span className="text-xs font-bold text-bark/50">
                {t('guide.step', {
                  n: guide.findIndex((l) => l.id === lesson.id) + 1,
                  total: guide.length,
                })}
              </span>
            </div>
            <p className="mt-1 text-sm leading-snug text-bark">{text.text}</p>
            {blocking ? (
              <button
                type="button"
                onClick={() => dismissLesson(lesson.id)}
                className="mt-2 min-h-[48px] w-full rounded-xl border-[3px] border-black bg-yellow-300 font-comic text-lg shadow-[0_3px_0_#000] active:translate-y-0.5"
              >
                {t('guide.next')}
              </button>
            ) : (
              <div className="mt-2 flex items-center justify-between">
                <span className="flex items-center gap-1 text-xs font-bold text-bark/70">
                  <Icon name="tap" className="h-5 w-5 animate-bounce" />
                  {t('guide.doIt')}
                </span>
                <button
                  type="button"
                  onClick={() => dismissLesson(lesson.id)}
                  className="min-h-[40px] px-2 text-xs text-bark/60 underline"
                >
                  {t('guide.skipStep')}
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={skipGuide}
              className="mt-1 min-h-[32px] w-full text-center text-[11px] text-bark/50 underline"
            >
              {t('guide.skip')}
            </button>
          </div>
        </motion.aside>
      </AnimatePresence>
    </>
  );
}
