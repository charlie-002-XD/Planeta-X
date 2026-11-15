# Planeta-X

MVP para el reto **SPHEREx** de la NASA: un comparador de épocas para detectar objetos en movimiento
(asteroides, cometas, planetas) en imágenes de infrarrojo cercano tomadas con 6 meses de diferencia.

```
frontend/   React + Vite + TailwindCSS + Framer Motion (.jsx)
backend/    API REST en PHP puro (api/hallazgos.php → data/hallazgos.json)
scripts/    generar_muestras.py: imágenes sintéticas Época A / Época B
docker/     configuración de Apache para la imagen de despliegue
Dockerfile  imagen única (frontend compilado + API PHP) para Render / Railway
```

## SPHEREx en 2 minutos

**SPHEREx** (*Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer*)
es un observatorio espacial de la NASA lanzado en marzo de 2025 que cartografía **todo el cielo en
102 colores de infrarrojo cercano**, de **0.75 a 5.0 µm**.

### Arquitectura del instrumento
| Componente | Qué hace |
| --- | --- |
| Telescopio de ~20 cm, gran campo | Ve una franja de ~3.5° × 11.3° del cielo a la vez, con píxeles de ~6.2″. |
| 2 planos focales, 6 detectores H2RG (2048 × 2048) | Un plano cubre ~0.75–2.4 µm y el otro ~2.4–5.0 µm, observando el mismo campo a la vez con un divisor de haz. |
| Filtros lineales variables (LVF) | Cada detector lleva un filtro cuya longitud de onda cambia a lo largo de la imagen. Al desplazar el telescopio entre exposiciones, cada punto del cielo cae sobre todas las franjas del filtro → un espectro de 102 canales por píxel (R ≈ 35–41 hasta ~3.8 µm, R ≈ 110–130 de ~3.8 a 5 µm). |
| Enfriamiento pasivo | Tres escudos en forma de V (*V-groove*) disipan calor al espacio y enfrían telescopio y detectores por debajo de ~80 K, sin criógenos. |
| Órbita polar heliosíncrona baja | El plano orbital gira con la Tierra alrededor del Sol, así que el cielo completo se cubre **cada ~6 meses** (4 mapas en la misión de 2 años). |

Los datos públicos se distribuyen en el archivo **IRSA** (NASA/IPAC Infrared Science Archive).

### Objetivos científicos
1. **Inflación cósmica**: medir el corrimiento al rojo de cientos de millones de galaxias para mapear su
   distribución 3D y buscar huellas del primer instante del universo.
2. **Historia de las galaxias**: medir el brillo total del fondo extragaláctico (*intensity mapping*).
3. **Hielos interestelares**: buscar agua, CO₂ y CO congelados en nubes moleculares, el material del que
   se forman los planetas.

### Por qué sirve para cazar objetos en movimiento
Las estrellas y galaxias no se mueven entre dos pasadas, pero los asteroides y cometas del Sistema Solar
sí. Como SPHEREx vuelve a ver el mismo campo ~6 meses después, comparar las dos épocas (parpadeo o
*blink*, la técnica con la que se descubrió Plutón) revela lo que cambió de sitio. Eso es lo que hace
Planeta-X: el usuario compara Época A y Época B y marca el objeto.

### Las bandas infrarrojas del visor
El visor usa 4 cortes representativos del rango de SPHEREx (las imágenes son sintéticas, generadas por
`scripts/generar_muestras.py`):

| Banda | λ | Qué domina |
| --- | --- | --- |
| Banda 1 | 1.0 µm | Luz de estrellas calientes; el polvo empieza a ser transparente. |
| Banda 2 | 1.6 µm | Pico de emisión de la mayoría de estrellas; mínimo de opacidad del H⁻. |
| Banda 3 | 2.4 µm | Polvo cálido; zona previa a las bandas de hielo. |
| Banda 4 | 3.8 µm | Cerca de las firmas de PAH (3.3 µm) y del agua helada (~3.0 µm); los asteroides cercanos empiezan a brillar por su propio calor además de por la luz solar reflejada. |

Un asteroide brilla por luz solar reflejada en las bandas cortas y, por emisión térmica, cada vez más hacia
5 µm. Comparar su brillo entre bandas da pistas sobre su tamaño y albedo; el hallazgo guarda en qué
banda y época se marcó.

## Puesta en marcha (desarrollo)

