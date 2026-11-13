'use server'

import { revalidatePath } from 'next/cache'
import { exigirStaff } from '@/lib/admin'
import type { FilaInventario } from '@/lib/inventario/importador'

export async function resolverRevision(form: FormData) {
  const { supabase, perfil } = await exigirStaff()
  const id = String(form.get('id'))
  const decision = String(form.get('decision')) as 'vinculado' | 'nuevo' | 'descartado'

  const { data: rev } = await supabase.from('importacion_revision').select('fila, candidato_id, estado').eq('id', id).single()
  if (!rev || rev.estado !== 'pendiente') return
  const fila = rev.fila as FilaInventario

  if (decision === 'vinculado' && rev.candidato_id) {
    // El producto de la web pasa a usar el código del sistema administrativo: las próximas importaciones lo emparejan solas.
    const cambios: Record<string, unknown> = { stock: fila.stock, en_ultimo_reporte: true }
    if (fila.codigo) cambios.codigo_sistema = fila.codigo
    if (fila.precio_usd !== null) cambios.precio_usd = fila.precio_usd
    await supabase.from('productos').update(cambios).eq('id', rev.candidato_id)
  } else if (decision === 'nuevo') {
    await supabase.from('productos').insert({
      codigo_sistema: fila.codigo, nombre: fila.nombre, marca: fila.marca, stock: fila.stock, precio_usd: fila.precio_usd ?? 0, estado: 'borrador',
    })
  }
  await supabase
    .from('importacion_revision')
    .update({ estado: decision, resuelta_por: perfil.id, resuelta_en: new Date().toISOString() })
    .eq('id', id)
  revalidatePath('/admin/importar/revision')
}
