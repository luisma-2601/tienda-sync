'use client'

import Link, { useLinkStatus } from 'next/link'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { tope, useTienda } from './TiendaContexto'
import { formatoBs, formatoUsd, textoDisponibilidad, type Disponibilidad } from '@/lib/precios'
import { cambiarSonidos, sonar, sonidosActivos, suscribirSonidos } from '@/lib/sonidos'

/** Enlace de una tarjeta del catálogo a la ficha del producto: suena al abrirla. */
export function EnlaceProducto(props: React.ComponentProps<typeof Link>) {
  return <Link {...props} onClick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) sonar('abrir') }} />
}

/** Enciende o apaga los sonidos de la tienda. Antes de cargar la preferencia se muestra encendido. */
export function BotonSonido() {
  const activos = useSyncExternalStore(suscribirSonidos, sonidosActivos, () => true)
  return (
    <button
      type="button"
      onClick={() => { cambiarSonidos(!activos); if (!activos) sonar('opcion') }}
      aria-pressed={activos}
      aria-label={activos ? 'Silenciar los sonidos' : 'Activar los sonidos'}
      title={activos ? 'Silenciar los sonidos' : 'Activar los sonidos'}
      className="boton-sec h-10 w-10 px-0"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H3v6h3l5 4V5z" />
        {activos ? <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /> : <path d="m16 9 6 6M22 9l-6 6" />}
      </svg>
    </button>
  )
}

/**
 * Va dentro del <Link> de una tarjeta del catálogo: mientras se abre la ficha del producto, cubre la foto
 * con un velo y un aro dorado que gira. Siempre montado, solo cambia la opacidad (sin saltos de diseño).
 */
