import { createClient } from '@supabase/supabase-js'

/**
 * Cliente con la service role: salta RLS. Solo para tareas del servidor sin sesión de usuario
 * (el lote de fichas con IA que llama pg_cron). Nunca importarlo desde un componente de cliente.
 */
export function supabaseServicio() {
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!clave) throw new Error('Falta configurar SUPABASE_SERVICE_ROLE_KEY')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, clave, { auth: { persistSession: false, autoRefreshToken: false } })
}
