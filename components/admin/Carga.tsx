'use client'

import Link, { useLinkStatus } from 'next/link'
import { useEffect, useSyncExternalStore } from 'react'

// Enlaces del panel que están cargando su página: la barra de arriba se ve mientras haya alguno.
let cargando = 0
const avisos = new Set<() => void>()
const avisar = () => avisos.forEach((f) => f())
const suscribir = (f: () => void) => { avisos.add(f); return () => { avisos.delete(f) } }

/**
 * Va dentro de un <Link> con `relative`: mientras se abre la página, un brillo dorado lo recorre
 * y se enciende la barra de carga del panel. Siempre montado, solo cambia la opacidad (sin saltos de diseño).
 */
export function BrilloCarga() {
  const { pending } = useLinkStatus()
  useAvisarCarga(pending)
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] transition-opacity duration-200 ${pending ? 'opacity-100' : 'opacity-0'}`}
    >
      {pending && <span className="brillo-pestana absolute inset-y-0 -left-1/2 w-1/2" />}
    </span>
  )
}

/** Enciende la barra de carga del panel mientras `pendiente` sea true (fuera del panel no hace nada visible). */
export function useAvisarCarga(pendiente: boolean) {
  useEffect(() => {
    if (!pendiente) return
    cargando++
    avisar()
    return () => { cargando--; avisar() }
  }, [pendiente])
}

/** <Link> del panel con indicador de carga. Para usarlo desde páginas de servidor igual que un Link. */
export function EnlacePanel({ className = '', children, ...props }: React.ComponentProps<typeof Link>) {
  return (
    <Link {...props} className={`relative ${className}`}>
      {children}
      <BrilloCarga />
    </Link>
  )
}

/** Barra dorada en el borde superior mientras carga una página del panel. Aparece con un breve retraso para no parpadear. */
export function BarraCarga() {
  const activa = useSyncExternalStore(suscribir, () => cargando > 0, () => false)
  return (
    <div
      role="progressbar"
      aria-label="Cargando página"
      aria-hidden={!activa}
      className={`pointer-events-none fixed inset-x-0 top-0 z-40 h-[3px] overflow-hidden transition-opacity duration-300 ${activa ? 'opacity-100 delay-150' : 'opacity-0'}`}
    >
      {activa && <div className="barra-carga h-full w-1/3 rounded-full bg-dorado" />}
    </div>
  )
}
