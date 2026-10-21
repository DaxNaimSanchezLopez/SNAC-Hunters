import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

/** Hoja inferior (móvil) / diálogo centrado. Tocar fuera la cierra si hay onClose. */
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-30 grid place-items-end bg-black/60 p-3 sm:place-items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-label={title}
        initial={{ y: 80 }}
        animate={{ y: 0 }}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-3xl border-4 border-black bg-sherbet p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-comic text-2xl text-bark">{title}</h3>
        {children}
      </motion.div>
    </motion.div>
  );
}
