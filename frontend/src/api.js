// Capa de comunicación con el backend PHP.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const URL_HALLAZGOS = `${BASE}/api/hallazgos.php`

async function leerRespuesta(res) {
  const datos = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(datos.error || `Error HTTP ${res.status}`)
  return datos
}

export async function obtenerHallazgos() {
  const res = await fetch(URL_HALLAZGOS, { headers: { Accept: 'application/json' } })
  return leerRespuesta(res)
}

export async function enviarHallazgo(hallazgo) {
  const res = await fetch(URL_HALLAZGOS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(hallazgo),
  })
  return leerRespuesta(res)
}
