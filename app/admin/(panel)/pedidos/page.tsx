import { EnlacePanel } from '@/components/admin/Carga'
import { exigirDueno } from '@/lib/admin'
import { formatoBs, formatoUsd } from '@/lib/precios'
import { desplazarMes, mesActual, mesValido, nombreMes, rangoMes, resumenMes } from '@/lib/pedidos-web'
import { linkWhatsapp, telefonoInternacional } from '@/lib/whatsapp'
import type { Pedido, PedidoItem } from '@/lib/tipos'
import { CasillaEntrega } from './CasillaEntrega'
import { marca } from '@/marca.config'

const fecha = new Intl.DateTimeFormat('es-VE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Caracas' })
const fechaLarga = new Intl.DateTimeFormat('es-VE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Caracas' })

// Checklist opcional de entrega: filtro sobre la lista (no afecta el resumen del mes).
const VISTAS = { todos: 'Todos', 'por-entregar': 'Por entregar', entregados: 'Entregados' } as const
type Vista = keyof typeof VISTAS

type PedidoWeb = Pick<Pedido, 'id' | 'numero' | 'creado_en' | 'cliente_nombre' | 'cliente_telefono' | 'entrega' | 'moneda' | 'total_usd' | 'total_bs' | 'entregado_en'> & {
  metodo: { nombre: string } | null
  pedido_items: Pick<PedidoItem, 'descripcion' | 'cantidad'>[]
}

