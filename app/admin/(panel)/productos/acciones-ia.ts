'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { exigirDueno } from '@/lib/admin'
import { avanzarLoteIA, leerEstadoLoteIA, type EstadoLoteIA } from '@/lib/fichas-lote'

/**
 * Enciende el lote de fichas con IA. Lo avanza el servidor (pg_cron cada minuto, ver supabase/FICHAS_IA.md):
 * el dueño puede cerrar el panel. La primera corrida arranca de una vez, sin esperar a la tarea programada.
 */
export async function iniciarLoteIA(): Promise<EstadoLoteIA> {
  const { supabase } = await exigirDueno()
  const { data: cfg } = await supabase.from('configuracion').select('ia_lote_activo').eq('id', 1).single()
  if (!cfg?.ia_lote_activo) {
    // Lote nuevo: los que fallaron en el anterior se vuelven a intentar.
    await supabase.from('configuracion').update({
      ia_lote_activo: true,
      ia_lote_iniciado_en: new Date().toISOString(),
      ia_lote_pausa_hasta: null,
      ia_lote_aviso: null,
      ia_lote_errores_seguidos: 0,
    }).eq('id', 1)
  }
  after(avanzarLoteIA)
  return leerEstadoLoteIA(supabase)
}

/** Apaga el lote. El producto que se está procesando termina; los demás quedan sin ficha para el próximo lote. */
export async function detenerLoteIA(): Promise<EstadoLoteIA> {
  const { supabase } = await exigirDueno()
  await supabase.from('configuracion').update({ ia_lote_activo: false, ia_lote_pausa_hasta: null, ia_lote_aviso: null }).eq('id', 1)
  return leerEstadoLoteIA(supabase)
}

/**
 * Estado para el panel, que lo consulta cada pocos segundos mientras el lote está encendido.
 * Con el panel abierto también empuja una corrida si no hay otra en curso: así avanza aunque la tarea
 * programada aún no esté configurada (el turno evita corridas dobles).
 */
export async function estadoLoteIA(): Promise<EstadoLoteIA> {
  const { supabase } = await exigirDueno()
  const estado = await leerEstadoLoteIA(supabase)
  if (estado.activo && !estado.pausaHasta) after(avanzarLoteIA)
  return estado
}

/** Aprueba de una vez las fichas en borrador que la IA generó con confianza alta. */
export async function aprobarConfianzaAlta() {
  const { supabase } = await exigirDueno()
  await supabase
    .from('productos')
    .update({ descripcion_estado: 'aprobada' })
    .eq('descripcion_estado', 'borrador')
    .eq('ia_confianza', 'alta')
  revalidatePath('/admin/productos')
  revalidatePath('/', 'layout')
}
