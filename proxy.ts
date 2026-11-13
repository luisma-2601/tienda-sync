import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Refresca la sesión de Supabase y protege /admin.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        lista.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        lista.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const { data } = await supabase.auth.getClaims()
  const ruta = request.nextUrl.pathname
  if (ruta.startsWith('/admin') && ruta !== '/admin/login' && !data?.claims) {
    // Tras entrar, vuelve a donde iba. Si llegó un reporte por "Compartir", el archivo no sobrevive
    // al inicio de sesión: vuelve a la pantalla de importar y el login avisa que lo comparta de nuevo.
    const compartir = ruta === '/admin/compartir'
    const url = new URL('/admin/login', request.url)
    url.searchParams.set('volver', compartir ? '/admin/importar' : ruta + request.nextUrl.search)
    if (compartir) url.searchParams.set('compartir', '1')
    // 303: el navegador sigue con GET (un 307 reenviaría el POST del archivo compartido al login).
    return NextResponse.redirect(url, 303)
  }
  return response
}

export const config = {
  matcher: ['/admin/:path*'],
}
