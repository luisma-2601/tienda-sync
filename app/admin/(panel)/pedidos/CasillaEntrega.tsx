'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { marcarEntregado } from './acciones'

/**
 * Casilla "Entregado" del checklist opcional. Cambia al instante (estado optimista) y,
 * si el guardado falla, vuelve sola a como estaba y lo dice en pequeño.
 * `cuando` llega ya formateado desde el servidor: si se formateara aquí, Node y el navegador
 * escriben distinto "p. m." (espacio especial vs. normal) y React avisa que el HTML no coincide.
 */
export function CasillaEntrega({ id, entregadoEn, cuando }: { id: string; entregadoEn: string | null; cuando?: string }) {
  const [marcada, setMarcada] = useOptimistic(entregadoEn !== null)
  const [, iniciar] = useTransition()
  const [fallo, setFallo] = useState(false)

  function cambiar(valor: boolean) {
    setFallo(false)
    iniciar(async () => {
      setMarcada(valor)
      try {
        const r = await marcarEntregado(id, valor)
        if (!r.ok) setFallo(true)
      } catch {
        setFallo(true)
      }
    })
  }

  return (
    <div>
      <label
        className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-humo"
        title={cuando && marcada ? `Entregado el ${cuando}` : undefined}
      >
        <input type="checkbox" checked={marcada} onChange={(e) => cambiar(e.target.checked)} className="peer sr-only" />
        <span
          aria-hidden
          className={`flex h-5 w-5 items-center justify-center rounded-md border transition-[background-color,border-color,scale] duration-300 ease-elegante peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-dorado peer-active:scale-90 ${marcada ? 'border-tinta bg-tinta text-vidrio' : 'border-linea bg-vidrio'}`}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              strokeDasharray="24"
              className="transition-[stroke-dashoffset] duration-300 ease-elegante"
              style={{ strokeDashoffset: marcada ? 0 : 24 }}
            />
          </svg>
        </span>
        <span className={marcada ? 'text-tinta' : ''}>Entregado</span>
      </label>
      {fallo && <p role="alert" className="mt-1 text-xs text-alerta">No se guardó. Intenta de nuevo.</p>}
    </div>
  )
}
