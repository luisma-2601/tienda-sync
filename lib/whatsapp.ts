import { formatoBs, formatoUsd, type Moneda } from './precios'
import { marca } from '@/marca.config'

export interface ItemMensaje {
  descripcion: string
  cantidad: number
  precio_unit_usd: number
  precio_unit_bs: number | null
}

export interface PedidoMensaje {
  numero: number
  cliente_nombre: string
  entrega: 'retiro' | 'delivery'
  zona?: string | null
  direccion?: string | null
  moneda: Moneda
  metodo_pago: string
  total_usd: number
  total_bs: number | null
  costo_delivery_usd?: number
  items: ItemMensaje[]
}

/** Mensaje que el cliente envía al dueño por WhatsApp al terminar el carrito. */
export function mensajePedido(p: PedidoMensaje): string {
  const enBs = p.moneda === 'bolivares'
  const precio = (usd: number, bs: number | null) => (enBs && bs !== null ? formatoBs(bs) : formatoUsd(usd))

  const lineas = [
    `¡Hola ${marca.nombreCorto}! Quiero hacer este pedido 🛍️`,
    ``,
    `*Pedido #${p.numero}*`,
    ...p.items.map((i) => `• ${i.cantidad} × ${i.descripcion} — ${precio(i.precio_unit_usd * i.cantidad, i.precio_unit_bs === null ? null : i.precio_unit_bs * i.cantidad)}`),
  ]
  if (p.entrega === 'delivery') {
    lineas.push(`• Delivery${p.zona ? ` (${p.zona})` : ''}`)
  }
  lineas.push(
    ``,
    `*Total: ${enBs && p.total_bs !== null ? formatoBs(p.total_bs) : formatoUsd(p.total_usd)}*`,
    `Pago: ${p.metodo_pago}, en ${enBs ? 'bolívares' : 'divisas'}`,
    `Entrega: ${p.entrega === 'retiro' ? 'Retiro en tienda' : `Delivery${p.direccion ? ` — ${p.direccion}` : ''}`}`,
    `Nombre: ${p.cliente_nombre}`,
  )
  return lineas.join('\n')
}

/** Link wa.me con el mensaje listo. `numero` en formato internacional, ej. 584121234567. */
export function linkWhatsapp(numero: string, mensaje: string): string {
  const limpio = numero.replace(/\D/g, '')
  return `https://wa.me/${limpio}?text=${encodeURIComponent(mensaje)}`
}

/**
 * Teléfono que escribe el cliente ("0412 123 4567", "412-1234567", "+58 412...") en formato
 * internacional para wa.me. Si no parece venezolano, se usa tal cual (solo dígitos).
 */
export function telefonoInternacional(telefono: string): string | null {
  const d = telefono.replace(/\D/g, '')
  if (d.length < 7) return null
  if (d.startsWith('58') && d.length === 12) return d
  if (d.startsWith('0') && d.length === 11) return `58${d.slice(1)}`
  if (d.length === 10 && /^[24]/.test(d)) return `58${d}`
  return d
}
