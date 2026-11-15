import { useEffect, useRef } from 'react'

// Fondo animado: estrellas que titilan y derivan lentamente, dibujadas en <canvas>
// con requestAnimationFrame (≈60 fps, se pausa solo cuando la pestaña está oculta).
export default function StarfieldCanvas({ densidad = 0.00018 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let estrellas = []
    let frame = 0
    let ancho = 0
    let alto = 0

    const crearEstrellas = () => {
      const dpr = window.devicePixelRatio || 1
      ancho = window.innerWidth
      alto = window.innerHeight
      canvas.width = ancho * dpr
      canvas.height = alto * dpr
      canvas.style.width = `${ancho}px`
      canvas.style.height = `${alto}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const total = Math.floor(ancho * alto * densidad)
      estrellas = Array.from({ length: total }, () => ({
        x: Math.random() * ancho,
        y: Math.random() * alto,
        r: Math.random() * 1.2 + 0.2,
        fase: Math.random() * Math.PI * 2,
        velocidad: Math.random() * 0.02 + 0.005,
        deriva: Math.random() * 0.05 + 0.01,
      }))
    }

    const dibujar = () => {
      ctx.clearRect(0, 0, ancho, alto)
      for (const s of estrellas) {
        s.fase += s.velocidad
        s.x -= s.deriva
        if (s.x < 0) s.x = ancho
        const brillo = 0.35 + 0.65 * Math.abs(Math.sin(s.fase))
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(200, 225, 255, ${brillo})`
        ctx.fill()
      }
      frame = requestAnimationFrame(dibujar)
    }

    crearEstrellas()
    dibujar()
    window.addEventListener('resize', crearEstrellas)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', crearEstrellas)
    }
  }, [densidad])

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true" />
}
