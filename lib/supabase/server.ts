import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/** Cliente de Supabase para componentes de servidor, acciones y rutas. Respeta RLS con la sesión del usuario. */
export async function supabaseServidor() {
  const cookieStore = await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (lista) => {
        try {
          lista.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Llamado desde un componente de servidor: el proxy se encarga de refrescar la sesión.
        }
      },
    },
  })
}
