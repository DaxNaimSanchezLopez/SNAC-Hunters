import { useEffect, useState } from 'react';
import { allEvents, summarize } from '../game/analytics';
import type { LocalSummary } from '../game/analytics';
import { fetchServerStats } from '../game/api';
import { authEnabled } from '../game/auth';
import { API_URL, gameConfig, isEnabled } from '../game/config';
import { FACE_LABEL, FaceIcon } from './DieView';
import type { Face } from '@snac-hunters/engine';

/** Botón de desarrollo: visible solo en modo dev (o con VITE_SHOW_DEV=true). */
export const devButtonVisible =
  (import.meta.env.DEV || import.meta.env.VITE_SHOW_DEV === 'true') && isEnabled('devAnalytics');

export function DevPanel() {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<LocalSummary | null>(null);
  const [server, setServer] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    void allEvents().then((e) => setLocal(summarize(e)));
    fetchServerStats()
      .then((s) => setServer(JSON.stringify(s, null, 2)))
      .catch((e: unknown) => setServer(`No disponible: ${String(e)}`));
  }, [open]);

  if (!devButtonVisible) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-3 top-16 z-40 grid h-12 w-12 place-items-center rounded-full border-[3px] border-black bg-fuchsia-400 font-bold shadow-[0_3px_0_#000]"
        aria-label="Abrir panel de desarrollo"
      >
        DEV
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-3"
          onClick={() => setOpen(false)}
        >
          <div
            className="mx-auto max-w-md rounded-3xl border-4 border-black bg-white p-4 text-sm text-bark"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-comic text-2xl">Analítica (dev)</h2>
              <button
                type="button"
                className="min-h-[48px] px-3 font-bold"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>

            <h3 className="mt-2 font-bold">Este dispositivo (IndexedDB)</h3>
            {local ? (
              <ul className="list-inside list-disc">
                <li>Sesiones: {local.sessions}</li>
                <li>Combates: {local.combats}</li>
                <li>Resultados: {JSON.stringify(local.outcomes)}</li>
                <li>Relanzamientos promedio: {local.avgRerolls.toFixed(2)}</li>
                <li>
                  Tutorial completado {local.tutorialCompletions}×
                  {local.avgTutorialSeconds !== null &&
                    ` · promedio ${local.avgTutorialSeconds.toFixed(0)} s (meta < 300 s)`}
                </li>
                <li>Monstruos vistos: {JSON.stringify(local.monstersSeen)}</li>
              </ul>
            ) : (
              <p>Cargando…</p>
            )}
            {local && (
              <div className="mt-2 grid grid-cols-2 gap-1">
                {Object.entries(local.faceShare).map(([face, share]) => (
                  <div key={face} className="flex items-center gap-1 rounded bg-gray-100 p-1">
                    <FaceIcon face={face as Face} className="h-4 w-4" />
                    <span className="text-xs">
                      {FACE_LABEL[face as Face]} {((share ?? 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            )}

            <h3 className="mt-3 font-bold">Servidor ({API_URL})</h3>
            <pre className="max-h-48 overflow-auto rounded bg-gray-100 p-2 text-xs">
              {server || 'Cargando…'}
            </pre>

            <h3 className="mt-3 font-bold">Configuración</h3>
            <p>Auth Cognito: {authEnabled ? 'activa' : 'modo invitado (local)'}</p>
            <pre className="overflow-auto rounded bg-gray-100 p-2 text-xs">
              {JSON.stringify(gameConfig.features, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
