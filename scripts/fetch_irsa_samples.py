"""Descarga recortes reales WISE (W1 3.4 µm / W2 4.6 µm) de IRSA para M42 y M45.

Para cada región se toman 2 épocas:
  · Época A: WISE All-Sky (misión criogénica, 2010)  -> colección IRSA `wise_allsky`
  · Época B: NEOWISE-R (exposición más reciente)     -> colección IRSA `neowiser`

Solo se descargan recortes (cutouts) servidos por IRSA: cuadrados de 0.2° de lado
(radio 0.1°) alrededor de la región, de una única exposición por banda y época
(2 regiones × 2 bandas × 2 épocas = 8 recortes FITS, ~0.3 MB cada uno). El script
corta la ejecución si lo descargado supera PRESUPUESTO_BYTES (15 MB).

Cada recorte se calibra en flujo, se le resta el fondo, se reproyecta a una rejilla
común de 512×512 px (norte arriba, este a la izquierda) para que ambas épocas
coincidan píxel a píxel, se estira con escala logarítmica y se guarda como PNG en
frontend/public/assets/regions/, junto con regions.json (metadatos de cada región).

Para que también haya algo que cazar sobre cielo real, se inyecta un candidato transitorio
sintético: una fuente puntual con el PSF gaussiano de WISE que cambia de (X, Y) entre la
Época A y la B. Se suma en flujo calibrado, antes del estiramiento, así que pasa por el mismo
procesado que las estrellas reales. Su posición queda en regions.json (`candidato`).

Además genera en local (sin descargas) la región `NEOSSat-NEO-01`: un campo óptico simulado al
estilo de NEOSSat (CSA), con un asteroide cercano que cruza el campo en 30 min y deja un trazo
corto en cada exposición. Con --solo-locales solo se regenera esa región y se conservan M42/M45
tal como están en regions.json (no se consulta IRSA).

Uso:
    pip install -r scripts/requirements-irsa.txt
    python scripts/fetch_irsa_samples.py
    python scripts/fetch_irsa_samples.py --sin-candidato   # solo el cielo real
    python scripts/fetch_irsa_samples.py --solo-locales    # solo regiones generadas en local
"""

from __future__ import annotations

import argparse
import json
import sys
import warnings
import zlib
from datetime import datetime, timezone
from pathlib import Path

import astropy.units as u
import numpy as np
import requests
from astropy.convolution import Box2DKernel, Gaussian2DKernel, convolve, interpolate_replace_nans
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.stats import sigma_clipped_stats
from astropy.time import Time
from astropy.visualization import BaseTransform, LogStretch, ManualInterval
from astropy.wcs import WCS, FITSFixedWarning
from astroquery.ipac.irsa import Irsa
from PIL import Image
from reproject import reproject_interp

warnings.simplefilter("ignore", FITSFixedWarning)  # cabeceras WISE con RADECSYS (obsoleto)

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "frontend" / "public" / "assets" / "regions"
CACHE = Path(__file__).resolve().parent / ".cache_irsa"

RADIO = 0.1 * u.deg  # regla de tamaño: radio máximo del recorte
TAMANO_PX = 512
MIB = 1024 * 1024
PRESUPUESTO_BYTES = 15 * MIB
MAX_INTENTOS_POR_EPOCA = 3

# id, nombre, designación, coordenadas de respaldo (ICRS, grados) si Sesame no responde
REGIONES = [
    ("m42", "Nebulosa de Orión", "M42", (83.82010, -5.38760)),
    ("m45", "Cúmulo de las Pléyades", "M45", (56.65833, 24.17806)),
]

# id, nombre IRSA, longitud de onda (µm), color de tinte, descripción
BANDAS = [
    ("w1", "W1", 3.4, "#fdba74", "WISE W1 · estrellas y polvo cálido"),
    ("w2", "W2", 4.6, "#f87171", "WISE W2 · polvo caliente y objetos fríos"),
]

