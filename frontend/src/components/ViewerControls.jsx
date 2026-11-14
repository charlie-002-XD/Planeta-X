import { motion } from 'framer-motion'

const MODOS = [
  { id: 'slider', etiqueta: 'Antes / Después' },
  { id: 'blink', etiqueta: 'Parpadeo (Blink)' },
]

export default function ViewerControls({ modo, onModo, intervalo, onIntervalo, reproduciendo, onReproducir }) {
  return (
    <div className="panel flex flex-wrap items-center gap-4 px-4 py-3">
      <div className="relative flex rounded-xl bg-black/40 p-1" role="tablist" aria-label="Modo de comparación">
        {MODOS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={modo === m.id}
            onClick={() => onModo(m.id)}
            className="relative rounded-lg px-4 py-1.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            {modo === m.id && (
              <motion.span
                layoutId="modo-activo"
                className="absolute inset-0 rounded-lg bg-cyan-400/20 ring-1 ring-cyan-300/50"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className={`relative ${modo === m.id ? 'text-cyan-100' : 'text-slate-400'}`}>{m.etiqueta}</span>
          </button>
        ))}
      </div>

      <motion.div
        className="flex flex-1 items-center gap-3"
        animate={{ opacity: modo === 'blink' ? 1 : 0.35 }}
        style={{ pointerEvents: modo === 'blink' ? 'auto' : 'none' }}
      >
        <motion.button
          type="button"
          onClick={onReproducir}
          whileTap={{ scale: 0.9 }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-pink-300/50 bg-pink-400/15 text-pink-100 outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
          aria-label={reproduciendo ? 'Pausar parpadeo' : 'Reanudar parpadeo'}
        >
          {reproduciendo ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M7 5l12 7-12 7z" /></svg>
          )}
        </motion.button>
        <label className="flex flex-1 items-center gap-3 text-xs text-slate-400">
          <span className="whitespace-nowrap">Velocidad</span>
          <input
            type="range"
            min={100}
            max={2000}
            step={50}
            value={intervalo}
            onChange={(e) => onIntervalo(Number(e.target.value))}
            className="range-cyan"
            aria-label="Intervalo de parpadeo en milisegundos"
          />
          <span className="w-16 whitespace-nowrap text-right font-mono text-sm text-slate-200">{(intervalo / 1000).toFixed(2)} s</span>
        </label>
      </motion.div>
    </div>
  )
}
