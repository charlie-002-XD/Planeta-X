import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { regionDeHallazgo } from '../bandas.js'
import { exportarHallazgos } from '../api.js'

const TIPOS = ['asteroide', 'cometa', 'planeta']

export default function ReportPanel({ regiones, pendiente, hallazgos, estadoApi, onEnviar, onCancelar, onRecargar }) {
  const [tipo, setTipo] = useState('asteroide')
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setError('')
  }, [pendiente])

  const enviar = async (e) => {
    e.preventDefault()
    setEnviando(true)
    setError('')
    try {
      await onEnviar({ tipo, comentario: comentario.trim() })
      setComentario('')
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  const infoBanda = (id) => regiones.flatMap((r) => r.bandas).find((b) => b.id === id)
  const nombreRegion = (h) => {
    const r = regiones.find((reg) => reg.id === regionDeHallazgo(h))
    return r?.designacion ?? regionDeHallazgo(h)
  }

  return (
    <motion.aside
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 120, damping: 18 }}
      className="flex flex-col gap-4"
    >
      <div className="panel p-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Nuevo reporte</h2>
        <AnimatePresence mode="wait" initial={false}>
          {pendiente ? (
            <motion.form
              key="form"
              onSubmit={enviar}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-3 flex flex-col gap-3"
            >
              <dl className="grid grid-cols-2 gap-2 font-mono text-xs">
                <Dato etiqueta="X" valor={pendiente.x} />
                <Dato etiqueta="Y" valor={pendiente.y} />
                <Dato etiqueta="Banda" valor={`${infoBanda(pendiente.banda)?.longitud.toFixed(1)} µm`} />
                <Dato etiqueta="Época" valor={pendiente.epoca} />
              </dl>
              <div className="flex gap-2">
                {TIPOS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs capitalize transition-colors ${
                      tipo === t ? 'border-cyan-300/60 bg-cyan-400/15 text-cyan-100' : 'border-white/10 text-slate-400 hover:border-white/25'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Comentario: brillo, dirección del movimiento…"
                className="resize-none rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none"
              />
              {error && <p className="text-xs text-rose-300">⚠ {error}</p>}
              <div className="flex gap-2">
                <motion.button
                  type="submit"
                  disabled={enviando}
                  whileTap={{ scale: 0.97 }}
                  className="flex-1 rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-space-950 shadow-[0_0_20px_rgba(34,211,238,0.4)] transition-opacity disabled:opacity-60"
                >
                  {enviando ? 'Enviando…' : 'Enviar hallazgo'}
                </motion.button>
                <button
                  type="button"
                  onClick={onCancelar}
                  className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:border-white/25"
                >
                  Cancelar
                </button>
              </div>
            </motion.form>
          ) : (
            <motion.p
              key="ayuda"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-3 text-sm leading-relaxed text-slate-400"
            >
              Compara las dos épocas y haz <span className="text-cyan-200">clic</span> sobre cualquier objeto que cambie de
              posición (asteroide, cometa o planeta) para marcar sus coordenadas.
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="panel flex min-h-0 flex-1 flex-col p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Hallazgos <span className="text-slate-500">({hallazgos.length})</span>
          </h2>
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${estadoApi === 'ok' ? 'bg-emerald-400' : estadoApi === 'error' ? 'bg-rose-400' : 'bg-amber-300'}`}
              title={`API: ${estadoApi}`}
            />
            <button type="button" onClick={onRecargar} className="text-xs text-slate-400 hover:text-cyan-200">
              Recargar
            </button>
            <MenuExportar deshabilitado={estadoApi !== 'ok' || hallazgos.length === 0} />
          </div>
        </div>
        {estadoApi === 'error' && (
          <p className="mt-2 text-xs text-rose-300">No se pudo conectar con el backend PHP (¿está corriendo en :8000?).</p>
        )}
        <ul className="mt-3 flex max-h-80 flex-col gap-2 overflow-y-auto pr-1 lg:max-h-none">
          <AnimatePresence initial={false}>
            {[...hallazgos].reverse().map((h) => (
              <motion.li
                key={h.id}
                layout
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-lg border border-white/5 bg-black/30 px-3 py-2"
              >
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="text-slate-200">
                    #{h.id} · ({h.x}, {h.y})
                    <span className="ml-1.5 text-[10px] text-slate-500">{nombreRegion(h)}</span>
                  </span>
                  <span style={{ color: infoBanda(h.banda)?.color }}>
                    {infoBanda(h.banda)?.longitud.toFixed(1)} µm · {h.epoca}
                  </span>
                </div>
                {(h.tipo || h.comentario) && (
                  <p className="mt-1 text-xs text-slate-400">
                    {h.tipo && <span className="capitalize text-slate-300">{h.tipo}</span>}
                    {h.tipo && h.comentario && ' — '}
                    {h.comentario}
                  </p>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
          {hallazgos.length === 0 && estadoApi === 'ok' && <li className="text-xs text-slate-500">Aún no hay reportes.</li>}
        </ul>
      </div>
    </motion.aside>
  )
}

// Botón discreto "⤓ Exportar" con un pequeño menú CSV / JSON (descarga desde el backend PHP).
function MenuExportar({ deshabilitado }) {
  const [abierto, setAbierto] = useState(false)
  const [estado, setEstado] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (!abierto) return
    const cerrar = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.contains(e.target)) setAbierto(false)
    }
    document.addEventListener('pointerdown', cerrar)
    document.addEventListener('keydown', cerrar)
    return () => {
      document.removeEventListener('pointerdown', cerrar)
      document.removeEventListener('keydown', cerrar)
    }
  }, [abierto])

  useEffect(() => {
    if (!estado || estado === 'descargando') return
    const id = setTimeout(() => setEstado(''), 2500)
    return () => clearTimeout(id)
  }, [estado])

  const descargar = async (formato) => {
    setAbierto(false)
    setEstado('descargando')
    try {
      await exportarHallazgos(formato)
      setEstado('ok')
    } catch {
      setEstado('error')
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={deshabilitado || estado === 'descargando'}
        onClick={() => setAbierto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        title={estado === 'error' ? 'No se pudo exportar' : 'Exportar todos los hallazgos'}
        className={`flex items-center gap-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          estado === 'error' ? 'text-rose-300' : estado === 'ok' ? 'text-emerald-300' : 'text-slate-400 hover:text-cyan-200'
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" />
        </svg>
        {estado === 'descargando' ? '…' : estado === 'ok' ? 'Listo' : estado === 'error' ? 'Error' : 'Exportar'}
      </button>
      <AnimatePresence>
        {abierto && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full z-20 mt-1.5 flex w-28 flex-col overflow-hidden rounded-lg border border-white/10 bg-space-900/95 py-1 shadow-xl backdrop-blur"
          >
            {[
              ['csv', 'CSV (.csv)'],
              ['json', 'JSON (.json)'],
            ].map(([formato, etiqueta]) => (
              <button
                key={formato}
                type="button"
                role="menuitem"
                onClick={() => descargar(formato)}
                className="px-3 py-1.5 text-left font-mono text-xs text-slate-300 hover:bg-cyan-400/10 hover:text-cyan-100"
              >
                {etiqueta}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Dato({ etiqueta, valor }) {
  return (
    <div className="rounded-md bg-black/40 px-2 py-1.5">
      <dt className="text-[10px] uppercase text-slate-500">{etiqueta}</dt>
      <dd className="text-slate-100">{valor}</dd>
    </div>
  )
}
