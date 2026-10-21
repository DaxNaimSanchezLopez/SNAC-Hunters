import { useCallback } from 'react';
import { translate } from './i18n';
import type { MessageKey, Translate, Vars } from './i18n';
import { useGame } from './store';

/** Traductor ligado al idioma elegido por el jugador. */
export function useT(): Translate {
  const lang = useGame((s) => s.lang);
  return useCallback((key: MessageKey, vars?: Vars) => translate(lang, key, vars), [lang]);
}
