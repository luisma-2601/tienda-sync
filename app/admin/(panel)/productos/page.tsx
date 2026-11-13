import { EnlacePanel } from '@/components/admin/Carga'
import { FiltrosAuto } from '@/components/FiltrosAuto'
import { BotonConfirmar } from '@/components/DialogoConfirmacion'
import { LoteIA } from './LoteIA'
import { aprobarConfianzaAlta } from './acciones-ia'
import { exigirStaff } from '@/lib/admin'
import { leerEstadoLoteIA } from '@/lib/fichas-lote'
import { formatoUsd } from '@/lib/precios'
import type { ConfianzaIA, Producto } from '@/lib/tipos'

// Las acciones del lote de fichas con IA arrancan una corrida con after(): necesitan el mismo tiempo que /api/fichas-ia.
export const maxDuration = 300

const POR_PAGINA = 50
const ESTADOS = { publicado: 'Publicado', borrador: 'Borrador', oculto: 'Oculto' } as const
// "Stock bajo" usa el mismo umbral que la tienda para mostrar "Últimas unidades" (Configuración).
const STOCK = { agotado: 'Sin stock', bajo: 'Stock bajo', con: 'Con stock' } as const
const ORDEN = {
  recientes: { texto: 'Actualizados recientemente', columna: 'actualizado_en', asc: false },
  nombre: { texto: 'Nombre (A-Z)', columna: 'nombre', asc: true },
  'stock-asc': { texto: 'Menos stock primero', columna: 'stock', asc: true },
  'stock-desc': { texto: 'Más stock primero', columna: 'stock', asc: false },
  'precio-asc': { texto: 'Precio: menor a mayor', columna: 'precio_usd', asc: true },
  'precio-desc': { texto: 'Precio: mayor a menor', columna: 'precio_usd', asc: false },
} as const

type Filtros = { q?: string; estado?: string; desc?: string; stock?: string; foto?: string; orden?: string; pagina?: string }

