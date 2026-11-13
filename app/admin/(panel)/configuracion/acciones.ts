'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { exigirDueno } from '@/lib/admin'
import { parsearNumero } from '@/lib/normalizar'

type Seccion = 'tasa' | 'precios' | 'metodos' | 'zonas' | 'equipo'

// Vuelve a Configuración con el mensaje en la sección que se guardó (que destella) y la lleva a la vista.
// `n` cambia en cada envío para que la animación se repita aunque el mensaje sea el mismo.
const volver = (seccion: Seccion, msg: string, tipo: 'ok' | 'error' = 'ok') => {
  revalidatePath('/', 'layout')
  redirect(`/admin/configuracion?${tipo}=${encodeURIComponent(msg)}&s=${seccion}&n=${Date.now()}#${seccion}`)
}

export async function guardarPrecios(form: FormData) {
  const { supabase } = await exigirDueno()
  const recargo = parsearNumero(form.get('recargo_bs_pct'))
  const redondeo = parsearNumero(form.get('redondeo_bs'))
  const umbral = parsearNumero(form.get('umbral_ultimas'))
  if (recargo === null || recargo < 0 || recargo > 100) return volver('precios', 'El recargo debe estar entre 0 y 100 %.', 'error')
  if (!redondeo || redondeo <= 0) return volver('precios', 'Elige una regla de redondeo.', 'error')
  const whatsapp = String(form.get('whatsapp_numero') ?? '').replace(/\D/g, '')
  if (whatsapp && !/^58\d{10}$/.test(whatsapp)) return volver('precios', 'El WhatsApp debe ir con código de país, ej. 584121234567.', 'error')
  const { error } = await supabase
    .from('configuracion')
    .update({ recargo_bs_pct: recargo, redondeo_bs: redondeo, umbral_ultimas: Math.max(0, Math.trunc(umbral ?? 3)), whatsapp_numero: whatsapp || null, actualizado_en: new Date().toISOString() })
    .eq('id', 1)
  if (error) return volver('precios', 'No se pudo guardar.', 'error')
  volver('precios', 'Configuración guardada.')
}

export async function fijarTasa(form: FormData) {
  const { supabase } = await exigirDueno()
  const tasa = parsearNumero(form.get('tasa'))
  if (!tasa || tasa <= 0) return volver('tasa', 'Escribe una tasa válida.', 'error')
  const { error } = await supabase.rpc('registrar_tasa', { p_tasa: tasa, p_fuente: 'manual' })
  if (error) return volver('tasa', error.message, 'error')
  volver('tasa', 'Tasa fijada a mano. La automática queda en pausa hasta que la reactives.')
}

export async function volverTasaAutomatica() {
  const { supabase } = await exigirDueno()
  await supabase.from('configuracion').update({ tasa_modo: 'auto' }).eq('id', 1)
  volver('tasa', 'Tasa automática reactivada. Se aplicará en la próxima consulta automática (cada 2 horas).')
}

export async function guardarMetodo(form: FormData) {
  const { supabase } = await exigirDueno()
  await supabase
    .from('metodos_pago')
    .update({ moneda: String(form.get('moneda')), activo: form.get('activo') === 'on' })
    .eq('id', String(form.get('id')))
  volver('metodos', 'Método de pago actualizado.')
}

export async function guardarZona(form: FormData) {
  const { supabase } = await exigirDueno()
  const id = String(form.get('id') ?? '')
  const nombre = String(form.get('nombre') ?? '').trim()
  const costo = parsearNumero(form.get('costo_usd'))
  if (!nombre || costo === null || costo < 0) return volver('zonas', 'Escribe el nombre y el costo de la zona.', 'error')
  const datos = { nombre, costo_usd: costo, activa: form.get('activa') === 'on' }
  const { error } = id ? await supabase.from('zonas_delivery').update(datos).eq('id', id) : await supabase.from('zonas_delivery').insert(datos)
  if (error) return volver('zonas', 'Ya existe una zona con ese nombre.', 'error')
  volver('zonas', 'Zona guardada.')
}

export async function cambiarRol(form: FormData) {
  const { supabase, perfil } = await exigirDueno()
  const id = String(form.get('id'))
  const rol = String(form.get('rol'))
  if (id === perfil.id) return volver('equipo', 'No puedes cambiar tu propio rol.', 'error')
  if (!['empleado', 'cliente'].includes(rol)) return volver('equipo', 'Rol no válido.', 'error')
  await supabase.from('perfiles').update({ rol }).eq('id', id)
  volver('equipo', 'Rol actualizado.')
}
