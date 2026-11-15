// i18n ligero ES / EN: diccionario plano, interpolación `{clave}` y preferencia guardada en localStorage.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export const IDIOMAS = ['es', 'en']
const CLAVE_IDIOMA = 'planeta-x:idioma'

const TEXTOS = {
  es: {
    'app.titulo': 'Cazador de objetos en movimiento',
    'app.documento': 'Planeta-X · Cazador de objetos SPHEREx',
    'idioma.etiqueta': 'Idioma',
    'idioma.cambiar': 'Cambiar idioma a {idioma}',

    'region.etiqueta': 'Región:',
    'region.aria': 'Región del cielo',
    'region.sintetica': 'sintética',

    'bandas.aria': 'Bandas espectrales',
    'bandas.ir_cercano': 'Bandas IR cercano',
    'bandas.wise': 'Bandas WISE (IR)',

    'modo.aria': 'Modo de comparación',
    'modo.slider': 'Antes / Después',
    'modo.blink': 'Parpadeo (Blink)',
    'blink.pausar': 'Pausar parpadeo',
    'blink.reanudar': 'Reanudar parpadeo',
    'blink.velocidad': 'Velocidad',
    'blink.intervalo': 'Intervalo de parpadeo en milisegundos',

    'epoca.nombre': 'Época {epoca}',
    'epoca.mayus': 'ÉPOCA {epoca}',
    'epoca.divisor': 'Divisor Época A / Época B',
    'epoca.b_por_defecto': '+6 meses',
    'visor.clic_destino': 'Clic en la posición del objeto en la Época B',

    'reporte.titulo': 'Nuevo reporte',
    'reporte.banda': 'Banda',
    'reporte.epoca': 'Época',
    'reporte.destino': 'Destino',
    'reporte.quitar': 'Quitar',
    'reporte.clic_en_a': 'Haz clic en el objeto en la Época A para trazar su vector A → B',
    'reporte.armado': 'Haz clic sobre el objeto en la Época B…',
    'reporte.armar': '↗ Marcar destino en Época B',
    'reporte.comentario': 'Comentario: brillo, dirección del movimiento…',
    'reporte.enviando': 'Enviando…',
    'reporte.enviar': 'Enviar hallazgo',
    'reporte.cancelar': 'Cancelar',
    'reporte.ayuda.1': 'Compara las dos épocas y haz',
    'reporte.ayuda.clic': 'clic',
    'reporte.ayuda.2':
      'sobre cualquier objeto que cambie de posición (asteroide, cometa o planeta) para marcar sus coordenadas. Un segundo clic en la otra época traza su',
    'reporte.ayuda.vector': 'vector de trayectoria',
    'aviso.registrado': 'Hallazgo #{id} registrado en ({x}, {y}){ruta}',

    'tipo.asteroide': 'Asteroide',
    'tipo.cometa': 'Cometa',
    'tipo.planeta': 'Planeta',

    'hallazgos.titulo': 'Hallazgos',
    'hallazgos.recargar': 'Recargar',
    'hallazgos.filtrar': 'Filtrar hallazgos',
    'hallazgos.esta_region': 'Esta región',
    'hallazgos.todos': 'Todos',
    'hallazgos.solo': 'Solo {region}',
    'hallazgos.region_activa': 'la región activa',
    'hallazgos.todas_regiones': 'Hallazgos de todas las regiones',
    'hallazgos.error': 'El backend PHP respondió con un error. Prueba a recargar.',
    'hallazgos.vacio_region': 'Aún no hay reportes en esta región.',
    'hallazgos.vacio': 'Aún no hay reportes.',

    'estado.conectando': 'Conectando…',
    'estado.conectando.ayuda': 'Consultando el backend PHP',
    'estado.error': 'Error del servidor',
    'estado.error.ayuda': 'El backend PHP respondió con un error',
    'estado.local': 'Modo demo local',
    'estado.local.ayuda': 'Sin backend PHP: los hallazgos se guardan en este navegador (localStorage)',
    'estado.servidor': 'Servidor PHP conectado',
    'estado.servidor.ayuda': 'Los hallazgos se guardan en el backend PHP',

    'exportar.boton': 'Exportar',
    'exportar.listo': 'Listo',
    'exportar.error': 'Error',
    'exportar.titulo': 'Exportar todos los hallazgos',
    'exportar.fallo': 'No se pudo exportar',

    'creditos.titulo': 'NASA Space Apps · SPHEREx — Fuentes y referencias:',
    'creditos.irsa': 'Archivo de WISE/NEOWISE y SPHEREx',
    'creditos.spherex': 'Misión de la NASA',
    'creditos.wiseview': 'Blink de épocas · Backyard Worlds',
    'creditos.gaia': 'Astrometría de referencia · ESA',
    'creditos.neossat': 'Agencia Espacial Canadiense · datos en CADC',
  },
  en: {
    'app.titulo': 'Moving object hunter',
    'app.documento': 'Planeta-X · SPHEREx moving object hunter',
    'idioma.etiqueta': 'Language',
    'idioma.cambiar': 'Switch language to {idioma}',

    'region.etiqueta': 'Region:',
    'region.aria': 'Sky region',
    'region.sintetica': 'synthetic',

    'bandas.aria': 'Spectral bands',
    'bandas.ir_cercano': 'Near-IR bands',
    'bandas.wise': 'WISE bands (IR)',

    'modo.aria': 'Comparison mode',
    'modo.slider': 'Before / After',
    'modo.blink': 'Blink',
    'blink.pausar': 'Pause blink',
    'blink.reanudar': 'Resume blink',
    'blink.velocidad': 'Speed',
    'blink.intervalo': 'Blink interval in milliseconds',

    'epoca.nombre': 'Epoch {epoca}',
    'epoca.mayus': 'EPOCH {epoca}',
    'epoca.divisor': 'Epoch A / Epoch B divider',
    'epoca.b_por_defecto': '+6 months',
    'visor.clic_destino': "Click the object's position in Epoch B",

    'reporte.titulo': 'New report',
    'reporte.banda': 'Band',
    'reporte.epoca': 'Epoch',
    'reporte.destino': 'Target',
    'reporte.quitar': 'Remove',
    'reporte.clic_en_a': 'Click the object in Epoch A to draw its A → B vector',
    'reporte.armado': 'Click the object in Epoch B…',
    'reporte.armar': '↗ Mark target in Epoch B',
    'reporte.comentario': 'Comment: brightness, direction of motion…',
    'reporte.enviando': 'Sending…',
    'reporte.enviar': 'Submit finding',
    'reporte.cancelar': 'Cancel',
    'reporte.ayuda.1': 'Compare both epochs and',
    'reporte.ayuda.clic': 'click',
    'reporte.ayuda.2':
      'any object that changes position (asteroid, comet or planet) to mark its coordinates. A second click in the other epoch draws its',
    'reporte.ayuda.vector': 'trajectory vector',
    'aviso.registrado': 'Finding #{id} recorded at ({x}, {y}){ruta}',

    'tipo.asteroide': 'Asteroid',
    'tipo.cometa': 'Comet',
    'tipo.planeta': 'Planet',

    'hallazgos.titulo': 'Findings',
    'hallazgos.recargar': 'Reload',
    'hallazgos.filtrar': 'Filter findings',
    'hallazgos.esta_region': 'This region',
    'hallazgos.todos': 'All',
    'hallazgos.solo': 'Only {region}',
    'hallazgos.region_activa': 'the active region',
    'hallazgos.todas_regiones': 'Findings from all regions',
    'hallazgos.error': 'The PHP backend returned an error. Try reloading.',
    'hallazgos.vacio_region': 'No reports in this region yet.',
    'hallazgos.vacio': 'No reports yet.',

    'estado.conectando': 'Connecting…',
    'estado.conectando.ayuda': 'Querying the PHP backend',
    'estado.error': 'Server error',
    'estado.error.ayuda': 'The PHP backend returned an error',
    'estado.local': 'Local demo mode',
    'estado.local.ayuda': 'No PHP backend: findings are stored in this browser (localStorage)',
    'estado.servidor': 'PHP server connected',
    'estado.servidor.ayuda': 'Findings are stored in the PHP backend',

    'exportar.boton': 'Export',
    'exportar.listo': 'Done',
    'exportar.error': 'Error',
    'exportar.titulo': 'Export all findings',
    'exportar.fallo': 'Export failed',

    'creditos.titulo': 'NASA Space Apps · SPHEREx — Sources and references:',
    'creditos.irsa': 'WISE/NEOWISE and SPHEREx archive',
    'creditos.spherex': 'NASA mission',
    'creditos.wiseview': 'Epoch blink · Backyard Worlds',
    'creditos.gaia': 'Reference astrometry · ESA',
    'creditos.neossat': 'Canadian Space Agency · data at CADC',
  },
}