# Candidato transitorio inyectado: PSF de WISE (FWHM ≈ 6.1" en W1, 6.4" en W2) y brillo pico en
# múltiplos del ruido de fondo de cada banda. Más brillante en W2, como la emisión térmica de un
# asteroide cercano; en la Época B algo más débil (más lejos del Sol y de la Tierra).
CANDIDATO = {
    "fwhm_arcsec": {"W1": 6.1, "W2": 6.4},
    "pico_sigmas": {"W1": 90.0, "W2": 140.0},
    "factor_epoca": {"A": 1.0, "B": 0.85},
    "desplazamiento_px": (38, 58),
    "margen_px": 64,
}

EPOCAS = {
    "A": {"coleccion": "wise_allsky", "mision": "WISE All-Sky (criogénica)"},
    "B": {"coleccion": "neowiser", "mision": "NEOWISE-R"},
}

REGION_SINTETICA = {
    "id": "spx-j0412+53",
    "nombre": "SPX-J0412+53",
    "designacion": "SPX-J0412+53",
    "tipo": "sintetica",
    "descripcion": "Campo sintético generado con scripts/generar_muestras.py",
    "ra": 63.0,
    "dec": 53.0,
    "tamano_px": 1024,
    "delta": "6 meses",
    "banda_inicial": "banda2",
    "epocas": {"A": {"etiqueta": "Época A"}, "B": {"etiqueta": "+6 meses"}},
    "bandas": [
        {
            "id": f"banda{i}",
            "nombre": f"Banda {i}",
            "longitud": lon,
            "color": color,
            "descripcion": desc,
            "imagenes": {e: f"/assets/banda{i}_epoca{e}.png" for e in "AB"},
        }
        for i, lon, color, desc in [
            (1, 1.0, "#7dd3fc", "IR cercano corto · estrellas calientes"),
            (2, 1.6, "#a5f3fc", "Pico estelar · polvo tenue"),
            (3, 2.4, "#fcd34d", "Polvo cálido · hielos"),
            (4, 3.8, "#fb923c", "IR largo · nebulosas y PAH"),
        ]
    ],
}


# Campo simulado estilo NEOSSat (microsatélite de la CSA, telescopio de 15 cm y CCD óptico sin filtro
# dedicado a asteroides cercanos y satélites). El telescopio sigue a las estrellas, así que un NEO
# rápido aparece como un trazo corto que salta de posición entre dos exposiciones separadas 30 min.
NEOSSAT = {
    "id": "neossat-neo-01",
    "nombre": "NEOSSat-NEO-01 (Asteroide cercano)",
    "designacion": "NEOSSat-NEO-01",
    "centro": (150.0, 12.0),  # cerca de la eclíptica, donde se mueven la mayoría de los asteroides
    "campo_grados": 0.86,
    "exposicion_s": 100,
    "delta_min": 30,
    "velocidad_arcsec_min": 40.0,
    "angulo_grados": 35.0,  # dirección del movimiento en el PNG, desde +x hacia arriba
    "inicio_px": (120.0, 380.0),  # (x, y) del NEO en la Época A, en píxeles del PNG
    "n_estrellas": 700,
    "rayos_cosmicos": 6,  # por época: falsos positivos que aparecen en una sola imagen
    "fwhm_px": 2.2,
    "pico_neo_sigmas": 45.0,
    "semilla": 2013,
    "banda": ("ccd", "NEOSSat CCD", 0.7, "#cbd5e1", "Óptico de banda ancha · sin filtro"),
}


