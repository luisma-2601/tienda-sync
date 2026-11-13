import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache, ViewTransition } from 'react'
import { supabaseServidor } from '@/lib/supabase/server'
import { BotonAgregar, EtiquetaDisponibilidad, Precio } from '@/components/tienda/Piezas'
import { GENEROS, MOMENTOS, TEMPORADAS, type DecantPublico, type ProductoPublico } from '@/lib/tipos'
import { formatoUsd } from '@/lib/precios'

const cargar = cache(async (slug: string) => {
  const supabase = await supabaseServidor()
  const { data: p } = await supabase.from('catalogo_publico').select('*').eq('slug', slug).maybeSingle()
  if (!p) return null
  const { data: decants } = await supabase.from('decants_publicos').select('*').eq('producto_id', p.id).order('ml')
  return { p: p as ProductoPublico, decants: (decants ?? []) as DecantPublico[] }
})

// Vista previa al compartir el link en WhatsApp o TikTok.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const datos = await cargar((await params).slug)
  if (!datos) return { title: 'Perfume no encontrado' }
  const { p } = datos
  const titulo = [p.marca, p.nombre].filter(Boolean).join(' ')
  return {
    title: titulo,
    description: p.descripcion ?? `${titulo}${p.presentacion_ml ? `, ${p.presentacion_ml} ml` : ''}. Desde ${formatoUsd(Number(p.precio_usd))}.`,
    openGraph: { title: titulo, images: p.fotos[0] ? [{ url: p.fotos[0] }] : [] },
  }
}

