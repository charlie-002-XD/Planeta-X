// Barra inferior con los créditos institucionales y las referencias oficiales del reto.
const CREDITOS = [
  { etiqueta: 'NASA/IPAC IRSA', url: 'https://irsa.ipac.caltech.edu/', detalle: 'Archivo de WISE/NEOWISE y SPHEREx' },
  { etiqueta: 'SPHEREx', url: 'https://science.nasa.gov/mission/spherex/', detalle: 'Misión de la NASA' },
  { etiqueta: 'WiseView', url: 'http://byw.tools/wiseview', detalle: 'Blink de épocas · Backyard Worlds' },
  { etiqueta: 'Gaia DR3', url: 'https://www.cosmos.esa.int/web/gaia/dr3', detalle: 'Astrometría de referencia · ESA' },
  { etiqueta: 'CSA NEOSSat', url: 'https://www.asc-csa.gc.ca/eng/satellites/neossat/', detalle: 'Agencia Espacial Canadiense · datos en CADC' },
]

export default function Creditos() {
  return (
    <footer className="mx-auto max-w-[1500px] px-4 pb-6 sm:px-6">
      <div className="flex flex-col gap-2 border-t border-white/5 pt-3 font-mono text-[11px] text-slate-500 md:flex-row md:items-center md:justify-between">
        <p>NASA Space Apps · SPHEREx — Fuentes y referencias:</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {CREDITOS.map((c) => (
            <li key={c.etiqueta}>
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                title={c.detalle}
                className="text-slate-400 underline-offset-2 transition-colors hover:text-cyan-200 hover:underline"
              >
                {c.etiqueta}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  )
}
