import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BANDAS, TAMANO_IMAGEN, imagenDe } from '../bandas.js'
import { MarcadorHallazgo, MarcaPendiente, RadarPulse } from './RadarPulse.jsx'

const limitar = (v, min, max) => Math.min(max, Math.max(min, v))

/**
 * Visor comparador de dos épocas.
 * - Modo "slider": la Época B se dibuja encima de la A y se recorta con clip-path
 *   según la posición del divisor (variable CSS --pos, en %). Izquierda = A, derecha = B.
 * - Modo "blink": la Época B aparece/desaparece cada `intervalo` ms sobre la A.
 */
export default function Comparator({ banda, modo, intervalo, reproduciendo, hallazgos, pendiente, onMarcar }) {
  const visorRef = useRef(null)
  const coordsRef = useRef(null)
  const posRef = useRef(50)
  const rafRef = useRef(0)
  const arrastrandoRef = useRef(false)
  const [epocaVisible, setEpocaVisible] = useState('A')
  const [pulsos, setPulsos] = useState([])

  const infoBanda = BANDAS.find((b) => b.id === banda)

  // --- Blink comparator: alterna A/B con setInterval mientras esté activo.
  useEffect(() => {
    if (modo !== 'blink' || !reproduciendo) return
    const id = setInterval(() => setEpocaVisible((e) => (e === 'A' ? 'B' : 'A')), intervalo)
    return () => clearInterval(id)
  }, [modo, reproduciendo, intervalo])

  useEffect(() => {
    if (modo === 'slider') setEpocaVisible('A')
  }, [modo])

  // --- Slider: escribe la posición directamente en una variable CSS (sin re-render de React).
  const aplicarPosicion = (pct) => {
    posRef.current = limitar(pct, 0, 100)
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      visorRef.current?.style.setProperty('--pos', posRef.current.toFixed(3))
    })
  }

  const pctDesdeEvento = (e) => {
    const rect = visorRef.current.getBoundingClientRect()
    return {
      xPct: ((e.clientX - rect.left) / rect.width) * 100,
      yPct: ((e.clientY - rect.top) / rect.height) * 100,
    }
  }

  const alPresionarDivisor = (e) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    arrastrandoRef.current = true
  }

  const alMoverDivisor = (e) => {
    if (!arrastrandoRef.current) return
    aplicarPosicion(pctDesdeEvento(e).xPct)
  }

  const alSoltarDivisor = (e) => {
    arrastrandoRef.current = false
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }

  const alTeclaDivisor = (e) => {
    const paso = e.shiftKey ? 10 : 2
    if (e.key === 'ArrowLeft') aplicarPosicion(posRef.current - paso)
    if (e.key === 'ArrowRight') aplicarPosicion(posRef.current + paso)
  }

  // --- Lectura de coordenadas en vivo (HUD) sin provocar renders.
  const alMoverVisor = (e) => {
    if (!coordsRef.current) return
    const { xPct, yPct } = pctDesdeEvento(e)
    const x = Math.round(limitar(xPct, 0, 100) * (TAMANO_IMAGEN / 100))
    const y = Math.round(limitar(yPct, 0, 100) * (TAMANO_IMAGEN / 100))
    coordsRef.current.textContent = `X ${String(x).padStart(4, '0')}  Y ${String(y).padStart(4, '0')}`
  }

  // --- Clic: convierte a píxeles de la imagen original y decide qué época se estaba viendo.
  const alHacerClic = (e) => {
    const { xPct, yPct } = pctDesdeEvento(e)
    if (xPct < 0 || xPct > 100 || yPct < 0 || yPct > 100) return
    const x = Math.round((xPct / 100) * TAMANO_IMAGEN)
    const y = Math.round((yPct / 100) * TAMANO_IMAGEN)
    const epoca = modo === 'blink' ? epocaVisible : xPct < posRef.current ? 'A' : 'B'
    const id = crypto.randomUUID?.() ?? String(Date.now())
    setPulsos((p) => [...p, { id, xPct, yPct }])
    setTimeout(() => setPulsos((p) => p.filter((pulso) => pulso.id !== id)), 1900)
    onMarcar({ x, y, epoca, banda })
  }

  const transicionBlink = { duration: Math.min(0.12, intervalo / 4000), ease: 'linear' }

  return (
    <div className="relative">
      <div
        ref={visorRef}
        onClick={alHacerClic}
        onPointerMove={alMoverVisor}
        className="relative aspect-square w-full cursor-crosshair select-none overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_0_80px_-20px_rgba(34,211,238,0.35)]"
        style={{ '--pos': 50 }}
      >
        {/* Capa de imágenes: se re-monta al cambiar de banda para hacer el fundido entre longitudes de onda */}
        <AnimatePresence initial={false}>
          <motion.div
            key={banda}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.04, filter: 'blur(12px) saturate(2.2) brightness(1.6)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px) saturate(1) brightness(1)' }}
            exit={{ opacity: 0, filter: 'blur(8px) saturate(0.5) brightness(0.6)' }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <img
              src={imagenDe(banda, 'A')}
              alt={`Época A, ${infoBanda?.nombre}`}
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <motion.img
              src={imagenDe(banda, 'B')}
              alt={`Época B, ${infoBanda?.nombre}`}
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
              style={modo === 'slider' ? { clipPath: 'inset(0 0 0 calc(var(--pos) * 1%))' } : undefined}
              animate={{ opacity: modo === 'slider' || epocaVisible === 'B' ? 1 : 0 }}
              transition={transicionBlink}
            />
          </motion.div>
        </AnimatePresence>

        {/* Rejilla de referencia */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)',
            backgroundSize: '12.5% 12.5%',
          }}
        />

        {/* Hallazgos guardados */}
        {hallazgos.map((h) => (
          <MarcadorHallazgo
            key={h.id}
            hallazgo={h}
            xPct={(h.x / TAMANO_IMAGEN) * 100}
            yPct={(h.y / TAMANO_IMAGEN) * 100}
            color={BANDAS.find((b) => b.id === h.banda)?.color ?? '#f0abfc'}
            atenuado={h.banda !== banda}
          />
        ))}

        <AnimatePresence>
          {pendiente && (
            <MarcaPendiente
              key={`${pendiente.x}-${pendiente.y}`}
              xPct={(pendiente.x / TAMANO_IMAGEN) * 100}
              yPct={(pendiente.y / TAMANO_IMAGEN) * 100}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {pulsos.map((p) => (
            <RadarPulse key={p.id} xPct={p.xPct} yPct={p.yPct} color={infoBanda?.color} />
          ))}
        </AnimatePresence>

        {/* Divisor del slider */}
        {modo === 'slider' && (
          <div
            role="slider"
            tabIndex={0}
            aria-label="Divisor Época A / Época B"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(posRef.current)}
            onPointerDown={alPresionarDivisor}
            onPointerMove={alMoverDivisor}
            onPointerUp={alSoltarDivisor}
            onPointerCancel={alSoltarDivisor}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={alTeclaDivisor}
            className="group absolute inset-y-0 z-10 -ml-5 flex w-10 cursor-ew-resize touch-none justify-center outline-none"
            style={{ left: 'calc(var(--pos) * 1%)' }}
          >
            <div className="h-full w-0.5 bg-cyan-300/90 shadow-[0_0_14px_rgba(103,232,249,0.9)]" />
            <div className="absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-cyan-300/80 bg-space-900/80 text-cyan-200 shadow-[0_0_24px_rgba(34,211,238,0.6)] backdrop-blur transition-transform group-hover:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-cyan-300 group-active:scale-95">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 6l-6 6 6 6M15 6l6 6-6 6" />
              </svg>
            </div>
          </div>
        )}

        {/* Etiquetas de época */}
        {modo === 'slider' ? (
          <>
            <EtiquetaEpoca className="left-3">ÉPOCA A</EtiquetaEpoca>
            <EtiquetaEpoca className="right-3">ÉPOCA B · +6 meses</EtiquetaEpoca>
          </>
        ) : (
          <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1 font-mono text-xs backdrop-blur">
            <motion.span
              className="h-2 w-2 rounded-full"
              animate={{ backgroundColor: epocaVisible === 'A' ? '#22d3ee' : '#f472b6', scale: [1, 1.5, 1] }}
              transition={{ duration: 0.25 }}
              key={epocaVisible}
            />
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={epocaVisible}
                initial={{ y: -8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 8, opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                ÉPOCA {epocaVisible}
                {epocaVisible === 'B' ? ' · +6 meses' : ''}
              </motion.span>
            </AnimatePresence>
          </div>
        )}

        {/* HUD inferior */}
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex items-center justify-between font-mono text-[11px] text-slate-300">
          <span ref={coordsRef} className="rounded-md bg-black/60 px-2 py-1 backdrop-blur">
            X 0000  Y 0000
          </span>
          <span className="rounded-md bg-black/60 px-2 py-1 backdrop-blur" style={{ color: infoBanda?.color }}>
            λ {infoBanda?.longitud.toFixed(1)} µm
          </span>
        </div>
      </div>
    </div>
  )
}

function EtiquetaEpoca({ className = '', children }) {
  return (
    <span
      className={`pointer-events-none absolute top-3 z-10 rounded-full border border-white/10 bg-black/60 px-3 py-1 font-mono text-xs tracking-wider text-slate-200 backdrop-blur ${className}`}
    >
      {children}
    </span>
  )
}
