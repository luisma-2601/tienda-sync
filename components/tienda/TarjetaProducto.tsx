import { ViewTransition } from 'react'
import type { ProductoPublico } from '@/lib/tipos'
import { EnlaceProducto, EtiquetaDisponibilidad, IndicadorAbriendo, Precio } from './Piezas'

/** `indice` escalona la entrada de las tarjetas en la cuadrícula. */
export function TarjetaProducto({ p, indice = 0 }: { p: ProductoPublico; indice?: number }) {
  const agotado = p.disponibilidad === 'agotado'
  return (
    <EnlaceProducto href={`/p/${p.slug}`} className="group block animate-entrada" style={{ animationDelay: `${Math.min(indice, 11) * 50}ms` }}>
      {/* La foto viaja hasta la ficha del producto (mismo nombre en app/(tienda)/p/[slug]/page.tsx). */}
      <ViewTransition name={`foto-${p.id}`} share="morph" default="none">
        <div className={`relative aspect-[4/5] overflow-hidden rounded-2xl bg-foto ring-1 ring-transparent transition-[box-shadow,translate] duration-500 ease-elegante group-hover:-translate-y-1 group-hover:shadow-[0_18px_36px_-18px_rgb(0_0_0/0.35)] group-hover:ring-dorado/60 group-active:translate-y-0 ${agotado ? 'opacity-60' : ''}`}>
          {p.fotos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.fotos[0]} alt={p.nombre} loading="lazy" className="h-full w-full object-contain p-4 transition-transform duration-700 ease-elegante group-hover:scale-[1.04]" />
          ) : (
            <div className="flex h-full items-center justify-center font-display text-6xl italic text-dorado/40">&amp;</div>
          )}
          <IndicadorAbriendo />
        </div>
      </ViewTransition>
      <div className="mt-3 space-y-0.5">
        <p className="text-sm text-humo">{p.marca}</p>
        <h3 className="text-xl leading-snug sm:text-2xl">{p.nombre}</h3>
        <div className="flex items-baseline justify-between gap-2 pt-1">
          <Precio usd={Number(p.precio_usd)} bs={p.precio_bs === null ? null : Number(p.precio_bs)} className="font-semibold text-dorado" />
          {p.presentacion_ml && <span className="text-sm text-humo">{Number(p.presentacion_ml)} ml</span>}
        </div>
        <EtiquetaDisponibilidad d={p.disponibilidad} />
      </div>
    </EnlaceProducto>
  )
}
