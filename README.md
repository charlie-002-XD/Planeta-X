# Planeta-X

MVP para el reto **SPHEREx** de la NASA: un comparador de épocas para detectar objetos en movimiento
(asteroides, cometas, planetas) en imágenes de infrarrojo cercano tomadas con 6 meses de diferencia.

```
frontend/   React + Vite + TailwindCSS + Framer Motion (.jsx)
backend/    API REST en PHP puro (api/hallazgos.php → data/hallazgos.json)
scripts/    generar_muestras.py: imágenes sintéticas Época A / Época B
```

## Puesta en marcha

Requisitos: Node 18+, PHP 8+, Python 3 con `numpy` y `pillow`.

```bash
# 1. Datos de prueba (ya incluidos en frontend/public/assets; regenerar es opcional)
pip install numpy pillow
python scripts/generar_muestras.py

# 2. Backend PHP (puerto 8000)
php -S localhost:8000 -t backend

# 3. Frontend (puerto 5173)
cd frontend
npm install
npm run dev
```

Abre http://localhost:5173. En desarrollo Vite reenvía `/api/*` a `localhost:8000` (ver `vite.config.js`).
Para llamar al backend directamente (otro origen, usando CORS) define `VITE_API_URL=http://localhost:8000`
en `frontend/.env`. El origen permitido en el backend se configura con la variable `CORS_ORIGIN` (por defecto `*`).

## API

| Método | Ruta                  | Descripción                                    |
| ------ | --------------------- | ---------------------------------------------- |
| GET    | `/api/hallazgos.php`  | Lista de hallazgos (array JSON)                |
| POST   | `/api/hallazgos.php`  | Guarda `{ x, y, banda, epoca, comentario, tipo? }` |

```bash
curl -X POST http://localhost:8000/api/hallazgos.php \
  -H 'Content-Type: application/json' \
  -d '{"x":468,"y":501,"banda":"banda2","epoca":"B","comentario":"Se desplaza al NE","tipo":"asteroide"}'
```

Validación: `x`, `y` numéricos (0–4096), `banda` ∈ `banda1..banda4`, `epoca` ∈ `A|B`, `comentario` ≤ 500
caracteres, `tipo` opcional ∈ `asteroide|cometa|planeta`. Errores → `400` con `{ "error": "..." }`.

## Cómo funciona

### React ↔ PHP
1. Al montar `App.jsx`, `obtenerHallazgos()` (`src/api.js`) hace `fetch('GET /api/hallazgos.php')`.
2. El navegador envía la petición a Vite (`:5173`), cuyo proxy la reenvía a PHP (`:8000`).
   Si se usa `VITE_API_URL`, la petición va directa a PHP y el navegador exige cabeceras CORS.
3. `hallazgos.php` envía las cabeceras CORS, enruta por `$_SERVER['REQUEST_METHOD']` y devuelve JSON.
4. Al hacer clic en el visor se guarda una marca pendiente; al enviar el formulario,
   `enviarHallazgo()` hace `POST` con `Content-Type: application/json`. Como ese tipo de contenido no es
   "simple", en peticiones cross-origin el navegador lanza antes un *preflight* `OPTIONS`, al que PHP
   responde `204`.
5. PHP lee `php://input`, valida, bloquea el archivo con `flock`, asigna `id` y `fecha`, escribe
   `data/hallazgos.json` y responde `201 { ok, hallazgo }`. React añade el hallazgo al estado y lo dibuja.

### Lógica del comparador (`Comparator.jsx`)
- **Slider**: la Época A ocupa todo el visor; la Época B está encima, recortada con
  `clip-path: inset(0 0 0 calc(var(--pos) * 1%))`. El divisor usa Pointer Events con `setPointerCapture`
  (el arrastre sigue aunque el cursor salga del divisor) y escribe `--pos` en un `requestAnimationFrame`
  directamente en el DOM, sin re-renderizar React → arrastre a 60 fps. Flechas ←/→ (Shift = pasos de 10%).
- **Blink**: un `setInterval` (por defecto 500 ms, ajustable 0.1–2 s) alterna `epocaVisible`; la imagen B
  cambia de opacidad con un fundido muy corto. El efecto se limpia con `clearInterval` al pausar, cambiar
  de modo o de velocidad.
- **Coordenadas**: el clic se convierte a % del visor y luego a píxeles de la imagen original (1024 px),
  así son independientes del tamaño en pantalla. La época reportada es la visible en ese punto
  (lado del divisor en modo slider, fotograma actual en modo blink).

### Animaciones
- **Framer Motion**: `layoutId` para el resaltado deslizante de banda y modo; `AnimatePresence` con
  `key={banda}` para el fundido entre longitudes de onda (blur + saturación + escala); anillos de radar
  escalonados al marcar; retícula giratoria para la marca pendiente; entrada de la lista y avisos.
- **Canvas**: `StarfieldCanvas.jsx` dibuja estrellas que titilan con `requestAnimationFrame`, ajustado a
  `devicePixelRatio`.

### Datos sintéticos
`generar_muestras.py` crea un catálogo estelar fijo (semilla 42) y una nebulosa fractal, renderiza cada
banda con una PSF y un color dependientes de la longitud de onda, añade el objeto móvil en
(412, 538) en la Época A y en (468, 501) en la Época B, ruido de detector distinto por época y un
estiramiento `asinh`. Genera `bandaN_epocaA/B.png` y `epoca_a.png` / `epoca_b.png`.