export function IndicadorAbriendo() {
  const { pending } = useLinkStatus()
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-vidrio/60 backdrop-blur-[2px] transition-opacity duration-300 ease-elegante ${pending ? 'opacity-100 delay-100' : 'opacity-0'}`}
    >
      {pending && (
        <>
          <svg className="h-10 w-10 animate-spin text-dorado" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="animate-entrada rounded-full bg-vidrio px-3 py-1 text-xs font-medium text-tinta">Abriendo…</span>
        </>
      )}
    </span>
  )
}

/** En el carrito, el cliente elige cómo pagará: define el total y el mensaje que recibe el dueño. */
export function SelectorMoneda() {
  const { moneda, setMoneda, listo } = useTienda()
  const opciones = [
    { valor: 'divisas' as const, largo: 'Divisas' },
    { valor: 'bolivares' as const, largo: 'Bolívares' },
  ]
  return (
    <div role="radiogroup" aria-label="¿Cómo vas a pagar?" className="relative inline-grid grid-cols-2 rounded-full border border-tinta/20 bg-vidrio p-1">
      {/* Píldora que se desliza hacia la opción elegida. Sin animar mientras carga la moneda guardada. */}
      <span
        aria-hidden
        className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-tinta shadow-sm ${listo ? 'transition-transform duration-500 ease-elegante' : ''} ${moneda === 'bolivares' ? 'translate-x-full' : ''}`}
      />
      {opciones.map((o) => {
        const activo = moneda === o.valor
        return (
          <button
            key={o.valor}
            role="radio"
            aria-checked={activo}
            onClick={() => { if (!activo) sonar('opcion'); setMoneda(o.valor) }}
            className={`relative rounded-full px-3 py-1.5 text-sm font-semibold transition-[color,scale] duration-300 ease-elegante active:scale-95 ${activo ? 'text-vidrio' : 'text-humo hover:text-tinta'}`}
          >
            {o.largo}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Precio en dólares grande y, debajo y pequeño, lo que cuesta pagando en bolívares
 * (tasa BCV y recargo ya incluidos por la base de datos). Sin tasa, solo el precio en dólares.
 */
export function Precio({ usd, bs, className = '', claseBs = 'text-xs' }: { usd: number; bs: number | null; className?: string; claseBs?: string }) {
  return (
    <span className="inline-flex flex-col">
      <span className={`tabular-nums ${className}`}>{formatoUsd(usd)}</span>
      {bs !== null && <span className={`tabular-nums text-humo ${claseBs}`}>{formatoBs(bs)}</span>}
    </span>
  )
}

export function EtiquetaDisponibilidad({ d }: { d: Disponibilidad }) {
  if (d === 'disponible') return null
  return (
    <span className={`text-xs font-semibold ${d === 'agotado' ? 'text-humo' : 'text-dorado'}`}>{textoDisponibilidad[d]}</span>
  )
}

export function BotonCarrito() {
  const { unidades, listo } = useTienda()
  // Cuenta las veces que se agregó algo (no la carga inicial) para disparar la animación.
  const previo = useRef<number | null>(null)
  const [pulso, setPulso] = useState(0)
  useEffect(() => {
    if (!listo) return
    if (previo.current !== null && unidades > previo.current) setPulso((n) => n + 1)
    previo.current = unidades
  }, [unidades, listo])

  return (
    <Link href="/carrito" data-destino-carrito className="boton-sec relative px-3 sm:px-4" aria-label={`Carrito, ${unidades} productos`}>
      {/* En el teléfono va el ícono: con los botones de sonido, tema y cuenta, la palabra no cabe. */}
      <svg className="h-5 w-5 sm:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 7h12l1 13H5L6 7z" />
        <path d="M9 7a3 3 0 0 1 6 0" />
      </svg>
      <span className="hidden sm:inline">Carrito</span>
      {listo && unidades > 0 && (
        <span key={pulso} className={`inline-block sm:ml-1 rounded-full bg-dorado px-2 py-0.5 text-xs font-semibold text-vidrio tabular-nums ${pulso ? 'animate-pop' : ''}`}>
          {unidades}
        </span>
      )}
      {pulso > 0 && <span key={`onda-${pulso}`} aria-hidden className="pointer-events-none absolute inset-0 animate-onda rounded-full" />}
    </Link>
  )
}

interface Agregable {
  tipo: 'producto' | 'decant'
  id: string
  nombre: string
  detalle: string
  slug: string
  foto: string | null
  precio_usd: number
  /** Unidades en inventario que se pueden pedir. */
  maximo: number
}

/**
 * Miniatura del producto que vuela en arco desde `origen` hasta el botón del carrito.
 * Llama a `alLlegar` al aterrizar (o de inmediato si no hay animación), para que el contador
 * del carrito salte justo cuando llega.
 */
function volarAlCarrito(origen: HTMLElement, foto: string | null, alLlegar: () => void) {
  const destino = document.querySelector<HTMLElement>('[data-destino-carrito]')
  const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!destino || sinMovimiento || typeof Element.prototype.animate !== 'function') return alLlegar()

  const a = origen.getBoundingClientRect()
  const b = destino.getBoundingClientRect()
  const tam = 72
  const dx = b.left + b.width / 2 - (a.left + a.width / 2)
  const dy = b.top + b.height / 2 - (a.top + a.height / 2)
  const arriba = a.top + a.height / 2 - tam / 2
  // Punto más alto del arco: un poco por encima del carrito (o del origen), sin salirse de la pantalla.
  const cima = Math.max(Math.min(0, dy) - 70, 8 - arriba)

  // Tres capas, cada una con su movimiento: avance horizontal, subida y caída, y tamaño.
  const capa = (el: HTMLElement) => {
    el.setAttribute('aria-hidden', 'true')
    return el
  }
  const horizontal = capa(document.createElement('div'))
  Object.assign(horizontal.style, {
    position: 'fixed',
    left: `${a.left + a.width / 2 - tam / 2}px`,
    top: `${arriba}px`,
    width: `${tam}px`,
    height: `${tam}px`,
    zIndex: '60',
    pointerEvents: 'none',
  })
  const vertical = capa(document.createElement('div'))
  Object.assign(vertical.style, { width: '100%', height: '100%' })
  const miniatura = capa(document.createElement(foto ? 'img' : 'div'))
  if (foto) (miniatura as HTMLImageElement).src = foto
  Object.assign(miniatura.style, {
    width: '100%',
    height: '100%',
    borderRadius: '9999px',
    objectFit: 'contain',
    padding: '6px',
    background: foto ? 'var(--color-foto)' : 'var(--color-dorado)',
    border: '1px solid var(--color-dorado)',
    boxShadow: '0 12px 28px -10px rgb(0 0 0 / 0.45)',
  })
  vertical.append(miniatura)
  horizontal.append(vertical)
  document.body.append(horizontal)

  const duracion = 900
  const opciones = { duration: duracion, fill: 'forwards' as const }
  horizontal.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${dx}px)` }], { ...opciones, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' })
  // Sube frenando hasta la cima y cae acelerando hacia el carrito.
  vertical.animate(
    [
      { transform: 'translateY(0)', easing: 'cubic-bezier(0.33, 1, 0.68, 1)' },
      { transform: `translateY(${cima}px)`, offset: 0.55, easing: 'cubic-bezier(0.55, 0, 1, 0.45)' },
      { transform: `translateY(${dy}px)` },
    ],
    opciones,
  )
  const vuelo = miniatura.animate(
    [
      { transform: 'scale(0.5)', opacity: 0, easing: 'ease-out' },
      { transform: 'scale(1)', opacity: 1, offset: 0.15 },
      { transform: 'scale(0.85)', opacity: 1, offset: 0.6, easing: 'ease-in' },
      { transform: 'scale(0.3)', opacity: 0.9 },
    ],
    opciones,
  )
  let hecho = false
  const terminar = () => {
    if (hecho) return
    hecho = true
    horizontal.remove()
    alLlegar()
  }
  vuelo.finished.then(terminar, terminar)
}

export function BotonAgregar({ item, deshabilitado, texto = 'Agregar al carrito' }: { item: Agregable; deshabilitado?: boolean; texto?: string }) {
  const { agregar, items } = useTienda()
  const [hecho, setHecho] = useState(false)
  // Si el carrito ya tiene todas las unidades que hay en inventario, no se puede sumar otra.
  const enCarrito = items.find((i) => i.tipo === item.tipo && i.id === item.id)?.cantidad ?? 0
  const lleno = !deshabilitado && enCarrito >= tope(item)
  return (
    <button
      className={`boton w-full ${hecho ? 'bg-dorado' : ''}`}
      disabled={deshabilitado || (lleno && !hecho)}
      onClick={(e) => {
        if (lleno) return
        sonar('agregar')
        volarAlCarrito(e.currentTarget, item.foto, () => agregar(item))
        setHecho(true)
        setTimeout(() => setHecho(false), 1600)
      }}
    >
      {deshabilitado ? 'Agotado' : hecho ? (
        <span className="inline-flex animate-cambio items-center gap-2">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray="24" className="animate-trazo" />
          </svg>
          {texto === 'Agregar' ? 'Agregado' : 'Agregado al carrito'}
        </span>
      ) : lleno ? (
        texto === 'Agregar' ? 'En tu carrito' : `Tienes ${enCarrito === 1 ? 'la única unidad' : `las ${enCarrito} unidades`} en tu carrito`
      ) : texto}
    </button>
  )
}
