// Capa de comunicación con el backend PHP, con respaldo en localStorage.
//
// Si el backend no responde (frontend desplegado solo en Vercel/GitHub Pages, servidor caído, etc.)
// la app pasa a "modo demo local": los hallazgos se leen y guardan en localStorage, partiendo de
// unos datos de ejemplo. Cada función devuelve también el `modo` con el que se resolvió.
import { REGION_POR_DEFECTO, regionDeHallazgo, tieneDestino } from './bandas.js'

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const URL_HALLAZGOS = `${BASE}/api/hallazgos.php`
const FORZAR_DEMO = import.meta.env.VITE_MODO_DEMO === 'true'
const TIEMPO_MAXIMO_MS = 5000

export const MODO_SERVIDOR = 'servidor'
export const MODO_LOCAL = 'local'

const CLAVE_LOCAL = 'planeta-x:hallazgos:v1'

// Ejemplos: el objeto móvil sintético y los candidatos inyectados en M42/M45 (regions.json → candidato),
// con su vector de trayectoria (x, y) en la Época A → (x2, y2) en la Época B.
export const HALLAZGOS_DEMO = [
  { id: 1, region_id: REGION_POR_DEFECTO, x: 412, y: 538, x2: 468, y2: 501, banda: 'banda2', epoca: 'A', tipo: 'asteroide', comentario: 'Se desplaza al NE en 6 meses', fecha: '2025-06-01T03:12:00Z' },
  { id: 2, region_id: REGION_POR_DEFECTO, x: 470, y: 503, banda: 'banda4', epoca: 'B', tipo: 'asteroide', comentario: 'Sigue visible a 3.8 µm: emisión térmica', fecha: '2025-12-01T03:20:00Z' },
  { id: 3, region_id: 'm42', x: 429, y: 305, x2: 392, y2: 274, banda: 'w1', epoca: 'A', tipo: 'asteroide', comentario: 'Candidato en movimiento delante de la Nebulosa de Orión', fecha: '2025-06-02T01:40:00Z' },
  { id: 4, region_id: 'm45', x: 233, y: 108, x2: 282, y2: 97, banda: 'w1', epoca: 'A', tipo: 'asteroide', comentario: 'Candidato en movimiento junto a las Pléyades', fecha: '2025-06-02T02:05:00Z' },
]

/** Errores que no deben activar el modo demo (p. ej. validación 400 del backend). */
class ErrorApi extends Error {}

/** Indica que el backend no está disponible y conviene usar el respaldo local. */
class SinServidor extends Error {}

let memoria = null // copia en memoria si localStorage no está disponible (modo privado, cuota llena)

function leerLocal() {
  // La copia en memoria manda: si localStorage deja de aceptar escrituras (cuota), lo guardado allí queda viejo.
  if (memoria) return memoria
  try {
    const guardado = localStorage.getItem(CLAVE_LOCAL)
    if (guardado !== null) {
      const datos = JSON.parse(guardado)
      if (Array.isArray(datos)) return (memoria = datos)
    }
  } catch {
    // localStorage no disponible o JSON dañado: se parte de los datos de ejemplo.
  }
  const iniciales = HALLAZGOS_DEMO.map((h) => ({ ...h }))
  escribirLocal(iniciales)
  return iniciales
}

function escribirLocal(lista) {
  memoria = lista
  try {
    localStorage.setItem(CLAVE_LOCAL, JSON.stringify(lista))
  } catch {
    // Sin localStorage los datos viven solo en memoria durante la sesión.
  }
}

function guardarLocal(hallazgo) {
  const lista = leerLocal()
  const id = lista.reduce((max, h) => Math.max(max, Number(h.id) || 0), 0) + 1
  const nuevo = { id, ...hallazgo, x: Math.round(hallazgo.x), y: Math.round(hallazgo.y), fecha: new Date().toISOString() }
  if (tieneDestino(hallazgo)) Object.assign(nuevo, { x2: Math.round(hallazgo.x2), y2: Math.round(hallazgo.y2) })
  escribirLocal([...lista, nuevo])
  return nuevo
}

