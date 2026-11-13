// "Pedidos web": pedidos que los clientes enviaron por WhatsApp desde la tienda.
// No son ventas confirmadas: las ventas se registran en el sistema administrativo, la única fuente de verdad.

const ZONA = 'America/Caracas'

/** Mes actual en hora de Caracas, como "AAAA-MM". */
export function mesActual(ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit' }).format(ahora).slice(0, 7)
}

export function mesValido(mes: string | undefined): mes is string {
  return typeof mes === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)
}

/** Suma (o resta) meses a "AAAA-MM". */
export function desplazarMes(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number)
  const f = new Date(Date.UTC(a, m - 1 + n, 1))
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Inicio del mes y del mes siguiente en hora de Caracas (UTC-4 todo el año), para filtrar creado_en. */
export function rangoMes(mes: string): { desde: string; hasta: string } {
  return { desde: `${mes}-01T00:00:00-04:00`, hasta: `${desplazarMes(mes, 1)}-01T00:00:00-04:00` }
}

/** "octubre de 2026" → "Octubre de 2026". */
export function nombreMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  const t = new Intl.DateTimeFormat('es-VE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(a, m - 1, 1)))
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export interface PedidoParaResumen {
  total_usd: number | string
  pedido_items: { descripcion: string; cantidad: number }[]
}

/** Cantidad de pedidos, total en USD y los productos más pedidos (por unidades). */
export function resumenMes(pedidos: PedidoParaResumen[], cuantos = 5) {
  const unidades = new Map<string, number>()
  for (const p of pedidos) for (const i of p.pedido_items) unidades.set(i.descripcion, (unidades.get(i.descripcion) ?? 0) + i.cantidad)
  const top = [...unidades]
    .map(([descripcion, cantidad]) => ({ descripcion, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.descripcion.localeCompare(b.descripcion, 'es'))
    .slice(0, cuantos)
  const totalUsd = Math.round(pedidos.reduce((s, p) => s + Number(p.total_usd), 0) * 100) / 100
  return { cantidad: pedidos.length, totalUsd, top }
}
