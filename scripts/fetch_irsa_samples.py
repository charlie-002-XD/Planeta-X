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

Uso:
    pip install -r scripts/requirements-irsa.txt
    python scripts/fetch_irsa_samples.py
"""

from __future__ import annotations

import argparse
import json
import sys
import warnings
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
    ("m42", "Nebulosa de Orión", "M42", (83.82208, -5.39111)),
    ("m45", "Cúmulo de las Pléyades", "M45", (56.75000, 24.11667)),
]

# id, nombre IRSA, longitud de onda (µm), color de tinte, descripción
BANDAS = [
    ("w1", "W1", 3.4, "#fdba74", "WISE W1 · estrellas y polvo cálido"),
    ("w2", "W2", 4.6, "#f87171", "WISE W2 · polvo caliente y objetos fríos"),
]

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


def a_png(datos: np.ndarray, norma: BaseTransform, color: str, ruta: Path) -> None:
    valores = norma(datos, clip=True)  # 0..1 tras el estiramiento log
    tinte = np.array([int(color[i : i + 2], 16) for i in (1, 3, 5)]) / 255
    tinte = 0.35 + 0.65 * tinte / tinte.max()  # tinte suave: las estrellas siguen siendo blancas
    rgb = np.clip(valores[..., None] * tinte, 0, 1)
    # FITS guarda la fila 0 abajo (y crece hacia el norte); en PNG la fila 0 es la de arriba.
    Image.fromarray((np.flipud(rgb) * 255).astype(np.uint8), "RGB").save(ruta, optimize=True)


def procesar_region(rid, nombre, designacion, respaldo, presupuesto) -> dict:
    print(f"\n▶ {designacion} · {nombre}")
    centro = resolver(designacion, respaldo)
    epocas_meta, calibradas = {}, {}

    for epoca, conf in EPOCAS.items():
        expos = ordenar(candidatos(centro, conf["coleccion"]), epoca)
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

    bandas_meta = []
    for bid, birsa, longitud, color, descripcion in BANDAS:
        a, b = datos["A"][birsa], datos["B"][birsa]
        # Misma normalización para las dos épocas: el parpadeo solo muestra cambios reales.
        _, _, sigma = sigma_clipped_stats(np.concatenate([a.ravel(), b.ravel()]), sigma=3.0)
        vmax = np.percentile(np.concatenate([a.ravel(), b.ravel()]), 99.9)
        # Primero el intervalo lineal [vmin, vmax] -> [0, 1]; después y = log(a·x + 1) / log(a + 1).
        norma = LogStretch(a=1000) + ManualInterval(vmin=-2.0 * sigma, vmax=vmax)
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
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--limpiar-cache", action="store_true", help="borra los FITS descargados al terminar")
    args = parser.parse_args()

    SALIDA.mkdir(parents=True, exist_ok=True)
    presupuesto = Presupuesto(PRESUPUESTO_BYTES)
    regiones = [REGION_SINTETICA] + [procesar_region(*r, presupuesto) for r in REGIONES]

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
