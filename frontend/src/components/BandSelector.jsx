import { motion } from 'framer-motion'
import { BANDAS } from '../bandas.js'

// Selector lateral de bandas. El resaltado activo usa `layoutId`: Framer Motion
// anima automáticamente su posición/tamaño de una tarjeta a otra.
export default function BandSelector({ bandaActiva, onCambiar }) {
  return (
    <motion.nav
      initial={{ x: -40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 120, damping: 18 }}
      className="panel flex flex-col gap-2 p-3"
      aria-label="Bandas espectrales"
    >
      <h2 className="px-2 pb-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
        Bandas IR cercano
      </h2>
      {BANDAS.map((banda, i) => {
        const activa = banda.id === bandaActiva
        return (
          <motion.button
            key={banda.id}
            type="button"
            onClick={() => onCambiar(banda.id)}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.07 }}
            whileHover={{ x: 4 }}
            whileTap={{ scale: 0.97 }}
            aria-pressed={activa}
            className="relative flex items-center gap-3 rounded-xl px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            {activa && (
              <motion.span
                layoutId="banda-activa"
                className="absolute inset-0 rounded-xl border"
                style={{ borderColor: `${banda.color}88`, background: `${banda.color}1a`, boxShadow: `0 0 24px ${banda.color}33` }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <span
              className="relative h-3 w-3 shrink-0 rounded-full"
              style={{ background: banda.color, boxShadow: activa ? `0 0 12px ${banda.color}` : 'none' }}
            />
            <span className="relative flex flex-col">
              <span className="font-mono text-sm text-slate-100">
                {banda.longitud.toFixed(1)} µm <span className="text-slate-500">· {banda.nombre}</span>
              </span>
              <span className="text-xs text-slate-400">{banda.descripcion}</span>
            </span>
          </motion.button>
        )
      })}
      <div className="mt-2 px-2">
        <div
          className="h-1.5 w-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${BANDAS.map((b) => b.color).join(', ')})` }}
        />
        <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
          <span>0.75 µm</span>
          <span>5.0 µm</span>
        </div>
      </div>
    </motion.nav>
  )
}
