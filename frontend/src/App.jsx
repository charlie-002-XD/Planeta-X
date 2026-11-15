import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import StarfieldCanvas from './components/StarfieldCanvas.jsx'
import BandSelector from './components/BandSelector.jsx'
import Comparator from './components/Comparator.jsx'
import ViewerControls from './components/ViewerControls.jsx'
import ReportPanel from './components/ReportPanel.jsx'
import { BANDAS, imagenDe } from './bandas.js'
import { MODO_LOCAL, enviarHallazgo, hallazgosLocales, obtenerHallazgos } from './api.js'

export default function App() {
  const [banda, setBanda] = useState('banda2')
  const [modo, setModo] = useState('slider')
  const [intervalo, setIntervalo] = useState(500)
  const [reproduciendo, setReproduciendo] = useState(true)
  const [hallazgos, setHallazgos] = useState([])
  const [estadoApi, setEstadoApi] = useState('cargando')
  const [modoDatos, setModoDatos] = useState(null)
  const [pendiente, setPendiente] = useState(null)
  const [aviso, setAviso] = useState(null)

  // Precarga de las 8 imágenes para que los cambios de banda/época sean instantáneos.
  useEffect(() => {
    BANDAS.forEach((b) => ['A', 'B'].forEach((e) => (new Image().src = imagenDe(b.id, e))))
  }, [])

  const cargarHallazgos = useCallback(async () => {
    try {
      setEstadoApi('cargando')
      const { hallazgos: lista, modo } = await obtenerHallazgos()
      setHallazgos(lista)
      setModoDatos(modo)
      setEstadoApi('ok')
    } catch {
      setEstadoApi('error')
    }
  }, [])

  useEffect(() => {
    cargarHallazgos()
  }, [cargarHallazgos])

  useEffect(() => {
    if (!aviso) return
    const id = setTimeout(() => setAviso(null), 3000)
    return () => clearTimeout(id)
  }, [aviso])

  const enviar = async ({ tipo, comentario }) => {
    const { hallazgo, modo } = await enviarHallazgo({
      x: pendiente.x,
      y: pendiente.y,
      banda: pendiente.banda,
      epoca: pendiente.epoca,
      comentario,
      tipo,
    }, modoDatos)
    // Si el servidor se cayó a mitad de sesión, la lista pasa a ser la local (que ya incluye el nuevo).
    setHallazgos((lista) => (modo === MODO_LOCAL && modoDatos !== MODO_LOCAL ? hallazgosLocales() : [...lista, hallazgo]))
    setModoDatos(modo)
    setEstadoApi('ok')
    setPendiente(null)
    setAviso(`Hallazgo #${hallazgo.id} registrado en (${hallazgo.x}, ${hallazgo.y})`)
  }

  return (
    <div className="relative min-h-full">
      <StarfieldCanvas />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.12),transparent_60%),radial-gradient(ellipse_at_bottom_right,rgba(217,70,239,0.10),transparent_55%)]" />

      <header className="mx-auto flex max-w-[1500px] items-center justify-between px-4 pb-2 pt-5 sm:px-6">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-cyan-300/80">NASA · SPHEREx Challenge</p>
          <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">
            Planeta-X <span className="font-normal text-slate-400">· Cazador de objetos en movimiento</span>
          </h1>
        </motion.div>
        <div className="hidden text-right font-mono text-xs text-slate-500 md:block">
          <p>Región: SPX-J0412+53</p>
          <p>Δt = 6 meses · 1024 × 1024 px</p>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1500px] gap-5 px-4 pb-8 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        <div className="lg:sticky lg:top-5 lg:self-start">
          <BandSelector bandaActiva={banda} onCambiar={setBanda} />
        </div>

        <section className="flex flex-col gap-4">
          <ViewerControls
            modo={modo}
            onModo={setModo}
            intervalo={intervalo}
            onIntervalo={setIntervalo}
            reproduciendo={reproduciendo}
            onReproducir={() => setReproduciendo((r) => !r)}
          />
          <div className="mx-auto w-full max-w-[min(100%,78vh)]">
            <Comparator
              banda={banda}
              modo={modo}
              intervalo={intervalo}
              reproduciendo={reproduciendo}
              hallazgos={hallazgos}
              pendiente={pendiente}
              onMarcar={setPendiente}
            />
          </div>
        </section>

        <ReportPanel
          pendiente={pendiente}
          hallazgos={hallazgos}
          estadoApi={estadoApi}
          modoDatos={modoDatos}
          onEnviar={enviar}
          onCancelar={() => setPendiente(null)}
          onRecargar={cargarHallazgos}
        />
      </main>

      <AnimatePresence>
        {aviso && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-emerald-300/40 bg-emerald-400/15 px-4 py-2 text-sm text-emerald-100 shadow-lg backdrop-blur"
            role="status"
          >
            ✓ {aviso}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