Requisitos: Node 18+, PHP 8+, Python 3 con `numpy` y `pillow` (solo para regenerar datos).

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

## Modo demo local (sin backend)

`src/api.js` intenta primero el backend PHP. Si no responde, la app sigue funcionando y guarda los hallazgos en
`localStorage` del navegador (clave `planeta-x:hallazgos:v1`), partiendo de 3 hallazgos de ejemplo. Esto pasa
cuando el fetch falla por red, CORS o un tiempo de espera de 5 s, cuando responde `404`/`405`/`502+`, o cuando
devuelve algo que no es JSON (el `index.html` de un hosting estático). El panel HALLAZGOS muestra un indicador:

- **Servidor PHP conectado**: lectura y escritura en `/api/hallazgos.php`.
- **Modo demo local**: los datos solo existen en ese navegador.

Los errores de validación (`400`) no activan el modo demo: se muestran en el formulario. **Recargar** vuelve a
probar el servidor. Para forzar el modo demo sin hacer peticiones: `VITE_MODO_DEMO=true npm run build`. Para volver a
los datos de ejemplo, borra la clave en DevTools → Application → Local Storage.

## Despliegue

### Contenedor único (Render / Railway)
El `Dockerfile` compila el frontend con `node:20-alpine` y lo copia a una imagen `php:8.2-apache`. Apache
sirve la SPA en `/` y la API en `/api/hallazgos.php` desde el mismo origen (no hace falta CORS ni
`VITE_API_URL`). Escucha en `$PORT` (8080 por defecto) y guarda los datos en `/var/www/data/hallazgos.json`,
fuera de la raíz web (variable `HALLAZGOS_ARCHIVO`).

```bash
docker build -t planeta-x .
docker run --rm -p 8080:8080 planeta-x          # http://localhost:8080
docker run --rm -p 8080:8080 -v planeta-x-datos:/var/www/data planeta-x   # con datos persistentes
```

- **Render**: *New → Web Service*, elige el repo; detecta el `Dockerfile` (runtime Docker). Render inyecta
  `PORT`. Para conservar hallazgos entre despliegues añade un *Disk* montado en `/var/www/data`.
- **Railway**: *New Project → Deploy from GitHub repo*; usa el `Dockerfile` e inyecta `PORT`. Añade un
  *Volume* montado en `/var/www/data`.

Sin volumen, la app funciona igual, pero los hallazgos se pierden en cada redespliegue o reinicio.

### Solo frontend (Vercel / GitHub Pages / Netlify)
```bash
cd frontend
npm ci
npm run build                                  # Vercel/Netlify: directorio de salida frontend/dist
VITE_BASE=/Planeta-X/ npm run build            # GitHub Pages de proyecto (https://<usuario>.github.io/Planeta-X/)
```
Sin backend, la app entra sola en **modo demo local**. Si tienes la API desplegada en otro sitio, apunta a ella
con `VITE_API_URL=https://tu-api.onrender.com` (y `CORS_ORIGIN` en el backend).

## Cómo probar la app

1. **Comparador**: en *Antes / Después* arrastra el divisor (o usa ←/→). En *Parpadeo* ajusta la velocidad.
   El objeto móvil sintético está en (412, 538) en la Época A y en (468, 501) en la Época B (Banda 2).
2. **Bandas**: cambia entre 1.0, 1.6, 2.4 y 3.8 µm. El objeto y las estrellas cambian de brillo y color.
3. **Reportar**: haz clic sobre el objeto, elige tipo, escribe un comentario y pulsa *Enviar hallazgo*.
   Aparece en HALLAZGOS y como marcador en el visor.
4. **Persistencia**: pulsa *Recargar* o recarga la página; el hallazgo sigue ahí.
5. **Modo servidor vs demo**: con PHP en marcha el indicador dice *Servidor PHP conectado*. Para el
   servidor PHP y pulsa *Recargar*: pasa a *Modo demo local* y los nuevos hallazgos se guardan en el navegador.
6. **API**: con `curl` (ver abajo). Una petición inválida (`"banda":"banda9"`) debe devolver `400`.

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
3. Si la petición falla (sin servidor), `api.js` cae al modo demo local; si no,
   `hallazgos.php` envía las cabeceras CORS, enruta por `$_SERVER['REQUEST_METHOD']` y devuelve JSON.
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