export default async function FichaProducto({ params }: { params: Promise<{ slug: string }> }) {
  const datos = await cargar((await params).slug)
  if (!datos) notFound()
  const { p, decants } = datos
  const detalle = [p.marca, p.presentacion_ml ? `${Number(p.presentacion_ml)} ml` : null].filter(Boolean).join(' · ')
  const hayPiramide = CAPAS.some(({ campo }) => (p[campo] ?? []).length > 0)
  const temporadas = (p.temporadas ?? []).map((t) => TEMPORADAS[t as keyof typeof TEMPORADAS]).filter(Boolean)

  return (
    <article className="grid gap-10 py-8 md:grid-cols-2 md:py-14">
      <div className="space-y-3">
        {/* Misma foto que la tarjeta del catálogo: viaja entre ambas páginas. */}
        <ViewTransition name={`foto-${p.id}`} share="morph" default="none">
          <div className="aspect-[4/5] overflow-hidden rounded-3xl bg-foto">
            {p.fotos[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.fotos[0]} alt={p.nombre} className="h-full w-full object-contain p-8" />
            ) : (
              <div className="flex h-full items-center justify-center font-display text-9xl italic text-dorado/40">&amp;</div>
            )}
          </div>
        </ViewTransition>
        {p.fotos.length > 1 && (
          <div className="grid grid-cols-4 gap-3">
            {p.fotos.slice(1, 5).map((f) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={f} src={f} alt="" className="aspect-square animate-entrada rounded-xl bg-foto object-contain p-2 [animation-delay:250ms]" />
            ))}
          </div>
        )}
      </div>

      <div className="animate-entrada md:pt-6 [animation-delay:120ms]">
        <Link href="/" className="text-sm text-humo underline-offset-4 hover:underline">
          Volver al catálogo
        </Link>
        <p className="mt-6 text-humo">{p.marca}</p>
        <h1 className="mt-1 text-5xl sm:text-6xl">{p.nombre}</h1>

        <div className="mt-6 flex items-baseline gap-4">
          <Precio usd={Number(p.precio_usd)} bs={p.precio_bs === null ? null : Number(p.precio_bs)} className="text-3xl font-semibold text-dorado" claseBs="text-base" />
          {p.presentacion_ml && <span className="text-humo">{Number(p.presentacion_ml)} ml</span>}
        </div>
        <div className="mt-1 h-5"><EtiquetaDisponibilidad d={p.disponibilidad} /></div>

        <div className="mt-6 max-w-sm">
          <BotonAgregar
            deshabilitado={p.disponibilidad === 'agotado'}
            item={{ tipo: 'producto', id: p.id, nombre: p.nombre, detalle, slug: p.slug, foto: p.fotos[0] ?? null, precio_usd: Number(p.precio_usd), maximo: p.maximo ?? 50 }}
          />
        </div>

        {decants.length > 0 && (
          <section className="mt-10">
            <h2 className="text-3xl">¿Quieres probarlo primero?</h2>
            <p className="mt-1 text-sm text-humo">Decants: el mismo perfume en frasco pequeño.</p>
            <ul className="mt-4 divide-y divide-linea rounded-2xl border border-linea bg-vidrio">
              {decants.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div>
                    <p className="font-medium">{Number(d.ml)} ml</p>
                    <Precio usd={Number(d.precio_usd)} bs={d.precio_bs === null ? null : Number(d.precio_bs)} className="text-sm text-dorado" />
                  </div>
                  <div className="w-36">
                    <BotonAgregar
                      texto="Agregar"
                      deshabilitado={!d.disponible}
                      item={{ tipo: 'decant', id: d.id, nombre: `Decant ${p.nombre}`, detalle: `${p.marca ?? ''} · ${Number(d.ml)} ml`, slug: p.slug, foto: p.fotos[0] ?? null, precio_usd: Number(d.precio_usd), maximo: 50 }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(p.descripcion || p.notas.length > 0 || p.genero || p.ocasion.length > 0 || p.momento || hayPiramide) && (
          <section className="mt-10 space-y-8 border-t border-linea pt-8">
            {p.descripcion && <p className="max-w-prose text-lg leading-relaxed">{p.descripcion}</p>}

            {/* Cuándo usarlo: momento, temporadas y ocasiones como píldoras. */}
            {(p.momento || temporadas.length > 0 || p.ocasion.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {p.momento && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-tinta px-3.5 py-1.5 text-sm font-medium text-vidrio">
                    <IconoMomento m={p.momento} />
                    {MOMENTOS[p.momento]}
                  </span>
                )}
                {temporadas.map((t) => <span key={t} className="rounded-full border border-linea bg-vidrio px-3.5 py-1.5 text-sm">{t}</span>)}
                {p.ocasion.map((o) => <span key={o} className="rounded-full border border-dorado/40 bg-dorado-claro px-3.5 py-1.5 text-sm text-tinta">{o}</span>)}
              </div>
            )}

            {hayPiramide ? (
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-3xl">Cómo huele</h2>
                  {p.familia_olfativa && <p className="text-sm text-humo">{p.familia_olfativa}</p>}
                </div>
                {/* Pirámide olfativa: de lo primero que se siente a lo que queda en la piel. */}
                <ol className="mt-4 space-y-3 border-l-2 border-dorado/50 pl-5">
                  {CAPAS.map(({ campo, titulo, cuando }) => {
                    const notas = p[campo] ?? []
                    if (!notas.length) return null
                    return (
                      <li key={campo} className="relative">
                        <span aria-hidden className="absolute top-1.5 -left-[27px] h-3 w-3 rounded-full border-2 border-dorado bg-niebla" />
                        <p className="text-sm font-medium">{titulo} <span className="font-normal text-humo">· {cuando}</span></p>
                        <p className="mt-0.5 text-humo">{notas.join(' · ')}</p>
                      </li>
                    )
                  })}
                </ol>
              </div>
            ) : (
              p.notas.length > 0 && <p className="text-sm"><span className="text-humo">Notas:</span> {p.notas.join(', ')}</p>
            )}

            {p.genero && <p className="text-sm"><span className="text-humo">Para:</span> {GENEROS[p.genero]}</p>}
          </section>
        )}
      </div>
    </article>
  )
}

const CAPAS = [
  { campo: 'notas_salida', titulo: 'Salida', cuando: 'lo primero que sientes' },
  { campo: 'notas_corazon', titulo: 'Corazón', cuando: 'después de unos minutos' },
  { campo: 'notas_fondo', titulo: 'Fondo', cuando: 'lo que queda en la piel' },
] as const

function IconoMomento({ m }: { m: NonNullable<ProductoPublico['momento']> }) {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {m !== 'noche' && <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>}
      {m === 'noche' && <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />}
    </svg>
  )
}
