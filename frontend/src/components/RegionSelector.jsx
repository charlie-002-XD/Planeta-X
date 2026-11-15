import { AnimatePresence, motion } from 'framer-motion'
import { useIdioma } from '../i18n.jsx'

// Selector de región (esquina superior derecha). Lista las regiones de regions.json.
export default function RegionSelector({ regiones, region, onCambiar }) {
  const { t, td } = useIdioma()
  const info =
    region.tipo === 'sintetica'
      ? `Δt = ${td(region.delta)}`
      : `${region.ra_hms ?? region.ra} ${region.dec_dms ?? region.dec} · Δt = ${td(region.delta)}`
  const nombre = (r) =>
    r.tipo === 'real' ? `${r.designacion} · ${td(r.nombre)}` : r.tipo === 'simulada' ? td(r.nombre) : `${r.nombre} (${t('region.sintetica')})`

  return (
    <div className="flex flex-col items-end gap-1 font-mono text-xs text-slate-500">
      <label className="flex items-center gap-2">
        <span>{t('region.etiqueta')}</span>
        <span className="relative">
          <select
            value={region.id}
            onChange={(e) => onCambiar(e.target.value)}
            aria-label={t('region.aria')}
            className="cursor-pointer appearance-none rounded-lg border border-white/10 bg-space-900/80 py-1 pl-2.5 pr-7 text-slate-200 outline-none transition-colors hover:border-cyan-300/40 focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            {regiones.map((r) => (
              <option key={r.id} value={r.id} className="bg-space-900">
                {nombre(r)}
              </option>
            ))}
          </select>
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-cyan-300"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </label>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={region.id}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15 }}
          className="hidden md:block"
        >
          {info} · {region.tamano_px} × {region.tamano_px} px
        </motion.p>
      </AnimatePresence>
    </div>
  )
}
