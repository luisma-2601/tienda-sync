'use server'

import { revalidatePath } from 'next/cache'
import { exigirDueno } from '@/lib/admin'

/**
 * Checklist opcional de entrega: guarda o borra la fecha en pedidos.entregado_en.
 * Es solo una ayuda para el dueño: no toca stock, ni el sistema administrativo, ni el resumen del mes.
 * RLS (pedidos_dueno_update) ya limita el cambio al dueño.
 */
export async function marcarEntregado(id: string, entregado: boolean): Promise<{ ok: boolean }> {
  const { supabase } = await exigirDueno()
  const { data, error } = await supabase
    .from('pedidos')
    .update({ entregado_en: entregado ? new Date().toISOString() : null })
    .eq('id', id)
    .select('id')
  if (error || !data?.length) return { ok: false }
  revalidatePath('/admin/pedidos')
  return { ok: true }
}
