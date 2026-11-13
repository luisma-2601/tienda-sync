'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useTransition } from 'react'
import { useAvisarCarga } from '@/components/admin/Carga'
import { useAtenuarResultados } from '@/components/tienda/EnlacePagina'
import { sonar } from '@/lib/sonidos'

/** Espera tras la última tecla en la búsqueda antes de filtrar, para no recargar con cada letra. */
const PAUSA_MS = 350

/**
 * Formulario de filtros sin botón "Filtrar": al elegir una opción filtra al instante y al escribir,
 * tras una pausa breve. "Restablecer" vuelve a la lista sin filtros. Los campos se mantienen al día
 * con la URL (accesos rápidos, botón atrás), menos el que se está usando.
 */
export function FiltrosAuto({
  children,
  className,
  claseAcciones = '',
  predeterminados = {},
  transicion,
  sonido = false,
}: {
  children: React.ReactNode
  className?: string
  claseAcciones?: string
  /** Valor de cada campo cuando no hay filtro (ej. el orden por defecto); lo demás queda vacío. */
  predeterminados?: Record<string, string>
  /** Tipo de transición de vista al filtrar (el catálogo anima sus resultados con 'filtro'). */
  transicion?: string
  /** Toque de sonido al elegir una opción o restablecer (la tienda; el panel va en silencio). Escribir no suena. */
  sonido?: boolean
}) {
  const router = useRouter()
  const ruta = usePathname()
  const params = useSearchParams()
  const form = useRef<HTMLFormElement>(null)
  const porDefecto = useRef(predeterminados)
  porDefecto.current = predeterminados
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [cargando, iniciar] = useTransition()
  useAvisarCarga(cargando)
  useAtenuarResultados(cargando)

  const activos = [...params.entries()].some(([k, v]) => k !== 'pagina' && v && v !== predeterminados[k])

  function ir(destino: URLSearchParams) {
    clearTimeout(espera.current)
    const qs = destino.toString()
    iniciar(() => router.replace(qs ? `${ruta}?${qs}` : ruta, { scroll: false, ...(transicion && { transitionTypes: [transicion] }) }))
  }

  // Al cambiar un filtro se vuelve a la página 1; los campos vacíos o con su valor por defecto no van en la URL.
  function filtrar() {
    if (!form.current) return
    const destino = new URLSearchParams()
    for (const [k, v] of new FormData(form.current)) {
      const valor = String(v).trim()
      if (valor && valor !== predeterminados[k]) destino.set(k, valor)
    }
    ir(destino)
  }

  /** Pone cada campo con su valor en `origen` (o el de por defecto). Con `respetarFoco`, no toca lo que se está escribiendo. */
  function llenarCampos(origen: URLSearchParams, respetarFoco: boolean) {
    for (const el of form.current?.elements ?? []) {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement) || !el.name || el.type === 'hidden') continue
      if (respetarFoco && el === document.activeElement && el instanceof HTMLInputElement) continue
      el.value = origen.get(el.name) ?? porDefecto.current[el.name] ?? ''
      if (el instanceof HTMLSelectElement && el.selectedIndex === -1) el.selectedIndex = 0
    }
  }
  const limpiarCampos = () => llenarCampos(new URLSearchParams(), false)

  useEffect(() => {
    llenarCampos(params, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia la URL
  }, [params])

  useEffect(() => () => clearTimeout(espera.current), [])

  return (
    <form
      ref={form}
      role="search"
      className={className}
      onSubmit={(e) => { e.preventDefault(); filtrar() }}
      // En React, onChange de un campo de texto llega con cada tecla: ahí se espera la pausa; una lista filtra al momento.
      onChange={(e) => {
        if (e.target instanceof HTMLSelectElement) {
          if (sonido) sonar('filtro')
          return filtrar()
        }
        clearTimeout(espera.current)
        espera.current = setTimeout(filtrar, PAUSA_MS)
      }}
    >
      {children}
      <div className={`flex items-center gap-3 ${claseAcciones}`}>
        <button type="button" className="boton-sec" disabled={!activos} onClick={() => { if (sonido) sonar('filtro'); limpiarCampos(); ir(new URLSearchParams()) }}>
          Restablecer
        </button>
        <span aria-live="polite" className={`inline-flex items-center gap-2 text-sm text-humo transition-opacity duration-200 ${cargando ? 'opacity-100' : 'opacity-0'}`}>
          <svg className="h-4 w-4 animate-spin text-dorado" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          {cargando ? 'Filtrando…' : ''}
        </span>
      </div>
    </form>
  )
}
