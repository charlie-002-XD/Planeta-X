# Planeta-X

MVP para el reto **SPHEREx** de la NASA: un comparador de épocas para detectar objetos en movimiento
(asteroides, cometas, planetas) en imágenes de infrarrojo cercano tomadas con 6 meses de diferencia.

```
frontend/   React + Vite + TailwindCSS + Framer Motion (.jsx)
backend/    API REST en PHP puro (api/hallazgos.php → data/hallazgos.json)
scripts/    generar_muestras.py: imágenes sintéticas Época A / Época B
            fetch_irsa_samples.py: recortes reales WISE (M42, M45) desde IRSA
```

## Puesta en marcha

Requisitos: Node 18+, PHP 8+, Python 3 con `numpy` y `pillow`.

```bash
# 1. Datos de prueba (ya incluidos en frontend/public/assets; regenerar es opcional)
pip install numpy pillow
python scripts/generar_muestras.py

# 1b. Regiones reales (ya incluidas en frontend/public/assets/regions; regenerar es opcional)
pip install -r scripts/requirements-irsa.txt
python scripts/fetch_irsa_samples.py

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
| GET    | `/api/hallazgos.php?formato=csv` | Descarga todos los hallazgos como `.csv` (UTF-8 con BOM) |
| GET    | `/api/hallazgos.php?formato=json` | Descarga todos los hallazgos como `.json` |
| POST   | `/api/hallazgos.php`  | Guarda `{ x, y, banda, epoca, comentario, tipo?, region? }` |

```bash
curl -X POST http://localhost:8000/api/hallazgos.php \
  -H 'Content-Type: application/json' \
  -d '{"x":468,"y":501,"banda":"banda2","epoca":"B","comentario":"Se desplaza al NE","tipo":"asteroide"}'
```

Validación: `x`, `y` numéricos (0–4096), `banda` ∈ `banda1..banda4|w1|w2`, `epoca` ∈ `A|B`, `comentario` ≤ 500
caracteres, `tipo` opcional ∈ `asteroide|cometa|planeta`, `region` opcional (id en minúsculas; por defecto
`spx-j0412+53`). En el CSV, las celdas que empiezan por `= + - @` se prefijan con `'` para evitar inyección de fórmulas. Errores → `400` con `{ "error": "..." }`.

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

### Regiones reales (`fetch_irsa_samples.py`)
El menú **Región** (arriba a la derecha) lee `frontend/public/assets/regions/regions.json`, que contiene la región
sintética y dos regiones reales: **M42** (Nebulosa de Orión) y **M45** (Pléyades). Para cada una:

- **Época A**: exposición única WISE All-Sky (2010, colección IRSA `wise_allsky`); **Época B**: la exposición
  NEOWISE-R más reciente (2024, `neowiser`). Bandas **W1 (3.4 µm)** y **W2 (4.6 µm)** de la misma exposición.
- Solo se descargan **recortes** que IRSA corta en el servidor (`?center=RA,Dec&size=0.2deg`, radio 0.1°):
  8 FITS de ~0.3 MB (≈2.4 MB en total). El script aborta si el total supera 15 MiB.
- Los FITS quedan en `scripts/.cache_irsa/` (ignorado por git) para no repetir descargas.

Conversión FITS → PNG con `astropy`:
1. `astroquery.ipac.irsa.Irsa.query_sia` consulta el índice SIA de IRSA: devuelve solo metadatos (URL, banda,
   fecha, centro de cada exposición). Se elige la exposición mejor centrada (A) o la más reciente (B).
2. `astropy.io.fits` abre el recorte: una matriz `float32` en DN (cuentas del detector) y una cabecera con
   `MAGZP` (punto cero), `MJD_OBS` (fecha) y la astrometría (`CTYPE = RA---SIN-SIP`, `CD`, coeficientes SIP).
3. Calibración: `flujo = DN · 10^(-0.4·(MAGZP − 22.5))` pone ambas épocas en la misma unidad (nanomaggies).
4. `astropy.stats.sigma_clipped_stats` estima el fondo del cielo (mediana con recorte a 3σ) y se resta.
5. Los píxeles saturados llegan como `NaN`: los huecos grandes se rellenan con el máximo y los sueltos con
   `astropy.convolution.interpolate_replace_nans` (núcleo gaussiano).
6. `astropy.wcs.WCS` + `reproject_interp` llevan cada época a una rejilla común TAN de 512 × 512 px, norte
   arriba y este a la izquierda: así el mismo píxel es la misma posición del cielo en A y en B (los detectores
   de WISE estaban girados de forma distinta en cada pasada). El lado es el mayor cuadrado cubierto por los 4
   recortes de la región (0.19° en M42, 0.17° en M45).
7. `astropy.visualization`: `ManualInterval(−2σ, percentil 99.9)` lleva el flujo a [0, 1] y
   `LogStretch(a=1000)` aplica `y = log(1000·x + 1) / log(1001)`, que realza la nebulosa tenue sin quemar las
   estrellas. El mismo intervalo se usa en las dos épocas para que el parpadeo solo muestre cambios reales.
8. Se multiplica por el color de la banda, se invierte el eje vertical (en FITS la fila 0 está abajo; en PNG,
   arriba) y Pillow guarda el PNG de 8 bits que el navegador ya puede mostrar.
