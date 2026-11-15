import { motion } from 'framer-motion'
import { IDIOMAS, useIdioma } from '../i18n.jsx'

// Selector ES | EN junto al selector de región; la preferencia se guarda en localStorage (ver i18n.jsx).
export default function LanguageToggle() {
  const { idioma, setIdioma, t } = useIdioma()
  return (
    <div
      role="group"
      aria-label={t('idioma.etiqueta')}
      className="relative flex items-center rounded-lg border border-white/10 bg-space-900/80 p-0.5 font-mono text-xs"
    >
      {IDIOMAS.map((id, i) => (
        <span key={id} className="flex items-center">
          {i > 0 && <span className="px-0.5 text-slate-600" aria-hidden="true">|</span>}
          <button
            type="button"
            onClick={() => setIdioma(id)}
            aria-pressed={idioma === id}
            lang={id}
            title={t('idioma.cambiar', { idioma: id === 'es' ? 'Español' : 'English' })}
            className="relative rounded-md px-2 py-0.5 uppercase outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            {idioma === id && (
              <motion.span
                layoutId="idioma-activo"
                className="absolute inset-0 rounded-md bg-cyan-400/20 ring-1 ring-cyan-300/50"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className={`relative ${idioma === id ? 'text-cyan-100' : 'text-slate-400 hover:text-slate-200'}`}>{id}</span>
          </button>
        </span>
      ))}
    </div>
  )
}