def generar_region_neossat() -> dict:
    """Genera los PNG A/B de NEOSSat-NEO-01 (numpy, sin descargas) y devuelve sus metadatos."""
    cfg = NEOSSAT
    rng = np.random.default_rng(cfg["semilla"])
    escala = cfg["campo_grados"] * 3600 / TAMANO_PX  # ″/px
    sigma = cfg["fwhm_px"] / 2.3548
    filas, columnas = np.mgrid[0:TAMANO_PX, 0:TAMANO_PX]

    def psf(x: float, y: float) -> np.ndarray:
        return np.exp(-((columnas - x) ** 2 + (filas - y) ** 2) / (2 * sigma**2))

    # Estrellas fijas comunes a las 2 épocas: flujos con ley de potencias (pocas brillantes, muchas débiles).
    n = cfg["n_estrellas"]
    xs, ys = rng.uniform(0, TAMANO_PX, n), rng.uniform(0, TAMANO_PX, n)
    flujos = 4.0 * (1 - rng.random(n)) ** -1.4
    estrellas = np.zeros((TAMANO_PX, TAMANO_PX))
    for x, y, f in zip(xs, ys, flujos):
        r = int(np.ceil(4 * sigma + np.log10(f)))
        x0, x1, y0, y1 = max(int(x) - r, 0), min(int(x) + r + 1, TAMANO_PX), max(int(y) - r, 0), min(int(y) + r + 1, TAMANO_PX)
        yy, xx = np.mgrid[y0:y1, x0:x1]
        estrellas[y0:y1, x0:x1] += f * np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * sigma**2))

    angulo = np.radians(cfg["angulo_grados"])
    direccion = np.array([np.cos(angulo), -np.sin(angulo)])  # y del PNG crece hacia abajo
    paso_px = cfg["velocidad_arcsec_min"] * cfg["delta_min"] / escala
    trazo_px = cfg["velocidad_arcsec_min"] * cfg["exposicion_s"] / 60 / escala
    inicio = np.array(cfg["inicio_px"])
    posiciones_px = {"A": inicio, "B": inicio + paso_px * direccion}

    banda_id, banda_nombre, longitud, color, descripcion = cfg["banda"]
    fondo, ruido = 20.0, 1.0
    norma = LogStretch(a=300) + ManualInterval(-2 * ruido, 300.0)  # intervalo primero, luego log
    imagenes = {}
    for epoca, centro_neo in posiciones_px.items():
        cielo = fondo + estrellas + rng.normal(0, ruido, estrellas.shape)
        # NEO: PSF integrada a lo largo del trazo de la exposición, centrada en su posición.
        neo = sum(psf(*(centro_neo + t * trazo_px * direccion)) for t in np.linspace(-0.5, 0.5, 15)) / 15
        cielo += cfg["pico_neo_sigmas"] * ruido * neo / neo.max()
        for _ in range(cfg["rayos_cosmicos"]):  # impactos de 1-2 px que no se repiten entre épocas
            x, y = rng.integers(0, TAMANO_PX - 1, size=2)
            cielo[y : y + rng.integers(1, 3), x : x + rng.integers(1, 3)] += rng.uniform(40, 120)
        nombre_png = f"neossat_{banda_id}_epoca{epoca}.png"
        a_png_arriba(cielo - fondo, norma, color, SALIDA / nombre_png)
        imagenes[epoca] = f"/assets/regions/{nombre_png}"

    centro = SkyCoord(*cfg["centro"], unit="deg")
    destino = wcs_destino(centro, cfg["campo_grados"])
    posiciones = {}
    for epoca, (x, y) in posiciones_px.items():
        cielo = destino.pixel_to_world(x, TAMANO_PX - 1 - y)  # el WCS usa la fila 0 abajo
        posiciones[epoca] = {"x": round(x), "y": round(y), "ra": round(cielo.ra.deg, 5), "dec": round(cielo.dec.deg, 5)}
    print(
        f"  ✔ NEOSSat-NEO-01: A({posiciones['A']['x']}, {posiciones['A']['y']}) → "
        f"B({posiciones['B']['x']}, {posiciones['B']['y']}) · {paso_px:.0f} px en {cfg['delta_min']} min"
    )
    return {
        "id": cfg["id"],
        "nombre": cfg["nombre"],
        "designacion": cfg["designacion"],
        "tipo": "simulada",
        "descripcion": "Campo óptico simulado estilo NEOSSat (CSA): un asteroide cercano cruza el campo entre 2 exposiciones",
        "ra": centro.ra.deg,
        "dec": centro.dec.deg,
        "ra_hms": centro.ra.to_string(u.hour, sep=":", precision=1),
        "dec_dms": centro.dec.to_string(u.deg, sep=":", precision=0, alwayssign=True),
        "campo_grados": cfg["campo_grados"],
        "tamano_px": TAMANO_PX,
        "escala_arcsec_px": round(escala, 3),
        "delta": f"{cfg['delta_min']} min",
        "banda_inicial": banda_id,
        "titulo_bandas": "NEOSSat · CCD óptico",
        "rango_bandas": ["0.4 µm", "1.0 µm"],
        "epocas": {
            "A": {"etiqueta": "T₀", "exposicion_s": cfg["exposicion_s"]},
            "B": {"etiqueta": f"T₀ + {cfg['delta_min']} min", "exposicion_s": cfg["exposicion_s"]},
        },
        "bandas": [
            {"id": banda_id, "nombre": banda_nombre, "longitud": longitud, "color": color, "descripcion": descripcion, "imagenes": imagenes}
        ],
        "fuente": "Simulación local inspirada en NEOSSat (Agencia Espacial Canadiense · CADC); no son datos de la misión",
        "candidato": {
            "tipo": "asteroide cercano (NEO, simulado)",
            "descripcion": "Trazo corto (el telescopio sigue a las estrellas) que salta de posición entre exposiciones",
            "posiciones": posiciones,
            "desplazamiento_px": round(paso_px, 1),
            "desplazamiento_arcsec": round(paso_px * escala, 1),
            "velocidad_arcsec_min": cfg["velocidad_arcsec_min"],
            "trazo_px": round(trazo_px, 1),
        },
    }


