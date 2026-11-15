import { motion } from 'framer-motion'
import { desplazamientoPx } from '../bandas.js'
import { useIdioma } from '../i18n.jsx'

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

// Marcador de un hallazgo guardado. Con vector de trayectoria se desliza entre (x, y) y (x2, y2) según la época.
export function MarcadorHallazgo({ hallazgo, xPct, yPct, color, atenuado }) {
  const left = `${xPct}%`
  const top = `${yPct}%`
  const { t } = useIdioma()
  const dp = desplazamientoPx(hallazgo)
  return (
    <motion.div
      className="group absolute"
      initial={{ scale: 0, left, top }}
      animate={{ scale: 1, opacity: atenuado ? 0.35 : 1, left, top }}
      transition={{
        type: 'spring',
        stiffness: 260,
        damping: 18,
        left: { type: 'spring', stiffness: 140, damping: 20 },
        top: { type: 'spring', stiffness: 140, damping: 20 },
      }}
    >
      <span
        className="absolute -left-2 -top-2 h-4 w-4 rotate-45 border-2"
        style={{ borderColor: color, boxShadow: `0 0 10px ${color}` }}
      />
      <span className="pointer-events-none absolute left-4 top-2 z-20 hidden whitespace-nowrap rounded-md border border-white/10 bg-space-900/95 px-2 py-1 font-mono text-[11px] text-slate-200 group-hover:block">
        #{hallazgo.id} · ({hallazgo.x}, {hallazgo.y})
        {dp !== null ? ` → (${hallazgo.x2}, ${hallazgo.y2}) · Δ ${dp.toFixed(1)} px` : ` · ${t('epoca.nombre', { epoca: hallazgo.epoca })}`}
        {hallazgo.tipo ? ` · ${t(`tipo.${hallazgo.tipo}`)}` : ''}
      </span>
    </motion.div>
  )
}

// Vector de trayectoria Época A → Época B (dentro de un <svg>): línea punteada neón animada con flecha.
// Las coordenadas están en píxeles de la imagen original (viewBox = tamaño de la imagen).
export function VectorTrayectoria({ x1, y1, x2, y2, tamano, color, atenuado }) {
  const largo = Math.hypot(x2 - x1, y2 - y1)
  if (largo < 1) return null
  const u = tamano / 512 // unidad: 1 px de una imagen de 512
  const [dx, dy] = [(x2 - x1) / largo, (y2 - y1) / largo]
  const margen = Math.min(9 * u, largo / 4) // no tapar los rombos de los extremos
  const punta = Math.min(9 * u, largo / 3)
  const [ax, ay] = [x1 + dx * margen, y1 + dy * margen]
  const [bx, by] = [x2 - dx * margen, y2 - dy * margen]
  const [cx, cy] = [bx - dx * punta, by - dy * punta]
  const flecha = [
    [bx, by],
    [cx - dy * punta * 0.55, cy + dx * punta * 0.55],
    [cx + dy * punta * 0.55, cy - dx * punta * 0.55],
  ]
  const trazo = 4 * u
  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: atenuado ? 0.3 : 1 }}
      exit={{ opacity: 0 }}
      style={{ filter: `drop-shadow(0 0 ${3 * u}px ${color}) drop-shadow(0 0 ${1 * u}px ${color})` }}
    >
      <motion.line
        x1={ax}
        y1={ay}
        x2={cx}
        y2={cy}
        stroke={color}
        strokeWidth={1.6 * u}
        strokeLinecap="round"
        strokeDasharray={`${trazo} ${trazo * 0.8}`}
        animate={{ strokeDashoffset: [0, -trazo * 1.8] }}
        transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }}
      />
      <polygon points={flecha.map((p) => p.join(',')).join(' ')} fill={color} />
    </motion.g>
  )
}

// Distancia Δpx del vector, rotulada sobre su punto medio (capa HTML para que el texto no escale con el SVG).
export function EtiquetaDesplazamiento({ xPct, yPct, px, color, atenuado }) {
  return (
    <motion.span
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[170%] whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] leading-none"
      style={{ left: `${xPct}%`, top: `${yPct}%`, color, border: `1px solid ${color}66` }}
      initial={{ opacity: 0 }}
      animate={{ opacity: atenuado ? 0.35 : 1 }}
      exit={{ opacity: 0 }}
    >
      Δ {px.toFixed(1)} px
    </motion.span>
  )
}
