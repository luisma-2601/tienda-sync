'use client'

import { useFormStatus } from 'react-dom'

/** Botón de envío que muestra un indicador mientras el formulario se guarda. */
export function BotonEnviar({
  children,
  pendiente = 'Guardando…',
  className = 'boton',
}: {
  children: React.ReactNode
  pendiente?: string
  className?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button className={`${className} ${pending ? 'cursor-wait' : ''}`} disabled={pending} aria-busy={pending}>
      {pending ? (
        <span className="inline-flex animate-cambio items-center gap-2">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          {pendiente}
        </span>
      ) : (
        children
      )}
    </button>
  )
}