class Presupuesto:
    """Lleva la cuenta de los bytes descargados y aborta si se supera el límite."""

    def __init__(self, limite: int):
        self.limite = limite
        self.usado = 0

    def sumar(self, n: int) -> None:
        self.usado += n
        if self.usado > self.limite:
            sys.exit(f"✖ Presupuesto superado: {self.usado / MIB:.2f} MiB > {self.limite / MIB:.0f} MiB")


def resolver(nombre: str, respaldo: tuple[float, float]) -> SkyCoord:
    try:
        return SkyCoord.from_name(nombre).icrs
    except Exception as err:  # sin red hacia Sesame: usar coordenadas conocidas
        print(f"  (Sesame no disponible para {nombre}: {err}; uso coordenadas de respaldo)")
        return SkyCoord(*respaldo, unit="deg", frame="icrs")


def candidatos(centro: SkyCoord, coleccion: str) -> list[dict]:
    """Exposiciones (obs_id) de `coleccion` que contienen el centro y tienen W1 y W2.

    La consulta SIA solo devuelve metadatos (tabla de URLs), no píxeles.
    """
    tabla = Irsa.query_sia(pos=(centro, 0.01 * u.deg), collection=coleccion)
    tabla = tabla[tabla["dataproduct_subtype"] == "science"]
    exposiciones: dict[str, dict] = {}
    for fila in tabla:
        banda = str(fila["energy_bandpassname"])
        if banda not in ("W1", "W2"):
            continue
        exp = exposiciones.setdefault(
            str(fila["obs_id"]),
            {
                "obs_id": str(fila["obs_id"]),
                "t_min": float(fila["t_min"]),
                "separacion": centro.separation(SkyCoord(fila["s_ra"], fila["s_dec"], unit="deg")).deg,
                "urls": {},
            },
        )
        exp["urls"][banda] = str(fila["access_url"])
    return [e for e in exposiciones.values() if {"W1", "W2"} <= e["urls"].keys()]


def exposiciones_en_cache(rid: str, coleccion: str) -> list[dict]:
    """Exposiciones con W1 y W2 ya descargadas en CACHE (para regenerar PNG si IRSA no responde)."""
    prefijo = f"{rid}_{coleccion}_"
    exposiciones = []
    for w1 in sorted(CACHE.glob(f"{prefijo}*_W1*.fits")):
        obs_id = w1.name[len(prefijo) :].split("_W1")[0]
        if next(CACHE.glob(f"{prefijo}{obs_id}_W2*.fits"), None) is None:
            continue
        mjd = float(fits.getheader(w1)["MJD_OBS"])
        exposiciones.append({"obs_id": obs_id, "t_min": mjd, "separacion": 0.0, "urls": {"W1": None, "W2": None}})
    return exposiciones


def ordenar(exposiciones: list[dict], epoca: str) -> list[dict]:
    if epoca == "A":
        # La exposición mejor centrada: el recorte cae completo dentro del detector.
        return sorted(exposiciones, key=lambda e: e["separacion"])
    # Época B: la exposición más reciente cuyo centro quede cerca de la región.
    centradas = [e for e in exposiciones if e["separacion"] < 0.2] or exposiciones
    return sorted(centradas, key=lambda e: (-e["t_min"], e["separacion"]))