async function pedir(opciones = {}) {
  if (FORZAR_DEMO) throw new SinServidor('Modo demo forzado (VITE_MODO_DEMO)')
  const control = new AbortController()
  const temporizador = setTimeout(() => control.abort(), TIEMPO_MAXIMO_MS)
  let res
  try {
    res = await fetch(URL_HALLAZGOS, { ...opciones, signal: control.signal })
  } catch (err) {
    throw new SinServidor(err.message) // red caída, CORS, DNS o tiempo agotado
  } finally {
    clearTimeout(temporizador)
  }
  // Un hosting estático devuelve 404/405, o index.html con 200 si reescribe todas las rutas.
  const esJson = (res.headers.get('Content-Type') || '').includes('application/json')
  if (!esJson || res.status === 404 || res.status === 405 || res.status >= 502) {
    throw new SinServidor(`Backend no disponible (HTTP ${res.status})`)
  }
  const datos = await res.json().catch(() => ({}))
  if (!res.ok) throw new ErrorApi(datos.error || `Error HTTP ${res.status}`)
  return datos
}

export async function obtenerHallazgos() {
  try {
    const hallazgos = await pedir({ headers: { Accept: 'application/json' } })
    return { hallazgos, modo: MODO_SERVIDOR }
  } catch (err) {
    if (!(err instanceof SinServidor)) throw err
    return { hallazgos: leerLocal(), modo: MODO_LOCAL }
  }
}

/** Con `modo === MODO_LOCAL` no se intenta el servidor: el hallazgo queda junto a los demás locales. */
export async function enviarHallazgo(hallazgo, modo = MODO_SERVIDOR) {
  if (modo !== MODO_LOCAL) {
    try {
      const datos = await pedir({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(hallazgo),
      })
      return { hallazgo: datos.hallazgo, modo: MODO_SERVIDOR }
    } catch (err) {
      if (!(err instanceof SinServidor)) throw err
    }
  }
  return { hallazgo: guardarLocal(hallazgo), modo: MODO_LOCAL }
}
export const hallazgosLocales = () => leerLocal()

const COLUMNAS_CSV = ['id', 'fecha', 'region_id', 'banda', 'epoca', 'x', 'y', 'x2', 'y2', 'tipo', 'comentario']

// Igual que el backend: las celdas que Excel/LibreOffice interpretarían como fórmula se prefijan con '.
const celdaCsv = (valor) => {
  const texto = String(valor ?? '')
  const seguro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto
  return /[",\n\r]/.test(seguro) ? `"${seguro.replaceAll('"', '""')}"` : seguro
}

function archivoLocal(formato) {
  const lista = leerLocal().map((h) => ({ region_id: regionDeHallazgo(h), ...h }))
  const sello = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  if (formato === 'csv') {
    const filas = [COLUMNAS_CSV, ...lista.map((h) => COLUMNAS_CSV.map((c) => h[c]))]
    const csv = '\uFEFF' + filas.map((f) => f.map(celdaCsv).join(',')).join('\r\n') + '\r\n'
    return { blob: new Blob([csv], { type: 'text/csv;charset=utf-8' }), nombre: `hallazgos-${sello}.csv` }
  }
  return {
    blob: new Blob([JSON.stringify(lista, null, 2)], { type: 'application/json' }),
    nombre: `hallazgos-${sello}.json`,
  }
}

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const enlace = Object.assign(document.createElement('a'), { href: url, download: nombre })
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return nombre
}

/** Descarga todos los hallazgos como .csv o .json: del backend o, en modo demo, de localStorage. */
export async function exportarHallazgos(formato, modo = MODO_SERVIDOR) {
  if (modo === MODO_LOCAL || FORZAR_DEMO) {
    const { blob, nombre } = archivoLocal(formato)
    return descargar(blob, nombre)
  }
  const res = await fetch(`${URL_HALLAZGOS}?formato=${encodeURIComponent(formato)}`)
  if (!res.ok) {
    const datos = await res.json().catch(() => ({}))
    throw new Error(datos.error || `Error HTTP ${res.status}`)
  }
  const nombre =
    /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `hallazgos.${formato}`
  return descargar(await res.blob(), nombre)
}
