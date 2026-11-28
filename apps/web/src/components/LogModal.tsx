import { useMemo, useState } from 'react';
import { buildLog, logToText } from '../game/log';
import { useGame } from '../game/store';
import { useT } from '../game/useT';
import { Button } from './Button';
import { Modal } from './Modal';

const TONE = {
  player: 'font-bold text-bark',
  game: 'pl-4 text-bark/75',
  error: 'font-bold text-red-700',
} as const;

/**
 * Registro de acciones (feedback 2026-11-11): lo que hizo el jugador (en negritas) y lo que hizo
 * el juego (con sangría), más las acciones que el engine rechazó. Se puede copiar para reportar.
 */
export function LogModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { saved, lang, rejected } = useGame();
  const [copied, setCopied] = useState(false);
  const lines = useMemo(
    () => (saved ? buildLog(lang, saved.seed, saved.actions, rejected) : []),
    [saved, lang, rejected],
  );

  function copy() {
    if (!saved) return;
    void navigator.clipboard
      ?.writeText(logToText(saved.seed, lines))
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  }

  return (
    <Modal title={t('log.title')} onClose={onClose}>
      <p className="text-xs text-bark/70">{t('log.hint')}</p>
      <ol className="mt-2 max-h-[55dvh] overflow-y-auto rounded-2xl border-2 border-black/20 bg-white/70 p-2 text-xs leading-snug">
        {lines.length === 0 && <li className="text-bark/60">{t('log.empty')}</li>}
        {/* Lo más reciente arriba (es lo que se busca al reportar un error), pero dentro de
            cada paso la acción va antes de lo que provocó */}
        {[...lines]
          .map((l, i) => ({ ...l, i }))
          .sort((a, b) => b.step - a.step || a.i - b.i)
          .map((l, i) => (
            <li key={i} className={`flex gap-2 ${TONE[l.who]}`}>
              <span className="w-7 shrink-0 text-right tabular-nums opacity-50">{l.step}</span>
              <span>{l.text}</span>
            </li>
          ))}
      </ol>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={copy} disabled={lines.length === 0}>
          {copied ? t('log.copied') : t('log.copy')}
        </Button>
        <Button onClick={onClose}>{t('log.close')}</Button>
      </div>
    </Modal>
  );
}
