import { ViewTransition } from 'react'
import { supabaseServidor } from '@/lib/supabase/server'
import { TarjetaProducto } from '@/components/tienda/TarjetaProducto'
import { FiltrosAuto } from '@/components/FiltrosAuto'
import { ANCLA_CATALOGO, EnlaceFiltro, EnlacePagina } from '@/components/tienda/EnlacePagina'
import { GENEROS, MOMENTOS, OCASIONES, type ProductoPublico } from '@/lib/tipos'
import { marca } from '@/marca.config'

const POR_PAGINA = 24

type Busqueda = { q?: string; genero?: string; momento?: string; ocasion?: string; marca?: string; orden?: string; pagina?: string }

// Filtro de momento: "Día" incluye los de día y noche, igual que "Noche".
const FILTRO_MOMENTO = { dia: MOMENTOS.dia, noche: MOMENTOS.noche } as const

export default async function Catalogo({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const sp = await searchParams
  const pagina = Math.max(1, Number(sp.pagina) || 1)
  const supabase = await supabaseServidor()

  let consulta = supabase.from('catalogo_publico').select('*', { count: 'exact' })
  if (sp.q) {
    const q = sp.q.replace(/[%,()]/g, ' ').trim()
    consulta = consulta.or(`nombre.ilike.%${q}%,marca.ilike.%${q}%`)
  }
  if (sp.genero && sp.genero in GENEROS) consulta = consulta.eq('genero', sp.genero)
  if (sp.momento && sp.momento in FILTRO_MOMENTO) consulta = consulta.in('momento', [sp.momento, 'ambos'])
  if (sp.ocasion) consulta = consulta.contains('ocasion', [sp.ocasion])
  if (sp.marca) consulta = consulta.eq('marca', sp.marca)
  consulta =
    sp.orden === 'precio-asc'
      ? consulta.order('precio_usd', { ascending: true })
      : sp.orden === 'precio-desc'
        ? consulta.order('precio_usd', { ascending: false })
        : consulta.order('marca').order('nombre')
  // Productos y marcas en paralelo: un viaje a Supabase en vez de dos seguidos.
  const [{ data, count, error }, { data: marcasFilas }] = await Promise.all([
    consulta.range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1),
    supabase.from('catalogo_publico').select('marca').not('marca', 'is', null).order('marca'),
  ])
  if (error) console.error('[catálogo] Error de Supabase:', JSON.stringify({ message: error.message, code: error.code, details: error.details, hint: error.hint }))
  const marcas = [...new Set((marcasFilas ?? []).map((m) => m.marca as string))]

  const productos = (data ?? []) as ProductoPublico[]
  const total = count ?? 0
  const paginas = Math.ceil(total / POR_PAGINA)
  const claveResultados = JSON.stringify([sp.q, sp.genero, sp.momento, sp.ocasion, sp.marca, sp.orden, pagina])
  const enlace = (cambios: Partial<Busqueda>) => {
    const p = new URLSearchParams()
    const todo = { ...sp, ...cambios }
    for (const [k, v] of Object.entries(todo)) if (v) p.set(k, String(v))
    return `/?${p.toString()}`
  }

  return (
    <>
      <section className="py-6 sm:py-16">
        {/* Logo de la marca con un halo dorado detrás; entra suave y queda flotando apenas. */}
        <div className="mb-6 flex items-center gap-5 sm:mb-10 sm:gap-7">
          <div className="logo-portada relative shrink-0">
            <span aria-hidden className="absolute inset-[-30%] rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-dorado)_28%,transparent),transparent)] blur-md" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={marca.logo} alt={marca.nombre} width={295} height={412} fetchPriority="high"
              className="relative h-28 w-auto drop-shadow-[0_16px_24px_rgb(0_0_0/0.28)] sm:h-40" />
          </div>
          <div className="animate-entrada [animation-delay:0.25s]">
            <p className="font-display text-3xl leading-none sm:text-5xl">{marca.nombreCorto}</p>
            <p className="mt-2 flex items-center gap-3 text-xs font-medium tracking-[0.3em] text-humo uppercase sm:text-sm">
              <span aria-hidden className="h-px w-8 bg-dorado sm:w-12" />
              {marca.rubroCiudad}
            </p>
            {marca.direccion && <p className="mt-1 pl-11 text-sm text-humo sm:pl-15">{marca.direccion}</p>}
          </div>
        </div>
        {/* Letra del titular de la portada (--font-portada), en negrita para que sus trazos finos no se pierdan.
            En teléfono el tamaño sigue al ancho de la pantalla para que "esperando." quepa. */}
        <h1 className="mb-3 max-w-3xl font-portada font-bold text-[clamp(2.25rem,13.5vw,4.5rem)] sm:text-8xl">{marca.titular}</h1>
        <p className="mt-5 max-w-xl text-humo sm:mt-4 sm:text-lg">
          {marca.textoPortada}
        </p>
      </section>

      {/* Filtra al elegir una opción o al escribir, sin botón. */}
      <FiltrosAuto transicion="filtro" sonido className="grid grid-cols-2 gap-2 sm:flex sm:items-end sm:gap-3" claseAcciones="col-span-2 sm:col-auto">
        <label className="col-span-2 sm:flex-1">
          <span className="etiqueta sr-only sm:not-sr-only">Buscar</span>
          <input name="q" defaultValue={sp.q} placeholder="Busca por nombre o marca" className="campo" type="search" />
        </label>
        <label className="sm:w-56">
          <span className="etiqueta sr-only sm:not-sr-only">Marca</span>
          <select name="marca" defaultValue={sp.marca ?? ''} className="campo">
            <option value="">Todas las marcas</option>
            {marcas.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="sm:w-48">
          <span className="etiqueta sr-only sm:not-sr-only">Ordenar</span>
          <select name="orden" defaultValue={sp.orden ?? ''} className="campo">
            <option value="">Por marca</option>
            <option value="precio-asc">Menor precio</option>
            <option value="precio-desc">Mayor precio</option>
          </select>
        </label>
        {sp.genero && <input type="hidden" name="genero" value={sp.genero} />}
        {sp.momento && <input type="hidden" name="momento" value={sp.momento} />}
        {sp.ocasion && <input type="hidden" name="ocasion" value={sp.ocasion} />}
      </FiltrosAuto>

      <nav aria-label="Filtros" className="mt-4 flex gap-2 overflow-x-auto pb-2">
        {Object.entries(GENEROS).map(([v, t]) => (
          <EnlaceFiltro key={v} href={enlace({ genero: sp.genero === v ? undefined : v, pagina: undefined })} activo={sp.genero === v}>
            {t}
          </EnlaceFiltro>
        ))}
        <span className="mx-1 w-px shrink-0 bg-linea" aria-hidden />
        {Object.entries(FILTRO_MOMENTO).map(([v, t]) => (
          <EnlaceFiltro key={v} href={enlace({ momento: sp.momento === v ? undefined : v, pagina: undefined })} activo={sp.momento === v}>
            {t}
          </EnlaceFiltro>
        ))}
        <span className="mx-1 w-px shrink-0 bg-linea" aria-hidden />
        {OCASIONES.map((o) => (
          <EnlaceFiltro key={o} href={enlace({ ocasion: sp.ocasion === o ? undefined : o, pagina: undefined })} activo={sp.ocasion === o}>
            {o}
          </EnlaceFiltro>
        ))}
      </nav>

      {/* Al cambiar de página se sube suave hasta aquí (EnlacePagina); queda bajo el encabezado fijo. */}
      <div id={ANCLA_CATALOGO} className="resultados scroll-mt-32">
      <div className="mt-6 flex items-baseline justify-between text-sm text-humo">
        <p>{total === 1 ? '1 perfume' : `${total} perfumes`}</p>
      </div>

      {error && <p className="mt-6 text-alerta">No pudimos cargar el catálogo. Recarga la página en unos segundos.</p>}

      {productos.length === 0 && !error ? (
        <div className="py-16 text-center">
          <p className="font-display text-3xl">No encontramos ese perfume.</p>
          <p className="mt-2 text-humo">Prueba con otra marca o escríbenos por WhatsApp: si no está en la web, puede que lo consigamos.</p>
        </div>
      ) : (
        // La clave cambia con la página o los filtros: la cuadrícula vieja sale y la nueva entra (ver globals.css).
        <ViewTransition key={claveResultados} enter={{ 'pagina-adelante': 'pagina-adelante', 'pagina-atras': 'pagina-atras', filtro: 'filtro', default: 'none' }} exit={{ 'pagina-adelante': 'pagina-adelante', 'pagina-atras': 'pagina-atras', filtro: 'filtro', default: 'none' }} default="none">
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
            {productos.map((p, i) => (
              <TarjetaProducto key={p.id} p={p} indice={i} />
            ))}
          </div>
        </ViewTransition>
      )}
      </div>

      {paginas > 1 && (
        <nav aria-label="Páginas" className="mt-12 flex items-center justify-center gap-3 text-sm">
          {pagina > 1 && <EnlacePagina direccion="atras" href={enlace({ pagina: String(pagina - 1) })}>Anterior</EnlacePagina>}
          <span className="text-humo tabular-nums">Página {pagina} de {paginas}</span>
          {pagina < paginas && <EnlacePagina direccion="adelante" href={enlace({ pagina: String(pagina + 1) })}>Siguiente</EnlacePagina>}
        </nav>
      )}
    </>
  )
}