export default async function PedidosWeb({ searchParams }: { searchParams: Promise<{ mes?: string; ver?: string }> }) {
  const sp = await searchParams
  const { supabase } = await exigirDueno()
  const actual = mesActual()
  const mes = mesValido(sp.mes) && sp.mes <= actual ? sp.mes : actual
  const vista: Vista = sp.ver && sp.ver in VISTAS ? (sp.ver as Vista) : 'todos'
  const rango = rangoMes(mes)

  const { data, error } = await supabase
    .from('pedidos')
    .select('id, numero, creado_en, cliente_nombre, cliente_telefono, entrega, moneda, total_usd, total_bs, entregado_en, metodo:metodos_pago(nombre), pedido_items(descripcion, cantidad)')
    .gte('creado_en', rango.desde)
    .lt('creado_en', rango.hasta)
    .order('creado_en', { ascending: false })
  const pedidos = (data ?? []) as unknown as PedidoWeb[]
  const resumen = resumenMes(pedidos)
  const porEntregar = pedidos.filter((p) => !p.entregado_en).length
  const lista = vista === 'todos' ? pedidos : pedidos.filter((p) => (vista === 'entregados') === Boolean(p.entregado_en))

  const url = (cambios: { mes?: string; ver?: Vista }) => {
    const q = new URLSearchParams()
    const m = cambios.mes ?? mes
    const v = cambios.ver ?? vista
    if (m !== actual) q.set('mes', m)
    if (v !== 'todos') q.set('ver', v)
    const s = q.toString()
    return `/admin/pedidos${s ? `?${s}` : ''}`
  }

  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <h1 className="text-5xl">Pedidos web</h1>
        <p className="mt-2 text-sm text-humo">Pedidos enviados por WhatsApp desde la web. No son ventas confirmadas: las ventas se registran en {marca.sistema}.</p>
      </div>

      <nav aria-label="Mes" className="flex items-center gap-3">
        <EnlacePanel href={url({ mes: desplazarMes(mes, -1) })} className="boton-sec h-9 w-9 px-0" aria-label="Mes anterior">‹</EnlacePanel>
        <p key={mes} className="min-w-44 animate-cambio text-center font-display text-2xl">{nombreMes(mes)}</p>
        {mes < actual ? (
          <EnlacePanel href={url({ mes: desplazarMes(mes, 1) })} className="boton-sec h-9 w-9 px-0" aria-label="Mes siguiente">›</EnlacePanel>
        ) : (
          <span className="boton-sec h-9 w-9 px-0 opacity-30" aria-hidden>›</span>
        )}
      </nav>

      <section key={mes} className="grid animate-entrada gap-4 md:grid-cols-[1fr_1fr_2fr]">
        <div className="tarjeta p-5">
          <p className="text-sm text-humo">Pedidos web</p>
          <p className="mt-1 font-display text-3xl tabular-nums">{resumen.cantidad}</p>
          {porEntregar > 0 && <p className="mt-1 text-xs text-humo">{porEntregar} por entregar</p>}
        </div>
        <div className="tarjeta p-5">
          <p className="text-sm text-humo">Total en USD</p>
          <p className="mt-1 font-display text-3xl tabular-nums">{formatoUsd(resumen.totalUsd)}</p>
        </div>
        <div className="tarjeta p-5">
          <p className="text-sm text-humo">Más pedidos</p>
          {resumen.top.length === 0 ? (
            <p className="mt-2 text-sm text-humo">—</p>
          ) : (
            <ol className="mt-2 space-y-1 text-sm">
              {resumen.top.map((t, i) => (
                <li key={t.descripcion} className="flex justify-between gap-3">
                  <span><span className="text-humo tabular-nums">{i + 1}.</span> {t.descripcion}</span>
                  <span className="shrink-0 tabular-nums text-humo">{t.cantidad} u.</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {error && <p role="alert" className="text-sm text-alerta">No se pudieron cargar los pedidos. Recarga la página.</p>}

      {pedidos.length > 0 && (
        <nav aria-label="Entrega" className="flex flex-wrap gap-2 text-sm">
          {(Object.entries(VISTAS) as [Vista, string][]).map(([v, t]) => (
            <EnlacePanel key={v} href={url({ ver: v })} aria-current={vista === v ? 'true' : undefined}
              className={`opcion rounded-full border px-3 py-1 ${vista === v ? 'border-tinta bg-tinta text-vidrio' : 'border-linea hover:border-tinta/40'}`}>
              {t}
            </EnlacePanel>
          ))}
        </nav>
      )}

      {lista.length === 0 ? (
        <p key={`${mes}-${vista}`} className="animate-entrada text-humo">
          {pedidos.length === 0 ? `No llegaron pedidos por la web en ${nombreMes(mes).toLowerCase()}.` : vista === 'entregados' ? 'Ningún pedido marcado como entregado.' : 'Todos los pedidos están marcados como entregados.'}
        </p>
      ) : (
        <div className="tarjeta overflow-x-auto">
          <table className="tabla">
            <thead><tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Productos</th><th>Pago</th><th className="text-right">Total</th><th>Entrega</th></tr></thead>
            {/* La clave cambia con el mes o el filtro: las filas vuelven a entrar, de arriba hacia abajo. */}
            <tbody key={`${mes}-${vista}`}>
              {lista.map((p, i) => {
                const tel = telefonoInternacional(p.cliente_telefono)
                return (
                  <tr key={p.id} className="fila-entra" style={{ animationDelay: `${Math.min(i, 20) * 35}ms` }}>
                    <td className="font-medium tabular-nums">#{p.numero}</td>
                    <td className="whitespace-nowrap">{fecha.format(new Date(p.creado_en))}</td>
                    <td>
                      {p.cliente_nombre}
                      <div className="text-xs">
                        {tel ? (
                          <a href={linkWhatsapp(tel, `Hola ${p.cliente_nombre}, te escribimos de ${marca.nombreCorto} por tu pedido #${p.numero}.`)} target="_blank" rel="noopener noreferrer"
                            className="text-dorado underline-offset-4 hover:underline">{p.cliente_telefono}</a>
                        ) : <span className="text-humo">{p.cliente_telefono}</span>}
                        <span className="text-humo"> · {p.entrega === 'retiro' ? 'Retiro' : 'Delivery'}</span>
                      </div>
                    </td>
                    <td>
                      <ul className="space-y-0.5">
                        {p.pedido_items.map((it, n) => <li key={n}><span className="tabular-nums text-humo">{it.cantidad} ×</span> {it.descripcion}</li>)}
                      </ul>
                    </td>
                    <td>{p.metodo?.nombre ?? '—'}<div className="text-xs text-humo">{p.moneda === 'bolivares' ? 'Bolívares' : 'Divisas'}</div></td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      {formatoUsd(Number(p.total_usd))}
                      {p.total_bs !== null && <div className="text-xs text-humo">{formatoBs(Number(p.total_bs))}</div>}
                    </td>
                    <td><CasillaEntrega id={p.id} entregadoEn={p.entregado_en} cuando={p.entregado_en ? fechaLarga.format(new Date(p.entregado_en)) : undefined} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
