'use server'

import { supabaseServidor } from '@/lib/supabase/server'
import { linkWhatsapp, mensajePedido, type ItemMensaje } from '@/lib/whatsapp'
import type { Moneda } from '@/lib/precios'

export interface DatosPedido {
  items: { tipo: 'producto' | 'decant'; id: string; cantidad: number }[]
  moneda: Moneda
  metodo: string
  nombre: string
  telefono: string
  entrega: 'retiro' | 'delivery'
  zonaId: string | null
  direccion: string
}

export type ResultadoPedido = { ok: true; url: string; numero: number } | { ok: false; error: string }

export async function enviarPedido(d: DatosPedido): Promise<ResultadoPedido> {
  if (!d.items.length) return { ok: false, error: 'Tu carrito está vacío.' }
  if (!d.nombre.trim() || d.telefono.replace(/\D/g, '').length < 7) return { ok: false, error: 'Escribe tu nombre y un teléfono válido.' }
  if (d.entrega === 'delivery' && (!d.zonaId || !d.direccion.trim())) return { ok: false, error: 'Elige la zona y escribe la dirección del delivery.' }

  const supabase = await supabaseServidor()
  const { data, error } = await supabase.rpc('crear_pedido', {
    p_items: d.items.map((i) => (i.tipo === 'decant' ? { decant_id: i.id, cantidad: i.cantidad } : { producto_id: i.id, cantidad: i.cantidad })),
    p_moneda: d.moneda,
    p_metodo: d.metodo,
    p_nombre: d.nombre.slice(0, 120),
    p_telefono: d.telefono.slice(0, 30),
    p_entrega: d.entrega,
    p_zona_id: d.entrega === 'delivery' ? d.zonaId : null,
    p_direccion: d.entrega === 'delivery' ? d.direccion.slice(0, 300) : null,
  })
  if (error || !data?.[0]) {
    // Los mensajes de crear_pedido ya están escritos para el cliente (stock, disponibilidad, método).
    return { ok: false, error: error?.message ?? 'No pudimos registrar el pedido. Intenta de nuevo.' }
  }
  const pedido = data[0] as { numero: number; total_usd: number; total_bs: number | null; items: ItemMensaje[] }

  const [{ data: cfg }, { data: metodo }, { data: zona }] = await Promise.all([
    supabase.from('configuracion_publica').select('whatsapp_numero').single(),
    supabase.from('metodos_pago').select('nombre').eq('id', d.metodo).single(),
    d.zonaId ? supabase.from('zonas_delivery').select('nombre').eq('id', d.zonaId).single() : Promise.resolve({ data: null }),
  ])
  if (!cfg?.whatsapp_numero) return { ok: false, error: 'La tienda aún no configuró su WhatsApp. Escríbenos por redes.' }

  const mensaje = mensajePedido({
    numero: pedido.numero,
    cliente_nombre: d.nombre.trim(),
    entrega: d.entrega,
    zona: zona?.nombre ?? null,
    direccion: d.direccion.trim() || null,
    moneda: d.moneda,
    metodo_pago: metodo?.nombre ?? d.metodo,
    total_usd: Number(pedido.total_usd),
    total_bs: pedido.total_bs === null ? null : Number(pedido.total_bs),
    items: pedido.items.map((i) => ({ ...i, precio_unit_usd: Number(i.precio_unit_usd), precio_unit_bs: i.precio_unit_bs === null ? null : Number(i.precio_unit_bs) })),
  })
  return { ok: true, numero: pedido.numero, url: linkWhatsapp(cfg.whatsapp_numero, mensaje) }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Inventario actual de lo que hay en el carrito: clave del ítem → unidades que se pueden pedir
 * (0 si se agotó o ya no se vende). Devuelve null si no se pudo consultar: entonces el carrito no se toca.
 */
export async function revisarCarrito(items: { tipo: 'producto' | 'decant'; id: string }[]): Promise<Record<string, number> | null> {
  const validos = items.filter((i) => UUID.test(i.id)).slice(0, 100)
  const productos = validos.filter((i) => i.tipo === 'producto').map((i) => i.id)
  const decants = validos.filter((i) => i.tipo === 'decant').map((i) => i.id)

  const supabase = await supabaseServidor()
  const [p, d] = await Promise.all([
    productos.length ? supabase.from('catalogo_publico').select('id, maximo').in('id', productos) : { data: [], error: null },
    decants.length ? supabase.from('decants_publicos').select('id, disponible').in('id', decants) : { data: [], error: null },
  ])
  // Sin la migración 0007 no existe `maximo`: mejor no ajustar nada que vaciar el carrito por error.
  if (p.error || d.error) return null

  const limites: Record<string, number> = {}
  for (const id of productos) limites[`p:${id}`] = 0
  for (const id of decants) limites[`d:${id}`] = 0
  for (const x of (p.data ?? []) as { id: string; maximo: number }[]) limites[`p:${x.id}`] = Number(x.maximo)
  for (const x of (d.data ?? []) as { id: string; disponible: boolean }[]) limites[`d:${x.id}`] = x.disponible ? 50 : 0
  return limites
}