def descargar_recorte(url: str, centro: SkyCoord, destino: Path, presupuesto: Presupuesto) -> fits.HDUList:
    """Pide a IRSA un recorte de 2·RADIO de lado (el servidor recorta el FITS original)."""
    # El centro forma parte del nombre: si cambian las coordenadas resueltas, se pide un recorte nuevo.
    destino = destino.with_name(f"{destino.stem}_{centro.ra.deg:.4f}{centro.dec.deg:+.4f}{destino.suffix}")
    if url is None:  # modo caché: recortes de una ejecución anterior (con o sin el centro en el nombre)
        sin_centro = destino.with_name(destino.name.replace(f"_{centro.ra.deg:.4f}{centro.dec.deg:+.4f}", ""))
        destino = destino if destino.exists() or not sin_centro.exists() else sin_centro
        if not destino.exists():
            sys.exit(f"✖ IRSA no responde y no hay recorte en caché para {destino.name}")
    if destino.exists():  # ya descargado en una ejecución anterior: cuenta igual para el límite
        presupuesto.sumar(destino.stat().st_size)
        return fits.open(destino)
    params = {
        "center": f"{centro.ra.deg:.6f},{centro.dec.deg:.6f}",
        "size": f"{2 * RADIO.to_value(u.deg):.3f}deg",
        "gzip": "false",
    }
    resp = requests.get(url, params=params, timeout=120)
    resp.raise_for_status()
    presupuesto.sumar(len(resp.content))
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(resp.content)
    return fits.open(destino)


def wcs_destino(centro: SkyCoord, lado_grados: float) -> WCS:
    """Rejilla común TAN de TAMANO_PX² y `lado_grados` de lado, norte arriba y este a la izquierda."""
    escala = lado_grados / TAMANO_PX
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [centro.ra.deg, centro.dec.deg]
    w.wcs.crpix = [(TAMANO_PX + 1) / 2, (TAMANO_PX + 1) / 2]
    w.wcs.cdelt = [-escala, escala]
    return w


def calibrar(hdul: fits.HDUList) -> tuple[np.ndarray, WCS]:
    """FITS L1b (DN) -> nanomaggies sin fondo y sin huecos, con su WCS original."""
    hdu = hdul[0]
    datos = hdu.data.astype(np.float64)
    # Calibración fotométrica: cada época tiene su punto cero (MAGZP); llevamos todo a ZP = 22.5.
    datos *= 10 ** (-0.4 * (hdu.header["MAGZP"] - 22.5))
    # Fondo del cielo robusto (mediana con recorte sigma) y resta.
    _, mediana, _ = sigma_clipped_stats(datos[np.isfinite(datos)], sigma=3.0, maxiters=5)
    datos -= mediana
    # En los L1b los píxeles inválidos llegan como NaN. Zonas extensas = núcleos saturados de
    # estrellas o nebulosa brillante -> se rellenan con el máximo; píxeles sueltos (rayos
    # cósmicos, píxeles muertos) -> se interpolan con un núcleo gaussiano.
    invalidos = ~np.isfinite(datos)
    if invalidos.any():
        vecinos = convolve(invalidos.astype(float), Box2DKernel(5), boundary="extend")
        datos[invalidos & (vecinos > 0.3)] = np.nanmax(datos)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            datos = interpolate_replace_nans(datos, Gaussian2DKernel(1.5))
        datos[~np.isfinite(datos)] = np.nanmax(datos)
    return datos, WCS(hdu.header)


def lado_cubierto(imagenes: list[tuple[np.ndarray, WCS]], centro: SkyCoord) -> float:
    """Lado (grados) del mayor cuadrado centrado, norte arriba, cubierto por todos los recortes.

    Los detectores de WISE están girados respecto al norte y cada época tiene otra orientación,
    así que el cuadrado de 2·RADIO pedido no cubre entero una rejilla norte-arriba.
    """
    lado = 2 * RADIO.to_value(u.deg)
    cubierto = np.ones((TAMANO_PX, TAMANO_PX), bool)
    for datos, wcs in imagenes:
        _, cobertura = reproject_interp((datos, wcs), wcs_destino(centro, lado), shape_out=cubierto.shape)
        cubierto &= cobertura > 0.999
    c = TAMANO_PX // 2
    mitad = next((m for m in range(c, 0, -1) if cubierto[c - m : c + m, c - m : c + m].all()), 1)
    return lado * 2 * mitad / TAMANO_PX


