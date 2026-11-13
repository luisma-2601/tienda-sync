import type { Metadata } from 'next'
import Link from 'next/link'
import { TiendaProvider } from '@/components/tienda/TiendaContexto'
import { BotonCarrito, BotonSonido } from '@/components/tienda/Piezas'
import { supabaseServidor } from '@/lib/supabase/server'
import { formatoBs } from '@/lib/precios'
import { BotonTema } from '@/components/BotonTema'
import { MenuCuenta } from '@/components/tienda/MenuCuenta'
import type { Rol } from '@/lib/tipos'
import { marca } from '@/marca.config'

// El manifest (app/manifest.ts) es del panel: que la tienda no ofrezca instalar el panel a los clientes.
export const metadata: Metadata = { manifest: null }

export default async function TiendaLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServidor()
  const [{ data: cfg }, { data: sesion }] = await Promise.all([
    supabase.from('configuracion_publica').select('tasa_bcv, tasa_actualizada_en').single(),
    supabase.auth.getClaims(),
  ])

  let cuenta: { nombre: string; rol: Rol } | null = null
  if (sesion?.claims) {
    const { data: perfil } = await supabase.from('perfiles').select('nombre, rol').eq('id', sesion.claims.sub).single()
    cuenta = { nombre: perfil?.nombre || String(sesion.claims.email ?? 'Mi cuenta'), rol: (perfil?.rol as Rol) ?? 'cliente' }
  }

  return (
    <TiendaProvider>
      <header className="sticky top-0 z-20 border-b border-dorado/40 bg-niebla/90 backdrop-blur">
        {cfg?.tasa_bcv ? (
          <p className="bg-dorado-claro px-4 py-1 text-center text-xs text-tinta">
            Tasa BCV: <span className="font-medium tabular-nums">{formatoBs(Number(cfg.tasa_bcv))}</span> por dólar
          </p>
        ) : null}
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="font-display text-3xl leading-none tracking-tight" aria-label={`${marca.nombreCorto}, inicio`}>
            {marca.nombreCorto}
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <BotonSonido />
            <BotonTema />
            <MenuCuenta cuenta={cuenta} />
            <BotonCarrito />
          </div>
        </div>
      </header>

      <main className="mx-auto min-h-[70vh] max-w-6xl px-4 pb-16">{children}</main>

      <footer className="border-t border-dorado/40">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm text-humo sm:grid-cols-3">
          <div>
            <p className="font-display text-2xl text-tinta">{marca.nombre}</p>
            <p>{[marca.direccion, marca.entrega].filter(Boolean).join('. ')}</p>
          </div>
          <div>
            <p className="font-medium text-tinta">Pagos</p>
            <p>{marca.pagos}</p>
          </div>
          <div>
            <p className="font-medium text-tinta">Tasa BCV de hoy</p>
            <p className="tabular-nums">{cfg?.tasa_bcv ? formatoBs(Number(cfg.tasa_bcv)) + ' por dólar' : 'No disponible'}</p>
          </div>
        </div>
      </footer>
    </TiendaProvider>
  )
}
