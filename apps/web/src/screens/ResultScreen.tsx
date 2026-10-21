import { motion } from 'framer-motion';
import { Button } from '../components/Button';
import { MonsterPortrait } from '../components/MonsterCard';
import { isEnabled } from '../game/config';
import { useGame } from '../game/store';
import { TROPHY_IMG } from './CombatScreen';

const TITLES = {
  defeat: { title: '¡SNAC derrotado!', icon: '/assets/icons/defeat.png', tone: 'text-green-700' },
  study: {
    title: 'SNAC estudiado',
    icon: '/assets/icons/sherbert-forest.png',
    tone: 'text-blue-700',
  },
  flee: { title: 'Huiste a salvo', icon: '/assets/icons/shield.png', tone: 'text-bark' },
  ko: { title: '¡KO!', icon: '/assets/icons/skull.png', tone: 'text-red-700' },
} as const;

const SERVER_TEXT = {
  idle: '',
  pending: 'Validando en el servidor (re-simulación)…',
  ok: '✓ Validado por el servidor',
  rejected: '✗ El servidor rechazó la partida',
  offline: '⚠ Guardado local — API no disponible',
  disabled: 'Validación en servidor desactivada (feature toggle)',
} as const;

export function ResultScreen() {
  const { combat, active, server, progress, goHome, openHunt } = useGame();
  if (!combat || !combat.outcome || !active) return null;
  const t = TITLES[combat.outcome];

  return (
    <div className="flex min-h-[100dvh] flex-col justify-center gap-4 px-4 py-6">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="rounded-3xl border-4 border-black bg-sherbet p-5 text-center shadow-[0_6px_0_#000]"
      >
        <img src={t.icon} alt="" className="mx-auto h-16 object-contain" />
        <h1 className={`mt-2 font-comic text-4xl ${t.tone}`}>{t.title}</h1>
        {combat.ko && combat.outcome === 'defeat' && (
          <p className="text-sm text-red-700">
            Quedaste KO en la misma tirada, pero conservas el premio.
          </p>
        )}
        <MonsterPortrait
          monster={combat.monster}
          className={`mx-auto my-3 h-36 ${combat.outcome === 'defeat' ? 'grayscale' : ''}`}
        />
        {combat.trophy && (
          <div className="flex items-center justify-center gap-3">
            <img src={TROPHY_IMG(combat.trophy)} alt="" className="h-16 object-contain" />
            <span className="font-comic text-xl">Trofeo {combat.trophy}</span>
          </div>
        )}
        <p className="mt-2 text-sm text-bark/70">
          Relanzamientos: {combat.rerolls} · HPie restante: {combat.hp} · Puntos totales:{' '}
          {progress.points}
        </p>
        {server.state !== 'idle' && (
          <p
            className={`mt-3 rounded-xl border-2 border-black px-3 py-2 text-sm font-bold ${
              server.state === 'ok'
                ? 'bg-green-200'
                : server.state === 'pending'
                  ? 'bg-yellow-100'
                  : 'bg-orange-200'
            }`}
          >
            {SERVER_TEXT[server.state]}
            {server.message && <span className="block font-normal">{server.message}</span>}
          </p>
        )}
      </motion.div>

      <div className="grid gap-3">
        {isEnabled('freeHunt') && <Button onClick={openHunt}>Cazar otro SNAC</Button>}
        <Button variant="secondary" onClick={goHome}>
          Volver al inicio
        </Button>
      </div>
    </div>
  );
}
