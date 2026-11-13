'use server'

import { exigirStaff } from '@/lib/admin'
import type { Mapeo } from '@/lib/inventario/importador'
import { borrarPendiente, importarReporte, leerPendiente, type ArchivoReporte, type ModoImportacion, type ResultadoImportacion } from '@/lib/inventario/procesar'

/**
 * Procesa el reporte del sistema administrativo desde la pantalla. El archivo llega elegido en el celular o la
 * computadora (`archivo`), o es uno compartido que quedó guardado para revisar (`pendiente`).
 * La lógica es la misma de /admin/compartir: ver lib/inventario/procesar.ts.
 */
export async function subirReporte(form: FormData): Promise<ResultadoImportacion> {
  const { supabase, perfil } = await exigirStaff()
  const modo = (['auto', 'vista', 'aplicar'].includes(String(form.get('modo'))) ? form.get('modo') : 'auto') as ModoImportacion
  const pendiente = String(form.get('pendiente') ?? '')

  let archivo: ArchivoReporte | null = null
  const subido = form.get('archivo')
  if (subido instanceof File && subido.size > 0) archivo = { nombre: subido.name, bytes: await subido.arrayBuffer() }
  else if (pendiente) archivo = await leerPendiente(supabase, perfil.id, pendiente)
  if (!archivo) return { tipo: 'error', error: pendiente ? 'Ese reporte ya no está disponible. Vuelve a compartirlo o elígelo aquí.' : 'Elige el reporte de inventario en Excel (.xlsx).' }

  const mapeoTexto = form.get('mapeo')
  const filaTexto = form.get('filaEncabezado')
  const r = await importarReporte(supabase, perfil.id, archivo, {
    modo,
    mapeo: mapeoTexto ? (JSON.parse(String(mapeoTexto)) as Mapeo) : undefined,
    filaEncabezado: filaTexto !== null && filaTexto !== '' ? Number(filaTexto) : undefined,
  })
  // El reporte compartido ya se aplicó (o ya estaba al día): no hace falta guardarlo más.
  if (pendiente && (r.tipo === 'aplicado' || r.tipo === 'al-dia')) await borrarPendiente(supabase, perfil.id, pendiente)
  return r
}
