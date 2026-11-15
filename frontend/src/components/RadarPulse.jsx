import { motion } from 'framer-motion'

// Pulso de radar: 3 anillos que se expanden y desvanecen con retardo escalonado.
export function RadarPulse({ xPct, yPct, color = '#22d3ee' }) {
  return (
    <motion.div
      className="pointer-events-none absolute"
      style={{ left: `${xPct}%`, top: `${yPct}%` }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute -left-4 -top-4 h-8 w-8 rounded-full border-2"
          style={{ borderColor: color, boxShadow: `0 0 16px ${color}` }}
          initial={{ scale: 0.2, opacity: 0.9 }}
          animate={{ scale: 4, opacity: 0 }}
          transition={{ duration: 1.4, delay: i * 0.25, ease: 'easeOut' }}
        />
      ))}
      <motion.span
        className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full"
        style={{ background: color, boxShadow: `0 0 12px ${color}` }}
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.6, 1] }}
        transition={{ duration: 0.4 }}
      />
    </motion.div>
  )
}

// Retícula de la marca pendiente de confirmar (gira de forma continua).
export function MarcaPendiente({ xPct, yPct }) {
  return (
    <motion.div
      className="pointer-events-none absolute"
      style={{ left: `${xPct}%`, top: `${yPct}%` }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <motion.span
        className="absolute -left-5 -top-5 h-10 w-10 rounded-full border-2 border-dashed border-cyan-300"
        animate={{ rotate: 360 }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
      />
      <span className="absolute -left-7 top-0 h-px w-4 bg-cyan-300" />
      <span className="absolute left-3 top-0 h-px w-4 bg-cyan-300" />
      <span className="absolute -top-7 left-0 h-4 w-px bg-cyan-300" />
      <span className="absolute left-0 top-3 h-4 w-px bg-cyan-300" />
    </motion.div>
  )
}

// Marcador de un hallazgo ya guardado en el backend.
export function MarcadorHallazgo({ hallazgo, xPct, yPct, color, atenuado }) {
  return (
    <motion.div
      className="group absolute"
      style={{ left: `${xPct}%`, top: `${yPct}%` }}
      initial={{ scale: 0 }}
      animate={{ scale: 1, opacity: atenuado ? 0.35 : 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
    >
      <span
        className="absolute -left-2 -top-2 h-4 w-4 rotate-45 border-2"
        style={{ borderColor: color, boxShadow: `0 0 10px ${color}` }}
      />
      <span className="pointer-events-none absolute left-4 top-2 z-20 hidden whitespace-nowrap rounded-md border border-white/10 bg-space-900/95 px-2 py-1 font-mono text-[11px] text-slate-200 group-hover:block">
        #{hallazgo.id} · ({hallazgo.x}, {hallazgo.y}) · Época {hallazgo.epoca}
        {hallazgo.tipo ? ` · ${hallazgo.tipo}` : ''}
      </span>
    </motion.div>
  )
}
