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

/** Descarga todos los hallazgos guardados en el backend como .csv o .json. */
export async function exportarHallazgos(formato) {
  const res = await fetch(`${URL_HALLAZGOS}?formato=${encodeURIComponent(formato)}`)
  if (!res.ok) await leerRespuesta(res)
  const nombre =
    /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `hallazgos.${formato}`
  const url = URL.createObjectURL(await res.blob())
  const enlace = Object.assign(document.createElement('a'), { href: url, download: nombre })
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return nombre
}
