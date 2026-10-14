import { motion } from 'framer-motion';
import type { TutorialStep } from '@snac-hunters/engine';

interface Props {
  readonly step: TutorialStep | undefined;
  readonly index: number;
  readonly total: number;
  readonly onNext: () => void;
}

/** Burbuja del Huntmaster que guía el tutorial. Los textos vienen de config/tutorial.json. */
export function Coach({ step, index, total, onNext }: Props) {
  return (
    step && (
      <motion.aside
        key={step.id}
        role="status"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex items-end gap-2"
      >
        <img
          src="/assets/huntmaster.png"
          alt="Huntmaster"
          className="h-16 w-16 shrink-0 object-contain"
        />
        <div className="flex-1 rounded-2xl rounded-bl-none border-[3px] border-black bg-white p-3 shadow-[0_4px_0_#000]">
          <div className="flex items-center justify-between">
            <p className="font-comic text-lg leading-tight text-bark">{step.title}</p>
            <span className="text-xs font-bold text-bark/50">
              {index + 1}/{total}
            </span>
          </div>
          <p className="mt-1 text-sm leading-snug text-bark">{step.text}</p>
          {step.advance === 'next' && (
            <button
              type="button"
              onClick={onNext}
              className="mt-2 min-h-[48px] w-full rounded-xl border-[3px] border-black bg-yellow-300 font-comic text-lg shadow-[0_3px_0_#000] active:translate-y-0.5"
            >
              Entendido
            </button>
          )}
        </div>
      </motion.aside>
    )
  );
}
