// Región sintética inicial (siempre disponible aunque falte regions.json) y carga del catálogo de regiones.
export const BANDAS = [
  { id: 'banda1', nombre: 'Banda 1', longitud: 1.0, color: '#7dd3fc', descripcion: 'IR cercano corto · estrellas calientes' },
  { id: 'banda2', nombre: 'Banda 2', longitud: 1.6, color: '#a5f3fc', descripcion: 'Pico estelar · polvo tenue' },
  { id: 'banda3', nombre: 'Banda 3', longitud: 2.4, color: '#fcd34d', descripcion: 'Polvo cálido · hielos' },
  { id: 'banda4', nombre: 'Banda 4', longitud: 3.8, color: '#fb923c', descripcion: 'IR largo · nebulosas y PAH' },
].map((b) => ({ ...b, imagenes: { A: `/assets/${b.id}_epocaA.png`, B: `/assets/${b.id}_epocaB.png` } }))

export const REGION_POR_DEFECTO = 'spx-j0412+53'

export const REGION_SINTETICA = {
  id: REGION_POR_DEFECTO,
  nombre: 'SPX-J0412+53',
  designacion: 'SPX-J0412+53',
  tipo: 'sintetica',
  tamano_px: 1024,
  delta: '6 meses',
  banda_inicial: 'banda2',
  epocas: { A: { etiqueta: 'Época A' }, B: { etiqueta: '+6 meses' } },
  bandas: BANDAS,
}

export const URL_REGIONES = '/assets/regions/regions.json'

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
  return [sintetica, ...reales]
}

export const regionDeHallazgo = (h) => h.region ?? REGION_POR_DEFECTO
