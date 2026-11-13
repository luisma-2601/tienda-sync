import { NextResponse, type NextRequest } from 'next/server'
import { sesionActual } from '@/lib/admin'
import { guardarPendiente, importarReporte } from '@/lib/inventario/procesar'

// Destino de "Compartir" en Android (share_target del manifest en app/manifest.ts): desde el sistema administrativo se
// comparte el reporte con el panel instalado y llega aquí. Mismo flujo que /admin/importar (lib/inventario/procesar.ts).
// Siempre responde con 303 para que el navegador termine en una página normal (GET) y no reenvíe el archivo.

const ir = (req: NextRequest, ruta: string) => NextResponse.redirect(new URL(ruta, req.url), 303)

export async function POST(req: NextRequest) {
  const sesion = await sesionActual()
  if (!sesion) return ir(req, '/admin/login?volver=/admin/importar&compartir=1')
  const { supabase, perfil } = sesion
  if (!perfil || (perfil.rol !== 'dueno' && perfil.rol !== 'empleado')) return ir(req, '/admin?sin-permiso=1')

  let archivo: File | null = null
  try {
    const form = await req.formData()
    const valor = form.get('archivo')
    if (valor instanceof File && valor.size > 0) archivo = valor
  } catch {
    // Formulario inválido: se trata como "sin archivo".
  }
  if (!archivo) return ir(req, `/admin/importar?error=${encodeURIComponent('No llegó ningún archivo. Comparte el reporte de inventario (.xlsx).')}`)

  const reporte = { nombre: archivo.name, bytes: await archivo.arrayBuffer() }
  const r = await importarReporte(supabase, perfil.id, reporte, { modo: 'auto' })

  switch (r.tipo) {
    case 'aplicado':
      return ir(req, `/admin/importar?listo=${r.importacionId}`)
    case 'al-dia':
      return ir(req, '/admin/importar?al-dia=1')
    case 'error':
      return ir(req, `/admin/importar?error=${encodeURIComponent(r.error)}`)
    default: {
      // Necesita revisión (o elegir columnas): se guarda el archivo y la pantalla lo retoma.
      try {
        const id = await guardarPendiente(supabase, perfil.id, reporte)
        return ir(req, `/admin/importar?pendiente=${id}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'No se pudo guardar el reporte.'
        return ir(req, `/admin/importar?error=${encodeURIComponent(`${msg} Elígelo desde aquí.`)}`)
      }
    }
  }
}

// Abrir la dirección a mano (o volver tras iniciar sesión) lleva a la pantalla normal.
export function GET(req: NextRequest) {
  return ir(req, '/admin/importar')
}
