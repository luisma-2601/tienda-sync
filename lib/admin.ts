import { redirect } from 'next/navigation'
import { supabaseServidor } from './supabase/server'
import type { Rol } from './tipos'

type Perfil = { id: string; nombre: string | null; rol: Rol }

/** Sesión y perfil actuales, o null si no hay sesión. Para rutas que deciden ellas mismas cómo redirigir. */
export async function sesionActual() {
  const supabase = await supabaseServidor()
  const { data: claims } = await supabase.auth.getClaims()
  const uid = claims?.claims?.sub
  if (!uid) return null
  const { data: perfil } = await supabase.from('perfiles').select('id, nombre, rol').eq('id', uid).single()
  return { supabase, perfil: (perfil ?? null) as Perfil | null }
}

/** Exige sesión de staff. La seguridad real está en RLS; esto evita pantallas sin permiso. */
export async function exigirStaff(rolesPermitidos: Rol[] = ['dueno', 'empleado']) {
  const sesion = await sesionActual()
  if (!sesion) redirect('/admin/login')
  const { supabase, perfil } = sesion
  if (!perfil || !rolesPermitidos.includes(perfil.rol)) redirect('/admin?sin-permiso=1')
  return { supabase, perfil }
}

export const exigirDueno = () => exigirStaff(['dueno'])