// Textos que llegan en español desde regions.json o los datos de ejemplo (descripciones de banda, nombres, comentarios).
const DATOS_EN = new Map(Object.entries({
  'IR cercano corto · estrellas calientes': 'Short near-IR · hot stars',
  'Pico estelar · polvo tenue': 'Stellar peak · faint dust',
  'Polvo cálido · hielos': 'Warm dust · ices',
  'IR largo · nebulosas y PAH': 'Long IR · nebulae and PAH',
  'WISE W1 · estrellas y polvo cálido': 'WISE W1 · stars and warm dust',
  'WISE W2 · polvo caliente y objetos fríos': 'WISE W2 · hot dust and cool objects',
  'Óptico de banda ancha · sin filtro': 'Broadband optical · unfiltered',
  'NEOSSat · CCD óptico': 'NEOSSat · optical CCD',
  'Nebulosa de Orión': 'Orion Nebula',
  'Cúmulo de las Pléyades': 'Pleiades Cluster',
  'NEOSSat-NEO-01 (Asteroide cercano)': 'NEOSSat-NEO-01 (Near-Earth asteroid)',
  'Época A': 'Epoch A',
  'Época B': 'Epoch B',
  'Se desplaza al NE en 6 meses': 'Moves NE over 6 months',
  'Sigue visible a 3.8 µm: emisión térmica': 'Still visible at 3.8 µm: thermal emission',
  'Candidato en movimiento delante de la Nebulosa de Orión': 'Moving candidate in front of the Orion Nebula',
  'Candidato en movimiento junto a las Pléyades': 'Moving candidate next to the Pleiades',
  'NEO rápido: cruza ~20′ del campo en 30 min': 'Fast NEO: crosses ~20′ of the field in 30 min',
}))