def reproyectar(datos: np.ndarray, wcs: WCS, destino: WCS) -> np.ndarray:
    """Cada píxel destino -> (RA, Dec) -> píxel origen (incluye la distorsión SIP) e interpola."""
    salida, cobertura = reproject_interp((datos, wcs), destino, shape_out=(TAMANO_PX, TAMANO_PX))
    salida[(cobertura == 0) | ~np.isfinite(salida)] = 0.0
    return salida


def elegir_trayectoria(ref_a: np.ndarray, ref_b: np.ndarray, rid: str) -> dict[str, tuple[float, float]]:
    """Posición (fila, columna) del candidato en cada época, sobre zonas de fondo tenue.

    Semilla fija por región: volver a ejecutar el script da la misma trayectoria.
    """
    rng = np.random.default_rng(zlib.crc32(rid.encode()))
    suave = convolve(np.maximum(ref_a, ref_b), Box2DKernel(15), boundary="extend")
    tenue = suave < np.percentile(suave, 40)
    m = CANDIDATO["margen_px"]
    dmin, dmax = CANDIDATO["desplazamiento_px"]
    for _ in range(5000):
        fa, ca = rng.uniform(m, TAMANO_PX - m, size=2)
        angulo, distancia = rng.uniform(0, 2 * np.pi), rng.uniform(dmin, dmax)
        fb, cb = fa + distancia * np.sin(angulo), ca + distancia * np.cos(angulo)
        if not (m <= fb < TAMANO_PX - m and m <= cb < TAMANO_PX - m):
            continue
        if tenue[int(fa), int(ca)] and tenue[int(fb), int(cb)]:
            return {"A": (fa, ca), "B": (fb, cb)}
    sys.exit(f"✖ No encontré fondo tenue para el candidato de {rid}")


def inyectar_fuente(datos: np.ndarray, fila: float, columna: float, sigma_px: float, pico: float) -> np.ndarray:
    """Suma una gaussiana 2D (PSF) de altura `pico` centrada en (fila, columna)."""
    filas, columnas = np.mgrid[0 : datos.shape[0], 0 : datos.shape[1]]
    psf = np.exp(-((filas - fila) ** 2 + (columnas - columna) ** 2) / (2 * sigma_px**2))
    return datos + pico * psf


def a_png_arriba(datos: np.ndarray, norma: BaseTransform, color: str, ruta: Path) -> None:
    """Guarda `datos` (fila 0 arriba, como el PNG) estirados con `norma` y teñidos con `color`."""
    valores = norma(datos, clip=True)  # 0..1 tras el estiramiento log
    tinte = np.array([int(color[i : i + 2], 16) for i in (1, 3, 5)]) / 255
    tinte = 0.35 + 0.65 * tinte / tinte.max()  # tinte suave: las estrellas siguen siendo blancas
    rgb = np.clip(valores[..., None] * tinte, 0, 1)
    Image.fromarray((rgb * 255).astype(np.uint8), "RGB").save(ruta, optimize=True)


def a_png(datos: np.ndarray, norma: BaseTransform, color: str, ruta: Path) -> None:
    # FITS guarda la fila 0 abajo (y crece hacia el norte); en PNG la fila 0 es la de arriba.
    a_png_arriba(np.flipud(datos), norma, color, ruta)


