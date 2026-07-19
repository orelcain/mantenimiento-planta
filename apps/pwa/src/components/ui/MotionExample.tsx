import { motion } from 'motion/react'

/**
 * Ejemplo mínimo de animación con `motion` (sucesor de framer-motion).
 * Demuestra: entrada animada, stagger de hijos, hover/tap y un pulso en loop.
 * No está ruteado en la app; sirve como referencia para nuevos desarrollos.
 */
export function MotionExample() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="max-w-sm rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm"
    >
      <motion.h3
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="text-lg font-semibold leading-none tracking-tight"
      >
        Animación con motion
      </motion.h3>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-2 text-sm text-muted-foreground"
      >
        Entrada, hover, tap y un pulso en loop, con tokens theme-aware.
      </motion.p>
      <div className="mt-4 flex items-center gap-3">
        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Presióname
        </motion.button>
        <motion.span
          animate={{ scale: [1, 1.25, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          className="inline-block h-3 w-3 rounded-full bg-primary"
          aria-hidden="true"
        />
      </div>
    </motion.div>
  )
}
