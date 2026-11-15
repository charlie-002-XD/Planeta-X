// Capa de comunicación con el backend PHP, con respaldo en localStorage.
//
// Si el backend no responde (frontend desplegado solo en Vercel/GitHub Pages, servidor caído, etc.)
// la app pasa a "modo demo local": los hallazgos se leen y guardan en localStorage, partiendo de
// unos datos de ejemplo. Cada función devuelve también el `modo` con el que se resolvió.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const URL_HALLAZGOS = `${BASE}/api/hallazgos.php`
const FORZAR_DEMO = import.meta.env.VITE_MODO_DEMO === 'true'
const TIEMPO_MAXIMO_MS = 5000

export const MODO_SERVIDOR = 'servidor'
export const MODO_LOCAL = 'local'

const CLAVE_LOCAL = 'planeta-x:hallazgos:v1'

// El objeto móvil de las imágenes sintéticas, visto en las dos épocas de la banda de 1.6 µm.
export const HALLAZGOS_DEMO = [
  { id: 1, x: 412, y: 538, banda: 'banda2', epoca: 'A', tipo: 'asteroide', comentario: 'Candidato en la Época A', fecha: '2025-06-01T03:12:00Z' },
  { id: 2, x: 468, y: 501, banda: 'banda2', epoca: 'B', tipo: 'asteroide', comentario: 'Mismo objeto 6 meses después: se desplaza al NE', fecha: '2025-12-01T03:12:00Z' },
  { id: 3, x: 470, y: 503, banda: 'banda4', epoca: 'B', tipo: 'asteroide', comentario: 'Sigue visible a 3.8 µm: emisión térmica', fecha: '2025-12-01T03:20:00Z' },
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
