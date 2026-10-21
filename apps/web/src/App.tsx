import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DevPanel } from './components/DevPanel';
import { flush, track } from './game/analytics';
import { useGame } from './game/store';
import { CombatScreen } from './screens/CombatScreen';
import { HomeScreen } from './screens/HomeScreen';
import { PickScreen } from './screens/PickScreen';
import { ResultScreen } from './screens/ResultScreen';

export function App() {
  const { hydrated, screen, toast, toastSeq, clearToast } = useGame();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clearToast, 2600);
    return () => clearTimeout(t);
  }, [toast, toastSeq, clearToast]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        void track('session_end');
        void flush();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  return (
    <div
      className="min-h-[100dvh] bg-bark bg-cover bg-center font-sans"
      style={{
        backgroundImage:
          'linear-gradient(rgba(20,10,0,.25),rgba(20,10,0,.55)),url(/assets/bg/sherbert-forest.png)',
      }}
    >
      <main className="mx-auto max-w-md">
        {!hydrated ? (
          <p className="grid min-h-[100dvh] place-items-center font-comic text-2xl text-white">
            Cargando…
          </p>
        ) : (
          <>
            {screen === 'home' && <HomeScreen />}
            {screen === 'pick' && <PickScreen />}
            {screen === 'combat' && <CombatScreen />}
            {screen === 'result' && <ResultScreen />}
          </>
        )}
      </main>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toastSeq}
            role="alert"
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            className="fixed inset-x-3 top-3 z-40 mx-auto max-w-md rounded-2xl border-[3px] border-black bg-yellow-200 px-4 py-3 text-center font-bold text-bark shadow-[0_4px_0_#000]"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <DevPanel />
    </div>
  );
}