def procesar_region(rid, nombre, designacion, respaldo, presupuesto, con_candidato=True) -> dict:
    print(f"\n▶ {designacion} · {nombre}")
    centro = resolver(designacion, respaldo)
    epocas_meta, calibradas = {}, {}

    for epoca, conf in EPOCAS.items():
        try:
            expos = ordenar(candidatos(centro, conf["coleccion"]), epoca)
        except Exception as err:  # IRSA caído o sin red: se reutilizan los recortes ya descargados
            print(f"  (IRSA SIA no disponible: {str(err).splitlines()[0]}; uso la caché local)")
            expos = ordenar(exposiciones_en_cache(rid, conf["coleccion"]), epoca)
        if not expos:
            sys.exit(f"✖ Sin exposiciones de {conf['coleccion']} para {designacion}")
        for exp in expos[:MAX_INTENTOS_POR_EPOCA]:
            hduls = {
                b: descargar_recorte(exp["urls"][b], centro, CACHE / f"{rid}_{conf['coleccion']}_{exp['obs_id']}_{b}.fits", presupuesto)
                for b in ("W1", "W2")
            }
            alto, ancho = hduls["W1"][0].data.shape
            lado_esperado = 2 * RADIO.to_value(u.arcsec) / 2.75
            if min(alto, ancho) >= 0.9 * lado_esperado:
                break
            print(f"  · {exp['obs_id']} recorte incompleto ({ancho}×{alto}), pruebo otra exposición")
        else:
            sys.exit(f"✖ Ninguna exposición de {conf['coleccion']} cubre {designacion}")

        cab = hduls["W1"][0].header
        fecha = Time(cab["MJD_OBS"], format="mjd")
        epocas_meta[epoca] = {
            "etiqueta": f"{conf['mision'].split(' ')[0]} {fecha.datetime.year}",
            "mision": conf["mision"],
            "coleccion": conf["coleccion"],
            "obs_id": exp["obs_id"],
            "fecha": fecha.isot[:19] + "Z",
            "mjd": round(float(cab["MJD_OBS"]), 5),
        }
        calibradas[epoca] = {b: calibrar(h) for b, h in hduls.items()}
        print(f"  ✔ Época {epoca}: {conf['coleccion']} {exp['obs_id']} ({epocas_meta[epoca]['fecha']})")

    lado = lado_cubierto([img for ep in calibradas.values() for img in ep.values()], centro)
    destino = wcs_destino(centro, lado)
    datos = {e: {b: reproyectar(*img, destino) for b, img in ep.items()} for e, ep in calibradas.items()}
    print(f"  ✔ Rejilla común: {lado:.3f}° de lado → {TAMANO_PX}×{TAMANO_PX} px")

    escala = lado * 3600 / TAMANO_PX  # arcsec / px
    trayectoria = elegir_trayectoria(datos["A"]["W1"], datos["B"]["W1"], rid) if con_candidato else None

    bandas_meta = []
    for bid, birsa, longitud, color, descripcion in BANDAS:
        a, b = datos["A"][birsa], datos["B"][birsa]
        # Misma normalización para las dos épocas: el parpadeo solo muestra cambios reales.
        _, _, sigma = sigma_clipped_stats(np.concatenate([a.ravel(), b.ravel()]), sigma=3.0)
        vmax = np.percentile(np.concatenate([a.ravel(), b.ravel()]), 99.9)
        # Primero el intervalo lineal [vmin, vmax] -> [0, 1]; después y = log(a·x + 1) / log(a + 1).
        # La normalización se fija con el cielo real: el candidato no altera el aspecto del fondo.
        norma = LogStretch(a=1000) + ManualInterval(vmin=-2.0 * sigma, vmax=vmax)
        if trayectoria:
            sigma_psf = CANDIDATO["fwhm_arcsec"][birsa] / 2.3548 / escala
            pico = CANDIDATO["pico_sigmas"][birsa] * sigma
            a = inyectar_fuente(a, *trayectoria["A"], sigma_psf, pico * CANDIDATO["factor_epoca"]["A"])
            b = inyectar_fuente(b, *trayectoria["B"], sigma_psf, pico * CANDIDATO["factor_epoca"]["B"])
        imagenes = {}
        for epoca, arr in (("A", a), ("B", b)):
            nombre_png = f"{rid}_{bid}_epoca{epoca}.png"
            a_png(arr, norma, color, SALIDA / nombre_png)
            imagenes[epoca] = f"/assets/regions/{nombre_png}"
        bandas_meta.append(
            {
                "id": bid,
                "nombre": f"WISE {birsa}",
                "longitud": longitud,
                "color": color,
                "descripcion": descripcion,
                "imagenes": imagenes,
            }
        )

    candidato = None
    if trayectoria:
        posiciones = {}
        for epoca, (fila, columna) in trayectoria.items():
            cielo = destino.pixel_to_world(columna, fila)
            # x, y en píxeles del PNG (fila 0 arriba), el mismo sistema que usan los hallazgos.
            posiciones[epoca] = {
                "x": round(columna),
                "y": round(TAMANO_PX - 1 - fila),
                "ra": round(cielo.ra.deg, 5),
                "dec": round(cielo.dec.deg, 5),
            }
        (fa, ca), (fb, cb) = trayectoria["A"], trayectoria["B"]
        desplazamiento = float(np.hypot(fb - fa, cb - ca))
        candidato = {
            "tipo": "asteroide (sintético, inyectado)",
            "descripcion": "Fuente puntual gaussiana (PSF de WISE) añadida al flujo real; cambia de posición entre épocas",
            "posiciones": posiciones,
            "desplazamiento_px": round(desplazamiento, 1),
            "desplazamiento_arcsec": round(desplazamiento * escala, 1),
            "fwhm_arcsec": CANDIDATO["fwhm_arcsec"],
            "pico_sigmas": CANDIDATO["pico_sigmas"],
        }
        print(
            f"  ✔ Candidato: A({posiciones['A']['x']}, {posiciones['A']['y']}) → "
            f"B({posiciones['B']['x']}, {posiciones['B']['y']}) · {desplazamiento:.0f} px"
        )

    dias = epocas_meta["B"]["mjd"] - epocas_meta["A"]["mjd"]
    return {
        "id": rid,
        "nombre": nombre,
        "designacion": designacion,
        "tipo": "real",
        "descripcion": f"Recorte WISE de {lado:.2f}° alrededor de {designacion} (IRSA)",
        "ra": round(centro.ra.deg, 5),
        "dec": round(centro.dec.deg, 5),
        "ra_hms": centro.ra.to_string(u.hour, sep=":", precision=1),
        "dec_dms": centro.dec.to_string(u.deg, sep=":", precision=0, alwayssign=True),
        "radio_consulta_grados": RADIO.to_value(u.deg),
        "campo_grados": round(lado, 4),
        "tamano_px": TAMANO_PX,
        "escala_arcsec_px": round(lado * 3600 / TAMANO_PX, 3),
        "delta": f"{dias / 365.25:.1f} años",
        "banda_inicial": "w1",
        "epocas": epocas_meta,
        "bandas": bandas_meta,
        "fuente": "NASA/IPAC Infrared Science Archive (IRSA) · WISE/NEOWISE",
        **({"candidato": candidato} if candidato else {}),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--limpiar-cache", action="store_true", help="borra los FITS descargados al terminar")
    parser.add_argument("--sin-candidato", action="store_true", help="no inyecta el candidato transitorio sintético")
    parser.add_argument(
        "--solo-locales", action="store_true", help="solo regenera las regiones locales; conserva M42/M45 de regions.json"
    )
    args = parser.parse_args()

    SALIDA.mkdir(parents=True, exist_ok=True)
    presupuesto = Presupuesto(PRESUPUESTO_BYTES)
    if args.solo_locales:
        anterior = json.loads((SALIDA / "regions.json").read_text(encoding="utf-8"))
        presupuesto.usado = anterior.get("descargado_bytes", 0)
        reales = [r for r in anterior["regiones"] if r.get("tipo") == "real"]
    else:
        reales = [procesar_region(*r, presupuesto, not args.sin_candidato) for r in REGIONES]
    regiones = [REGION_SINTETICA, *reales, generar_region_neossat()]

    catalogo = {
        "generado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "descargado_bytes": presupuesto.usado,
        "regiones": regiones,
    }
    (SALIDA / "regions.json").write_text(json.dumps(catalogo, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    pngs = sum(p.stat().st_size for p in SALIDA.glob("*.png"))
    print(f"\nPeso total de los recortes FITS: {presupuesto.usado / MIB:.2f} MiB (límite {PRESUPUESTO_BYTES / MIB:.0f} MiB)")
    print(f"PNG generados: {pngs / MIB:.2f} MiB en {SALIDA.relative_to(RAIZ)}")
    if args.limpiar_cache:
        for f in CACHE.glob("*.fits"):
            f.unlink()


if __name__ == "__main__":
    main()