const PATRONES_EN = [
  [/(\d+(?:[.,]\d+)?)\s*años\b/g, '$1 years'],
  [/(\d+(?:[.,]\d+)?)\s*meses\b/g, '$1 months'],
  [/\bBanda (\d+)/g, 'Band $1'],
]

const interpolar = (texto, vars) =>
  vars ? texto.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : texto

function idiomaInicial() {
  try {
    const guardado = localStorage.getItem(CLAVE_IDIOMA)
    if (IDIOMAS.includes(guardado)) return guardado
  } catch {
    // localStorage no disponible: se usa el idioma por defecto.
  }
  return 'es'
}

const IdiomaContext = createContext(null)

export function IdiomaProvider({ children }) {
  const [idioma, setIdioma] = useState(idiomaInicial)

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_IDIOMA, idioma)
    } catch {
      // Sin localStorage la preferencia dura solo esta sesión.
    }
    document.documentElement.lang = idioma
    document.title = TEXTOS[idioma]['app.documento']
  }, [idioma])

  const t = useCallback((clave, vars) => interpolar(TEXTOS[idioma][clave] ?? TEXTOS.es[clave] ?? clave, vars), [idioma])

  /** Traduce un texto de datos (regions.json, ejemplos) si hay equivalente; si no, lo devuelve tal cual. */
  const td = useCallback(
    (texto) => {
      if (idioma === 'es' || typeof texto !== 'string') return texto
      return DATOS_EN.get(texto) ?? PATRONES_EN.reduce((s, [re, rep]) => s.replace(re, rep), texto)
    },
    [idioma],
  )

  const valor = useMemo(() => ({ idioma, setIdioma, t, td }), [idioma, t, td])
  return <IdiomaContext.Provider value={valor}>{children}</IdiomaContext.Provider>
}

export function useIdioma() {
  const ctx = useContext(IdiomaContext)
  if (!ctx) throw new Error('useIdioma debe usarse dentro de <IdiomaProvider>')
  return ctx
}
