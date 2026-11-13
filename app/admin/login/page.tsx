import type { Metadata } from 'next'
import { FormularioConservado } from '@/components/FormularioConservado'
import { iniciarSesion } from '../acciones-sesion'

export const metadata: Metadata = { title: 'Entrar al panel', robots: { index: false } }

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; volver?: string; compartir?: string }> }) {
  const { error, volver, compartir } = await searchParams
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <FormularioConservado action={iniciarSesion} className="tarjeta w-full max-w-sm space-y-4 p-8">
        <p className="font-display text-4xl">B<span className="italic text-dorado">&amp;</span>V</p>
        <h1 className="font-sans text-lg font-semibold">Entrar al panel</h1>
        {compartir && <p className="rounded-lg bg-dorado-claro px-3 py-2 text-sm">Inicia sesión y vuelve a compartir el reporte de inventario.</p>}
        {volver && <input type="hidden" name="volver" value={volver} />}
        <label className="block">
          <span className="etiqueta">Correo</span>
          <input name="email" type="email" required autoComplete="email" className="campo" />
        </label>
        <label className="block">
          <span className="etiqueta">Contraseña</span>
          <input name="password" type="password" required autoComplete="current-password" className="campo" />
        </label>
        {error && <p role="alert" className="text-sm text-alerta">Correo o contraseña incorrectos.</p>}
        <button className="boton w-full">Entrar</button>
      </FormularioConservado>
    </main>
  )
}
