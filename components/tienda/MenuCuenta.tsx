'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { cerrarSesion } from '@/app/admin/acciones-sesion'
import type { Rol } from '@/lib/tipos'
import { BotonConfirmar } from '@/components/DialogoConfirmacion'

const NOMBRE_ROL: Record<Rol, string> = { dueno: 'Dueño', empleado: 'Empleado', cliente: 'Cliente' }

function IconoCuenta() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  )
}

/** Sin sesión: ícono que lleva al login. Con sesión: menú con accesos al panel y cerrar sesión. */
export function MenuCuenta({ cuenta }: { cuenta: { nombre: string; rol: Rol } | null }) {
  const ruta = usePathname()
  const [abierto, setAbierto] = useState(false)
  const contenedor = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => { if (!contenedor.current?.contains(e.target as Node)) setAbierto(false) }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAbierto(false); boton.current?.focus() } }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('pointerdown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  if (!cuenta) {
    return (
      <Link href={`/admin/login?volver=${encodeURIComponent(ruta)}`} className="boton-sec px-3 sm:px-4">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
        </svg>
        <span className="sm:hidden">Entrar</span>
        <span className="hidden sm:inline">Iniciar sesión</span>
      </Link>
    )
  }

  const esStaff = cuenta.rol === 'dueno' || cuenta.rol === 'empleado'
  const opcion = 'block rounded-lg px-3 py-2 text-left text-sm transition-colors duration-200 hover:bg-dorado-claro'
  return (
    <div ref={contenedor} className="relative">
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        aria-controls="menu-cuenta"
        aria-label={`Cuenta de ${cuenta.nombre}`}
        title="Mi cuenta"
        className="boton-sec h-10 w-10 px-0"
      >
        <IconoCuenta />
      </button>
      {/* Siempre montado para poder animar la apertura y el cierre; cerrado queda inerte (sin foco ni clics). */}
      <div
        id="menu-cuenta"
        inert={!abierto}
        className={`absolute right-0 top-full z-30 mt-2 w-64 origin-top-right rounded-2xl border border-linea bg-vidrio p-1.5 shadow-[0_16px_36px_-14px_rgb(0_0_0/0.35)] transition-[opacity,scale,translate,visibility] duration-300 ease-elegante ${abierto ? 'visible scale-100 opacity-100' : 'invisible -translate-y-1 scale-95 opacity-0'}`}
      >
        <div className="border-b border-linea px-3 pb-2 pt-1.5">
          <p className="truncate font-medium">{cuenta.nombre}</p>
          <p className="text-sm text-humo">{NOMBRE_ROL[cuenta.rol]}</p>
        </div>
        <nav className="mt-1.5 space-y-0.5">
          {esStaff && <Link href="/admin" className={opcion} onClick={() => setAbierto(false)}>Panel de administración</Link>}
          {cuenta.rol === 'dueno' && <Link href="/admin/configuracion" className={opcion} onClick={() => setAbierto(false)}>Configuración</Link>}
          <form action={cerrarSesion}>
            <input type="hidden" name="volver" value={ruta} />
            <BotonConfirmar className={`${opcion} w-full text-humo`} titulo="¿Cerrar sesión?" mensaje="Tendrás que volver a iniciar sesión para entrar a tu cuenta." confirmar="Cerrar sesión">Cerrar sesión</BotonConfirmar>
          </form>
        </nav>
      </div>
    </div>
  )
}
