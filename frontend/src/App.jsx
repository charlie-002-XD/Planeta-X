import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import StarfieldCanvas from './components/StarfieldCanvas.jsx'
import BandSelector from './components/BandSelector.jsx'
import Comparator from './components/Comparator.jsx'
import ViewerControls from './components/ViewerControls.jsx'
import ReportPanel from './components/ReportPanel.jsx'
import RegionSelector from './components/RegionSelector.jsx'
import { REGION_POR_DEFECTO, REGION_SINTETICA, cargarRegiones, regionDeHallazgo } from './bandas.js'
import { enviarHallazgo, obtenerHallazgos } from './api.js'

export default function App() {
  const [regiones, setRegiones] = useState([REGION_SINTETICA])
  const [regionId, setRegionId] = useState(REGION_POR_DEFECTO)
  const [banda, setBanda] = useState(REGION_SINTETICA.banda_inicial)
  const [modo, setModo] = useState('slider')
  const [intervalo, setIntervalo] = useState(500)
  const [reproduciendo, setReproduciendo] = useState(true)
  const [hallazgos, setHallazgos] = useState([])
  const [estadoApi, setEstadoApi] = useState('cargando')
  const [pendiente, setPendiente] = useState(null)
  const [aviso, setAviso] = useState(null)

  const region = regiones.find((r) => r.id === regionId) ?? regiones[0]
  const hallazgosRegion = useMemo(() => hallazgos.filter((h) => regionDeHallazgo(h) === region.id), [hallazgos, region.id])

  // Catálogo de regiones (sintética + reales descargadas de IRSA). Sin regions.json queda solo la sintética.
  useEffect(() => {
    cargarRegiones()
      .then(setRegiones)
      .catch(() => setRegiones([REGION_SINTETICA]))
  }, [])

  // Precarga las imágenes de la región activa para que los cambios de banda/época sean instantáneos.
  useEffect(() => {
    region.bandas.forEach((b) => ['A', 'B'].forEach((e) => (new Image().src = b.imagenes[e])))
  }, [region])

  const cambiarRegion = (id) => {
    const nueva = regiones.find((r) => r.id === id)
    if (!nueva) return
    setRegionId(id)
    setBanda(nueva.bandas.some((b) => b.id === nueva.banda_inicial) ? nueva.banda_inicial : nueva.bandas[0].id)
    setPendiente(null)
  }

  const cargarHallazgos = useCallback(async () => {
    try {
      setEstadoApi('cargando')
      setHallazgos(await obtenerHallazgos())
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
    const { hallazgo } = await enviarHallazgo({
      x: pendiente.x,
      y: pendiente.y,
      banda: pendiente.banda,
      region: region.id,
      epoca: pendiente.epoca,
      comentario,
      tipo,
    })
    setHallazgos((lista) => [...lista, hallazgo])
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
        <RegionSelector regiones={regiones} region={region} onCambiar={cambiarRegion} />
      </header>

      <main className="mx-auto grid max-w-[1500px] gap-5 px-4 pb-8 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        <div className="lg:sticky lg:top-5 lg:self-start">
          <BandSelector
            bandas={region.bandas}
            titulo={region.tipo === 'real' ? 'Bandas WISE (IR)' : 'Bandas IR cercano'}
            rango={region.tipo === 'real' ? ['3.4 µm', '4.6 µm'] : undefined}
            bandaActiva={banda}
            onCambiar={setBanda}
          />
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
              region={region}
              banda={banda}
              modo={modo}
              intervalo={intervalo}
              reproduciendo={reproduciendo}
              hallazgos={hallazgosRegion}
              pendiente={pendiente}
              onMarcar={setPendiente}
            />
          </div>
        </section>

        <ReportPanel
          regiones={regiones}
          pendiente={pendiente}
          hallazgos={hallazgos}
          estadoApi={estadoApi}
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
