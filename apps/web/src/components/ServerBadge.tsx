import type { MessageKey } from '../game/i18n';
import { useGame } from '../game/store';
import { useT } from '../game/useT';

/** Estado de la validación en servidor (re-simulación de la partida completa). */
export function ServerBadge() {
  const t = useT();
  const server = useGame((s) => s.server);
  if (server.state === 'idle') return null;
  const tone =
    server.state === 'ok'
      ? 'bg-green-200'
      : server.state === 'pending'
        ? 'bg-yellow-100'
        : 'bg-orange-200';
  return (
    <p className={`mt-3 rounded-xl border-2 border-black px-3 py-2 text-sm font-bold ${tone}`}>
      {t(`server.${server.state}` as MessageKey)}
      {server.message && <span className="block font-normal">{server.message}</span>}
    </p>
  );
}