export default async function Productos({ searchParams }: { searchParams: Promise<Filtros> }) {
  const sp = await searchParams
  const { supabase, perfil } = await exigirStaff()
  const esDueno = perfil.rol === 'dueno'
  const pagina = Math.max(1, Number(sp.pagina) || 1)
  const orden = ORDEN[(sp.orden ?? '') as keyof typeof ORDEN] ?? ORDEN.recientes

  const { data: cfg } = await supabase.from('configuracion').select('umbral_ultimas').single()
  const umbral = cfg?.umbral_ultimas ?? 3

  let q = supabase.from('productos').select('id, codigo_sistema, nombre, marca, presentacion_ml, precio_usd, stock, estado, descripcion_estado, fotos, marca_sugerida, nombre_sugerido, ia_confianza', { count: 'exact' })
  if (sp.q) {
    const t = sp.q.replace(/[%,()]/g, ' ').trim()
    q = q.or(`nombre.ilike.%${t}%,marca.ilike.%${t}%,codigo_sistema.ilike.%${t}%`)
  }
  if (sp.estado && sp.estado in ESTADOS) q = q.eq('estado', sp.estado)
  if (sp.desc === 'pendiente') q = q.neq('descripcion_estado', 'aprobada')
  if (sp.desc === 'revisar') q = q.eq('descripcion_estado', 'borrador')
  if (sp.desc === 'sin') q = q.eq('descripcion_estado', 'sin')
  if (sp.stock === 'agotado') q = q.lte('stock', 0)
  if (sp.stock === 'bajo') q = q.gt('stock', 0).lte('stock', umbral)
  if (sp.stock === 'con') q = q.gt('stock', 0)
  if (sp.foto === 'sin') q = q.eq('fotos', '{}')

  // Accesos rápidos: cuántos publicados se quedaron sin stock o con poco (lo que el cliente ya ve en la tienda).
  const [{ data, count, error }, agotados, bajos, loteIA, altasPorAprobar] = await Promise.all([
    q.order(orden.columna, { ascending: orden.asc }).order('nombre').range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1),
    supabase.from('productos').select('id', { count: 'exact', head: true }).eq('estado', 'publicado').lte('stock', 0),
    supabase.from('productos').select('id', { count: 'exact', head: true }).eq('estado', 'publicado').gt('stock', 0).lte('stock', umbral),
    // Fichas con IA (solo el dueño las genera y aprueba en lote).
    esDueno ? leerEstadoLoteIA(supabase) : null,
    supabase.from('productos').select('id', { count: 'exact', head: true }).eq('descripcion_estado', 'borrador').eq('ia_confianza', 'alta'),
  ])
  const productos = (data ?? []) as Producto[]
  const paginas = Math.ceil((count ?? 0) / POR_PAGINA)
  const { pagina: _, ...filtros } = sp
  const claveFiltros = JSON.stringify(filtros)
  const url = (cambios: Filtros) => {
    const p = Object.entries({ ...filtros, ...cambios }).filter(([, v]) => v) as [string, string][]
    return `/admin/productos${p.length ? `?${new URLSearchParams(p)}` : ''}`
  }

  return (
    <div className="max-w-6xl space-y-6">
      <h1 className="text-5xl">Productos</h1>

      {esDueno && (
        <div className="space-y-3">
          {loteIA && <LoteIA inicial={loteIA} />}
          {(altasPorAprobar.count ?? 0) > 0 && (
            <form action={aprobarConfianzaAlta} className="flex flex-wrap items-center gap-3 text-sm">
              <BotonConfirmar className="boton-sec" pendiente="Aprobando…" titulo="¿Aprobar las fichas de confianza alta?"
                mensaje={`Se publicarán en la tienda ${altasPorAprobar.count} fichas que la IA generó con confianza alta, con su nombre, notas y descripción. Las de confianza media o baja siguen esperando tu revisión.`}
                confirmar="Aprobar todas">
                Aprobar todas las de confianza alta ({altasPorAprobar.count})
              </BotonConfirmar>
              <EnlacePanel href={url({ desc: 'revisar', pagina: undefined })} className="text-humo underline-offset-4 hover:underline">Ver las fichas por revisar</EnlacePanel>
            </form>
          )}
        </div>
      )}

      {((agotados.count ?? 0) > 0 || (bajos.count ?? 0) > 0) && (
        <div className="flex flex-wrap gap-2 text-sm">
          {(agotados.count ?? 0) > 0 && (
            <EnlacePanel href={url({ estado: 'publicado', stock: 'agotado' })} aria-current={sp.stock === 'agotado' && sp.estado === 'publicado' ? 'true' : undefined}
              className="opcion inline-flex items-center gap-2 rounded-full border border-alerta/40 bg-alerta/10 px-3 py-1.5 font-medium text-alerta hover:border-alerta aria-[current]:border-alerta aria-[current]:bg-alerta aria-[current]:text-vidrio">
              <span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden />
              {agotados.count} publicados sin stock
            </EnlacePanel>
          )}
          {(bajos.count ?? 0) > 0 && (
            <EnlacePanel href={url({ estado: 'publicado', stock: 'bajo' })} aria-current={sp.stock === 'bajo' && sp.estado === 'publicado' ? 'true' : undefined}
              className="opcion inline-flex items-center gap-2 rounded-full border border-dorado/40 bg-dorado-claro px-3 py-1.5 font-medium text-dorado hover:border-dorado aria-[current]:border-dorado aria-[current]:bg-dorado aria-[current]:text-vidrio">
              {bajos.count} publicados con stock bajo
            </EnlacePanel>
          )}
        </div>
      )}

      {/* Filtra al elegir una opción o al escribir; los accesos rápidos de arriba también actualizan los campos. */}
      <FiltrosAuto predeterminados={{ orden: 'recientes' }} claseAcciones="self-end sm:col-span-2 lg:col-span-4" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1fr)_repeat(4,auto)]">
        <label className="sm:col-span-2 lg:col-span-1"><span className="etiqueta">Buscar</span><input name="q" defaultValue={sp.q} className="campo" placeholder="Nombre, marca o código" /></label>
        <label><span className="etiqueta">Estado</span>
          <select name="estado" defaultValue={sp.estado ?? ''} className="campo">
            <option value="">Todos</option>
            {Object.entries(ESTADOS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <label><span className="etiqueta">Stock</span>
          <select name="stock" defaultValue={sp.stock ?? ''} className="campo">
            <option value="">Todos</option>
            <option value="agotado">{STOCK.agotado}</option>
            <option value="bajo">{STOCK.bajo} (1 a {umbral})</option>
            <option value="con">{STOCK.con}</option>
          </select>
        </label>
        <label><span className="etiqueta">Descripción</span>
          <select name="desc" defaultValue={sp.desc ?? ''} className="campo">
            <option value="">Todas</option>
            <option value="revisar">Ficha por revisar</option>
            <option value="sin">Sin ficha</option>
            <option value="pendiente">Sin aprobar</option>
          </select>
        </label>
        <label><span className="etiqueta">Fotos</span>
          <select name="foto" defaultValue={sp.foto ?? ''} className="campo">
            <option value="">Todas</option>
            <option value="sin">Sin foto</option>
          </select>
        </label>
        <label className="sm:col-span-2 lg:col-span-1"><span className="etiqueta">Ordenar por</span>
          <select name="orden" defaultValue={sp.orden ?? 'recientes'} className="campo">
            {Object.entries(ORDEN).map(([v, o]) => <option key={v} value={v}>{o.texto}</option>)}
          </select>
        </label>
      </FiltrosAuto>

      {error && (
        <p role="alert" className="rounded-lg bg-alerta/10 px-4 py-3 text-sm text-alerta">
          No se pudieron cargar los productos{/column|columna/i.test(error.message) ? ': falta ejecutar en Supabase la migración 0008_fichas_ia.sql.' : '. Recarga la página.'}
        </p>
      )}
      <p key={claveFiltros} className="animate-cambio text-sm text-humo">{count ?? 0} productos</p>
      <div className="tarjeta overflow-x-auto">
        <table className="tabla">
          <thead><tr><th>Producto</th><th>Código</th><th className="text-right">Stock</th><th className="text-right">Precio</th><th>Estado</th><th>Descripción</th></tr></thead>
          {/* La clave cambia con el filtro o la página: las filas vuelven a entrar, de arriba hacia abajo. */}
          <tbody key={`${claveFiltros}-${pagina}`}>
            {productos.map((p, i) => (
              <tr key={p.id} className={`fila-entra ${p.stock <= 0 ? 'bg-alerta/5' : ''}`} style={{ animationDelay: `${Math.min(i, 20) * 35}ms` }}>
                <td>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <EnlacePanel href={`/admin/productos/${p.id}`} className="font-medium underline-offset-4 hover:underline">{p.nombre}</EnlacePanel>
                      <div className="text-xs text-humo">{[p.marca, p.presentacion_ml ? `${Number(p.presentacion_ml)} ml` : null].filter(Boolean).join(' · ')}{p.fotos.length === 0 ? ' · sin foto' : ''}</div>
                      {p.nombre_sugerido && <div className="text-xs text-dorado">IA: {[p.marca_sugerida, p.nombre_sugerido].filter(Boolean).join(' ')}</div>}
                    </div>
                    <EtiquetaStock stock={p.stock} umbral={umbral} />
                  </div>
                </td>
                <td className="tabular-nums">{p.codigo_sistema ?? <span className="text-humo">—</span>}</td>
                <td className={`text-right tabular-nums ${p.stock <= 0 ? 'font-semibold text-alerta' : p.stock <= umbral ? 'text-dorado' : ''}`}>{p.stock}</td>
                <td className="text-right tabular-nums">{formatoUsd(Number(p.precio_usd))}</td>
                <td>{ESTADOS[p.estado]}</td>
                <td>
                  <span className={p.descripcion_estado === 'aprobada' ? '' : 'text-dorado'}>{{ sin: 'Sin ficha', borrador: 'Por revisar', aprobada: 'Aprobada' }[p.descripcion_estado]}</span>
                  {p.descripcion_estado === 'borrador' && p.ia_confianza && <InsigniaConfianza c={p.ia_confianza} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {productos.length === 0 && <p className="px-3 py-8 text-center text-sm text-humo">Ningún producto coincide con estos filtros.</p>}
      </div>
      {paginas > 1 && (
        <nav className="flex items-center gap-3 text-sm">
          {pagina > 1 && <EnlacePanel className="boton-sec" href={url({ pagina: String(pagina - 1) })}>Anterior</EnlacePanel>}
          <span className="text-humo">Página {pagina} de {paginas}</span>
          {pagina < paginas && <EnlacePanel className="boton-sec" href={url({ pagina: String(pagina + 1) })}>Siguiente</EnlacePanel>}
        </nav>
      )}
    </div>
  )
}

/** Junto al nombre, solo un ícono: exclamación roja si no queda stock; flecha dorada hacia abajo si queda poco. */
function EtiquetaStock({ stock, umbral }: { stock: number; umbral: number }) {
  if (stock <= 0) {
    return (
      <span title="Sin stock" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-alerta text-vidrio shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-alerta)_20%,transparent)]">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
          <path d="M12 6v8M12 18.5h.01" />
        </svg>
        <span className="sr-only">Sin stock</span>
      </span>
    )
  }
  if (stock <= umbral) {
    return (
      <span title="Stock bajo" className="flex h-6 w-6 shrink-0 items-center justify-center text-dorado">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M6 13l6 6 6-6" />
        </svg>
        <span className="sr-only">Stock bajo</span>
      </span>
    )
  }
  return null
}

/** Qué tan segura estaba la IA de haber reconocido el perfume: la baja va en rojo para revisarla con cuidado. */
function InsigniaConfianza({ c }: { c: ConfianzaIA }) {
  const estilo = { alta: 'bg-ok/10 text-ok', media: 'bg-dorado-claro text-dorado', baja: 'bg-alerta text-vidrio' }[c]
  return <span className={`mt-1 block w-fit rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${estilo}`}>IA {c}</span>
}
