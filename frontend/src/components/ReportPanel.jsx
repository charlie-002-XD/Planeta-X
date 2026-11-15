import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { desplazamientoPx, regionDeHallazgo, tieneDestino } from '../bandas.js'
import { MODO_LOCAL, exportarHallazgos } from '../api.js'
import { useIdioma } from '../i18n.jsx'

const TIPOS = ['asteroide', 'cometa', 'planeta']

export default function ReportPanel({
  regiones,
  regionActual,
  pendiente,
  hallazgos,
  estadoApi,
  modoDatos,
  onEnviar,
  onCancelar,
  onRecargar,
  onArmarDestino,
  onQuitarDestino,
}) {
  const { t, td } = useIdioma()
  const [tipo, setTipo] = useState('asteroide')
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [soloRegion, setSoloRegion] = useState(true)

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
  const deRegion = hallazgos.filter((h) => regionDeHallazgo(h) === regionActual?.id)
  const visibles = soloRegion ? deRegion : hallazgos

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
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t('reporte.titulo')}</h2>
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
                <Dato etiqueta={t('reporte.banda')} valor={`${infoBanda(pendiente.banda)?.longitud.toFixed(1)} µm`} />
                <Dato etiqueta={t('reporte.epoca')} valor={tieneDestino(pendiente) ? `${pendiente.epoca} → B` : pendiente.epoca} />
              </dl>
              {tieneDestino(pendiente) ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-cyan-300/30 bg-cyan-400/10 px-2 py-1.5 font-mono text-xs">
                  <span className="text-cyan-100">
                    {t('reporte.destino')} ({pendiente.x2}, {pendiente.y2}) · Δ {desplazamientoPx(pendiente).toFixed(1)} px
                  </span>
                  <button type="button" onClick={onQuitarDestino} className="text-[10px] text-slate-400 hover:text-rose-200">
                    {t('reporte.quitar')}
                  </button>
                </div>
              ) : pendiente.epoca === 'B' ? (
                <p className="rounded-lg border border-dashed border-white/15 px-3 py-1.5 text-center text-xs text-slate-400">
                  {t('reporte.clic_en_a')}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={onArmarDestino}
                  disabled={pendiente.armarDestino}
                  className="rounded-lg border border-dashed border-cyan-300/50 px-3 py-1.5 text-xs text-cyan-100 transition-colors hover:bg-cyan-400/10 disabled:animate-pulse disabled:cursor-default"
                >
                  {t(pendiente.armarDestino ? 'reporte.armado' : 'reporte.armar')}
                </button>
              )}
              <div className="flex gap-2">
                {TIPOS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTipo(id)}
                    aria-pressed={tipo === id}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                      tipo === id ? 'border-cyan-300/60 bg-cyan-400/15 text-cyan-100' : 'border-white/10 text-slate-400 hover:border-white/25'
                    }`}
                  >
                    {t(`tipo.${id}`)}
                  </button>
                ))}
              </div>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder={t('reporte.comentario')}
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
                  {t(enviando ? 'reporte.enviando' : 'reporte.enviar')}
                </motion.button>
                <button
                  type="button"
                  onClick={onCancelar}
                  className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:border-white/25"
                >
                  {t('reporte.cancelar')}
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
              {t('reporte.ayuda.1')} <span className="text-cyan-200">{t('reporte.ayuda.clic')}</span>{' '}
              {t('reporte.ayuda.2')} <span className="text-cyan-200">{t('reporte.ayuda.vector')}</span> A → B.
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="panel flex min-h-0 flex-1 flex-col p-4">
        <div className="flex items-center justify-between">
          <h2 className="whitespace-nowrap text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            {t('hallazgos.titulo')} <span className="text-slate-500">({visibles.length})</span>
          </h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onRecargar} className="text-xs text-slate-400 hover:text-cyan-200">
              {t('hallazgos.recargar')}
            </button>
            <MenuExportar modoDatos={modoDatos} deshabilitado={estadoApi !== 'ok' || hallazgos.length === 0} />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <IndicadorModo estadoApi={estadoApi} modoDatos={modoDatos} />
          <div role="tablist" aria-label={t('hallazgos.filtrar')} className="inline-flex rounded-full border border-white/10 p-0.5 font-mono text-[10px]">
            {[
              [true, t('hallazgos.esta_region'), deRegion.length],
              [false, t('hallazgos.todos'), hallazgos.length],
            ].map(([valor, etiqueta, n]) => (
              <button
                key={String(valor)}
                type="button"
                role="tab"
                aria-selected={soloRegion === valor}
                onClick={() => setSoloRegion(valor)}
                title={valor ? t('hallazgos.solo', { region: regionActual?.designacion ?? t('hallazgos.region_activa') }) : t('hallazgos.todas_regiones')}
                className={`whitespace-nowrap rounded-full px-2 py-0.5 transition-colors ${
                  soloRegion === valor ? 'bg-cyan-400/15 text-cyan-100' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {etiqueta} · {n}
              </button>
            ))}
          </div>
        </div>
        {estadoApi === 'error' && (
          <p className="mt-2 text-xs text-rose-300">{t('hallazgos.error')}</p>
        )}
        <ul className="mt-3 flex max-h-80 flex-col gap-2 overflow-y-auto pr-1 lg:max-h-none">
          <AnimatePresence initial={false}>
            {[...visibles].reverse().map((h) => (
              <motion.li
                key={h.id}
                layout
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-lg border border-white/5 bg-black/30 px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2 font-mono text-xs">
                  <span className="min-w-0 text-slate-200">
                    <span className="whitespace-nowrap">#{h.id} · ({h.x}, {h.y})</span>
                    {tieneDestino(h) && (
                      <>
                        {' '}
                        <span className="whitespace-nowrap text-cyan-200">→ ({h.x2}, {h.y2})</span>
                      </>
                    )}
                    <span className="ml-1.5 text-[10px] text-slate-500">{nombreRegion(h)}</span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap" style={{ color: infoBanda(h.banda)?.color }}>
                    {infoBanda(h.banda)?.longitud.toFixed(1)} µm · {tieneDestino(h) ? `Δ ${desplazamientoPx(h).toFixed(0)} px` : h.epoca}
                  </span>
                </div>
                {(h.tipo || h.comentario) && (
                  <p className="mt-1 text-xs text-slate-400">
                    {h.tipo && <span className="text-slate-300">{TIPOS.includes(h.tipo) ? t(`tipo.${h.tipo}`) : h.tipo}</span>}
                    {h.tipo && h.comentario && ' — '}
                    {td(h.comentario)}
                  </p>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
          {visibles.length === 0 && estadoApi === 'ok' && (
            <li className="text-xs text-slate-500">
              {t(soloRegion && hallazgos.length > 0 ? 'hallazgos.vacio_region' : 'hallazgos.vacio')}
            </li>
          )}
        </ul>
      </div>
    </motion.aside>
  )
}

function IndicadorModo({ estadoApi, modoDatos }) {
  const { t } = useIdioma()
  const local = modoDatos === MODO_LOCAL
  const [clave, punto] =
    estadoApi === 'cargando'
      ? ['estado.conectando', 'bg-amber-300 animate-pulse']
      : estadoApi === 'error'
        ? ['estado.error', 'bg-rose-400']
        : local
          ? ['estado.local', 'bg-amber-300']
          : ['estado.servidor', 'bg-emerald-400']
  const [texto, ayuda] = [t(clave), t(`${clave}.ayuda`)]
  return (
    <span
      title={ayuda}
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] ${
        local && estadoApi === 'ok' ? 'border-amber-300/30 text-amber-200/90' : 'border-white/10 text-slate-400'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${punto}`} />
      {texto}
    </span>
  )
}

// Botón discreto "⤓ Exportar" con un pequeño menú CSV / JSON (backend PHP o, en modo demo, localStorage).
function MenuExportar({ modoDatos, deshabilitado }) {
  const { t } = useIdioma()
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
      await exportarHallazgos(formato, modoDatos)
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
        title={t(estado === 'error' ? 'exportar.fallo' : 'exportar.titulo')}
        className={`flex items-center gap-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          estado === 'error' ? 'text-rose-300' : estado === 'ok' ? 'text-emerald-300' : 'text-slate-400 hover:text-cyan-200'
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" />
        </svg>
        {estado === 'descargando' ? '…' : t(estado === 'ok' ? 'exportar.listo' : estado === 'error' ? 'exportar.error' : 'exportar.boton')}
      </button>
      <AnimatePresence>
        {abierto && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full z-20 mt-1.5 flex w-32 flex-col overflow-hidden rounded-lg border border-white/10 bg-space-900/95 py-1 shadow-xl backdrop-blur"
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
                className="whitespace-nowrap px-3 py-1.5 text-left font-mono text-xs text-slate-300 hover:bg-cyan-400/10 hover:text-cyan-100"
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
