'use server'

import { redirect } from 'next/navigation'
import { supabaseServidor } from '@/lib/supabase/server'

/** Solo rutas internas, para que `volver` no sirva de redirección abierta a otro sitio. */
function rutaInterna(valor: FormDataEntryValue | null, porDefecto: string) {
  const ruta = typeof valor === 'string' ? valor : ''
  return ruta.startsWith('/') && !ruta.startsWith('//') && !ruta.startsWith('/\\') ? ruta : porDefecto
}

export async function iniciarSesion(form: FormData) {
  const volver = rutaInterna(form.get('volver'), '/admin')
  const supabase = await supabaseServidor()
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get('email') ?? ''),
    password: String(form.get('password') ?? ''),
  })
  if (error) redirect(`/admin/login?error=1&volver=${encodeURIComponent(volver)}`)
  redirect(volver)
}

export async function cerrarSesion(form: FormData) {
  const supabase = await supabaseServidor()
  await supabase.auth.signOut()
  redirect(rutaInterna(form.get('volver'), '/admin/login'))
}
