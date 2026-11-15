// Las 4 bandas de infrarrojo cercano disponibles y las imágenes de cada época.
export const BANDAS = [
  { id: 'banda1', nombre: 'Banda 1', longitud: 1.0, color: '#7dd3fc', descripcion: 'IR cercano corto · estrellas calientes' },
  { id: 'banda2', nombre: 'Banda 2', longitud: 1.6, color: '#a5f3fc', descripcion: 'Pico estelar · polvo tenue' },
  { id: 'banda3', nombre: 'Banda 3', longitud: 2.4, color: '#fcd34d', descripcion: 'Polvo cálido · hielos' },
  { id: 'banda4', nombre: 'Banda 4', longitud: 3.8, color: '#fb923c', descripcion: 'IR largo · nebulosas y PAH' },
]

export const TAMANO_IMAGEN = 1024

// BASE_URL respeta `base` de Vite (p. ej. /Planeta-X/ en GitHub Pages).
export const imagenDe = (bandaId, epoca) => `${import.meta.env.BASE_URL}assets/${bandaId}_epoca${epoca}.png`
