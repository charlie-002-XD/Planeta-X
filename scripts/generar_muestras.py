"""Genera imágenes astronómicas sintéticas para el comparador SPHEREx.

Mismo campo estelar en la Época A y la Época B (6 meses de diferencia),
con un objeto luminoso (asteroide) desplazado entre ambas.
Se generan 4 bandas de infrarrojo cercano × 2 épocas, más `epoca_a.png`
y `epoca_b.png` (composición de referencia).

Uso:
    pip install numpy pillow
    python scripts/generar_muestras.py
"""

from pathlib import Path

import numpy as np
from PIL import Image

TAMANO = 1024
N_ESTRELLAS = 1500
SEMILLA = 42
SALIDA = Path(__file__).resolve().parent.parent / "frontend" / "public" / "assets"

# Posición (x, y) del objeto móvil en cada época, en píxeles.
OBJETO_EPOCA_A = (412, 538)
OBJETO_EPOCA_B = (468, 501)

# id, longitud de onda (µm), tinte RGB, peso de la nebulosa, brillo del objeto
BANDAS = [
    ("banda1", 1.0, (0.70, 0.80, 1.00), 0.35, 0.80),
    ("banda2", 1.6, (0.85, 0.95, 1.00), 0.55, 0.95),
    ("banda3", 2.4, (1.00, 0.85, 0.65), 0.80, 1.10),
    ("banda4", 3.8, (1.00, 0.60, 0.45), 1.00, 1.25),
]


def gaussiana(imagen, x, y, flujo, sigma):
    """Suma una fuente puntual gaussiana sobre `imagen` (in situ)."""
    radio = int(np.ceil(sigma * 4))
    x0, x1 = max(int(x) - radio, 0), min(int(x) + radio + 1, TAMANO)
    y0, y1 = max(int(y) - radio, 0), min(int(y) + radio + 1, TAMANO)
    if x0 >= x1 or y0 >= y1:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1]
    imagen[y0:y1, x0:x1] += flujo * np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * sigma**2))


def nebulosa(rng):
    """Ruido fractal suave (suma de octavas reescaladas) normalizado a [0, 1]."""
    campo = np.zeros((TAMANO, TAMANO))
    for octava, peso in [(8, 1.0), (16, 0.5), (32, 0.25), (64, 0.12)]:
        base = rng.random((octava, octava))
        capa = Image.fromarray((base * 255).astype(np.uint8)).resize((TAMANO, TAMANO), Image.BICUBIC)
        campo += peso * np.asarray(capa, dtype=np.float64) / 255
    campo = (campo - campo.min()) / (campo.max() - campo.min())
    return campo**3


def catalogo_estelar(rng):
    """Catálogo fijo: posiciones, flujos (ley de potencias) y 'color' por estrella."""
    xs = rng.uniform(0, TAMANO, N_ESTRELLAS)
    ys = rng.uniform(0, TAMANO, N_ESTRELLAS)
    flujos = rng.pareto(1.8, N_ESTRELLAS) * 0.08 + 0.03
    temperatura = rng.uniform(0, 1, N_ESTRELLAS)  # 0 = fría (roja), 1 = caliente (azul)
    return xs, ys, np.clip(flujos, 0, 3.0), temperatura


def render_banda(banda, catalogo, campo_nebular, objeto, semilla_ruido):
    _, longitud, tinte, peso_nebulosa, brillo_objeto = banda
    xs, ys, flujos, temperatura = catalogo
    imagen = np.zeros((TAMANO, TAMANO))

    # Las estrellas calientes brillan más en longitudes cortas y las frías en largas.
    t = (longitud - 1.0) / (3.8 - 1.0)
    factor_color = (1 - t) * (0.5 + temperatura) + t * (1.5 - temperatura)
    sigma = 1.1 + 0.35 * t  # PSF más ancha a mayor longitud de onda
    for x, y, f, c in zip(xs, ys, flujos, factor_color):
        gaussiana(imagen, x, y, f * c, sigma)

    imagen += campo_nebular * 0.35 * peso_nebulosa

    # Objeto móvil: núcleo brillante + ligera coma.
    ox, oy = objeto
    gaussiana(imagen, ox, oy, 2.4 * brillo_objeto, sigma + 0.8)
    gaussiana(imagen, ox - 3, oy + 2, 0.5 * brillo_objeto, sigma + 3.5)

    # Ruido de fondo distinto en cada época (lectura del detector).
    ruido = np.random.default_rng(semilla_ruido)
    imagen += 0.02 + ruido.normal(0, 0.003, imagen.shape)

    # Estiramiento asinh típico en astronomía para comprimir el rango dinámico.
    imagen = np.arcsinh(np.clip(imagen, 0, None) * 6) / np.arcsinh(6 * 1.6)
    imagen = np.clip(imagen, 0, 1)

    rgb = np.stack([imagen * canal for canal in tinte], axis=-1)
    return Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8), "RGB")


def main():
    SALIDA.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEMILLA)
    catalogo = catalogo_estelar(rng)
    campo_nebular = nebulosa(rng)

    for i, banda in enumerate(BANDAS):
        for epoca, objeto, desfase in (("A", OBJETO_EPOCA_A, 0), ("B", OBJETO_EPOCA_B, 100)):
            img = render_banda(banda, catalogo, campo_nebular, objeto, SEMILLA + i + desfase)
            ruta = SALIDA / f"{banda[0]}_epoca{epoca}.png"
            img.save(ruta, optimize=True)
            print(f"✔ {ruta.relative_to(SALIDA.parent.parent.parent)}")
            if banda[0] == "banda2":
                ref = SALIDA / f"epoca_{epoca.lower()}.png"
                img.save(ref, optimize=True)
                print(f"✔ {ref.relative_to(SALIDA.parent.parent.parent)}")

    print(f"Objeto móvil: Época A {OBJETO_EPOCA_A} → Época B {OBJETO_EPOCA_B}")


if __name__ == "__main__":
    main()
