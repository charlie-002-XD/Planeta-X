// Región sintética inicial (siempre disponible aunque falte regions.json) y carga del catálogo de regiones.
export const BANDAS = [
  { id: 'banda1', nombre: 'Banda 1', longitud: 1.0, color: '#7dd3fc', descripcion: 'IR cercano corto · estrellas calientes' },
  { id: 'banda2', nombre: 'Banda 2', longitud: 1.6, color: '#a5f3fc', descripcion: 'Pico estelar · polvo tenue' },
  { id: 'banda3', nombre: 'Banda 3', longitud: 2.4, color: '#fcd34d', descripcion: 'Polvo cálido · hielos' },
  { id: 'banda4', nombre: 'Banda 4', longitud: 3.8, color: '#fb923c', descripcion: 'IR largo · nebulosas y PAH' },
].map((b) => ({ ...b, imagenes: { A: `/assets/${b.id}_epocaA.png`, B: `/assets/${b.id}_epocaB.png` } }))

// Antepone BASE_URL de Vite (p. ej. /Planeta-X/ en GitHub Pages) a las rutas absolutas de public/.
// Idempotente: una ruta que ya lleva la base (o una URL completa) se deja igual.
const BASE_PUBLICA = import.meta.env.BASE_URL
export const rutaPublica = (ruta) =>
  /^(?:[a-z]+:)?\/\//i.test(ruta) || ruta.startsWith(BASE_PUBLICA) ? ruta : `${BASE_PUBLICA}${ruta.replace(/^\//, '')}`

const conRutasPublicas = (region) => ({
  ...region,
  bandas: region.bandas.map((b) => ({
    ...b,
    imagenes: { A: rutaPublica(b.imagenes.A), B: rutaPublica(b.imagenes.B) },
  })),
})

export const REGION_POR_DEFECTO = 'spx-j0412+53'

export const REGION_SINTETICA = conRutasPublicas({
  id: REGION_POR_DEFECTO,
  nombre: 'SPX-J0412+53',
  designacion: 'SPX-J0412+53',
  tipo: 'sintetica',
  tamano_px: 1024,
  delta: '6 meses',
  banda_inicial: 'banda2',
  epocas: { A: { etiqueta: 'Época A' }, B: { etiqueta: '+6 meses' } },
  bandas: BANDAS,
})

export const URL_REGIONES = rutaPublica('/assets/regions/regions.json')

const regionValida = (r) =>
  r && typeof r.id === 'string' && Number(r.tamano_px) > 0 && Array.isArray(r.bandas) && r.bandas.length > 0 &&
  r.bandas.every((b) => b.id && b.imagenes?.A && b.imagenes?.B)

/** Lee regions.json (generado por scripts/fetch_irsa_samples.py); la región sintética va siempre primero. */
export async function cargarRegiones() {
  const res = await fetch(URL_REGIONES, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`regions.json: HTTP ${res.status}`)
  const { regiones = [] } = await res.json()
  const reales = regiones.filter((r) => regionValida(r) && r.id !== REGION_POR_DEFECTO)
  const sintetica = regiones.find((r) => r.id === REGION_POR_DEFECTO && regionValida(r)) ?? REGION_SINTETICA
  return [sintetica, ...reales].map(conRutasPublicas)
}

// `region` (sin _id) es el campo de los hallazgos guardados antes de `region_id`.
export const regionDeHallazgo = (h) => h.region_id ?? h.region ?? REGION_POR_DEFECTO

/** Hallazgo con vector de trayectoria: (x, y) en la Época A → (x2, y2) en la Época B. */
export const tieneDestino = (h) => Number.isFinite(h?.x2) && Number.isFinite(h?.y2)

/** Desplazamiento en píxeles entre las dos épocas, o null si el hallazgo no tiene destino. */
export const desplazamientoPx = (h) => (tieneDestino(h) ? Math.hypot(h.x2 - h.x, h.y2 - h.y) : null)
