import type { Metadata } from 'next'
import { supabaseServidor } from '@/lib/supabase/server'
import { Checkout } from './Checkout'
import type { ConfigPublica, MetodoPago, ZonaDelivery } from '@/lib/tipos'

export const metadata: Metadata = { title: 'Tu carrito' }

export default async function PaginaCarrito() {
  const supabase = await supabaseServidor()
  const [{ data: cfg }, { data: metodos }, { data: zonas }] = await Promise.all([
    supabase.from('configuracion_publica').select('*').single(),
    supabase.from('metodos_pago').select('id, nombre, moneda').eq('activo', true).order('orden'),
    supabase.from('zonas_delivery').select('id, nombre, costo_usd').eq('activa', true).order('nombre'),
  ])
  const config: ConfigPublica = {
    tasa_bcv: Number(cfg?.tasa_bcv ?? 0),
    recargo_bs_pct: Number(cfg?.recargo_bs_pct ?? 0),
    redondeo_bs: Number(cfg?.redondeo_bs ?? 0.01),
    whatsapp_numero: cfg?.whatsapp_numero ?? null,
    tasa_actualizada_en: cfg?.tasa_actualizada_en ?? null,
  }
  return (
    <Checkout
      config={config}
      metodos={(metodos ?? []) as MetodoPago[]}
      zonas={((zonas ?? []) as ZonaDelivery[]).map((z) => ({ ...z, costo_usd: Number(z.costo_usd) }))}
    />
  )
}
