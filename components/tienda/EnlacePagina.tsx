'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLayoutEffect, useTransition } from 'react'
import { sonar } from '@/lib/sonidos'

/** Inicio de los resultados del catálogo: hasta aquí se sube al cambiar de página o filtro. */
export const ANCLA_CATALOGO = 'catalogo'

/** Espera a que termine el desplazamiento suave (o un máximo, por si el navegador no avisa). */
function esperarFinScroll(maximo = 900) {
  return new Promise<void>((listo) => {
    const fin = () => { clearTimeout(reloj); window.removeEventListener('scrollend', fin); listo() }
    const reloj = setTimeout(fin, maximo)
    window.addEventListener('scrollend', fin, { once: true })
  })
}

/**
 * Si el inicio de los resultados quedó por encima de lo que se ve, sube suave hasta él (nunca de golpe ni
 * hacia abajo: al usar un filtro de arriba, los resultados ya están a la vista y no hay que moverse).
 */
export async function subirAResultados() {
  const ancla = document.getElementById(ANCLA_CATALOGO)
  if (!ancla) return
  const margen = Number.parseFloat(getComputedStyle(ancla).scrollMarginTop) || 0
  const arriba = () => ancla.getBoundingClientRect().top < margen - 4
  if (!arriba()) return
  const suave = !matchMedia('(prefers-reduced-motion: reduce)').matches
  ancla.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' })
  if (suave) await esperarFinScroll()
  // Si el desplazamiento suave se cortó (otro gesto, pestaña en segundo plano), se completa al instante.
  if (arriba()) ancla.scrollIntoView({ block: 'start' })
}

/**
 * Mientras `cargando`, atenúa los resultados del catálogo. Se quita al terminar y también si quien lo pidió
 * desaparece (en la primera o la última página el botón ya no está), antes de pintar. Sin catálogo no hace nada.
 */
export function useAtenuarResultados(cargando: boolean) {
  useLayoutEffect(() => {
    if (!cargando) return
    const resultados = document.getElementById(ANCLA_CATALOGO)
    resultados?.setAttribute('data-cargando', '')
    return () => resultados?.removeAttribute('data-cargando')
  }, [cargando])
}

/** Enlace del catálogo que cambia los resultados con transición en vez de saltar al inicio de la página. */
function useIrAResultados(href: string, tipo: string) {
  const router = useRouter()
  const [cargando, iniciar] = useTransition()
  useAtenuarResultados(cargando)

  async function ir(e: React.MouseEvent<HTMLAnchorElement>) {
    // Ctrl/Cmd + clic o clic central: abrir en otra pestaña como cualquier enlace.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    sonar('filtro')
    await subirAResultados()
    iniciar(() => router.push(href, { scroll: false, transitionTypes: [tipo] }))
  }
  return { cargando, ir }
}

/** "Anterior" / "Siguiente": la cuadrícula sale hacia un lado y la nueva entra por el otro (globals.css). */
export function EnlacePagina({ href, direccion, children }: { href: string; direccion: 'adelante' | 'atras'; children: React.ReactNode }) {
  const { cargando, ir } = useIrAResultados(href, `pagina-${direccion}`)
  return (
    <Link href={href} scroll={false} onClick={ir} aria-busy={cargando} className={`boton-sec ${cargando ? 'cursor-wait' : ''}`}>
      {cargando ? (
        <span className="inline-flex animate-cambio items-center gap-2">
          <svg className="h-4 w-4 animate-spin text-dorado" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Cargando…
        </span>
      ) : (
        children
      )}
    </Link>
  )
}

/** Píldora de filtro (género, ocasión): cambia los resultados con la transición de filtro, sin saltar arriba. */
export function EnlaceFiltro({ href, activo, children }: { href: string; activo: boolean; children: React.ReactNode }) {
  const { cargando, ir } = useIrAResultados(href, 'filtro')
  return (
    <Link
      href={href}
      scroll={false}
      onClick={ir}
      aria-current={activo ? 'true' : undefined}
      aria-busy={cargando}
      className={`opcion shrink-0 rounded-full border px-3.5 py-1.5 text-sm ${activo ? 'border-tinta bg-tinta text-vidrio' : 'border-linea bg-vidrio text-tinta hover:border-tinta/40'} ${cargando ? 'cursor-wait' : ''}`}
    >
      {children}
    </Link>
  )
}
