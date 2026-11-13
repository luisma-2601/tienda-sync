import type { Metadata } from 'next'
import Link from 'next/link'
import { supabaseServidor } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cerrarSesion } from '../acciones-sesion'
import { BotonTema } from '@/components/BotonTema'
import { MenuPanel } from '@/components/admin/MenuPanel'
import { BarraCarga } from '@/components/admin/Carga'
import { BotonConfirmar } from '@/components/DialogoConfirmacion'
import { marca } from '@/marca.config'

export const metadata: Metadata = {
  title: 'Panel',
  robots: { index: false },
  // iPhone: "Agregar a inicio" abre el panel como app, con su ícono.
  appleWebApp: { capable: true, title: marca.nombrePanel, statusBarStyle: 'default' },
  icons: { apple: '/apple-touch-icon.png' },
}

const MENU = [
  { href: '/admin', texto: 'Resumen', roles: ['dueno', 'empleado'] },
  { href: '/admin/importar', texto: 'Actualizar inventario', roles: ['dueno', 'empleado'] },
  { href: '/admin/productos', texto: 'Productos', roles: ['dueno', 'empleado'] },
  { href: '/admin/pedidos', texto: 'Pedidos web', roles: ['dueno'] },
  { href: '/admin/configuracion', texto: 'Configuración', roles: ['dueno'] },
]

const ZONA = 'America/Caracas'
const dia = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA })
const hora = new Intl.DateTimeFormat('es-VE', { timeStyle: 'short', timeZone: ZONA })
const fechaCorta = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', timeZone: ZONA })

/** "hoy a las 3:45 p. m." o "el 18 oct a las 3:45 p. m.", en hora de Caracas. */
function cuando(iso: string) {
  const f = new Date(iso)
  const hoy = dia.format(f) === dia.format(new Date())
  return `${hoy ? 'hoy' : `el ${fechaCorta.format(f)}`} a las ${hora.format(f)}`
}

const SALIR = { titulo: '¿Cerrar sesión?', mensaje: 'Tendrás que volver a iniciar sesión para entrar al panel.', confirmar: 'Cerrar sesión' }

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServidor()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) redirect('/admin/login')
  const { data: perfil } = await supabase.from('perfiles').select('nombre, rol').eq('id', data.claims.sub).single()

  if (!perfil || perfil.rol === 'cliente') {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-4xl">Esta cuenta no tiene acceso al panel.</h1>
        <p className="mt-3 text-humo">Pídele al dueño que te asigne el rol de empleado en Configuración.</p>
        <form action={cerrarSesion} className="mt-6"><BotonConfirmar className="boton-sec" {...SALIR}>Cerrar sesión</BotonConfirmar></form>
      </main>
    )
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <BarraCarga />
      <aside className="border-b border-linea bg-vidrio lg:min-h-screen lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between px-5 py-4 lg:block">
          <Link href="/" className="font-display text-3xl" aria-label="Ir a la tienda" title="Ir a la tienda">B<span className="italic text-dorado">&amp;</span>V</Link>
          <div className="flex items-center gap-2 lg:mt-1 lg:justify-between">
            <p className="text-sm text-humo">{perfil.nombre ?? 'Panel'} · {perfil.rol === 'dueno' ? 'Dueño' : 'Empleado'}</p>
            <form action={cerrarSesion}>
              <BotonConfirmar aria-label="Cerrar sesión" title="Cerrar sesión" className="flex h-9 w-9 items-center justify-center rounded-lg text-humo hover:bg-niebla hover:text-tinta" {...SALIR}>
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
              </BotonConfirmar>
            </form>
          </div>
        </div>
        <MenuPanel opciones={MENU.filter((m) => m.roles.includes(perfil.rol)).map(({ href, texto }) => ({ href, texto }))}>
          <BotonTema variante="menu" />
        </MenuPanel>
        {process.env.TIENDA_ACTUALIZADO_EN && (
          <p className="px-5 pb-3 text-xs text-humo lg:pt-4" title={process.env.TIENDA_VERSION ? `Versión ${process.env.TIENDA_VERSION}` : undefined}>
            Última actualización {cuando(process.env.TIENDA_ACTUALIZADO_EN)}
          </p>
        )}
      </aside>
      <main className="px-4 py-8 lg:px-10">{children}</main>
    </div>
  )
}
