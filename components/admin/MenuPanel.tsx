'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ViewTransition } from 'react'
import { BrilloCarga } from './Carga'

export interface OpcionMenu {
  href: string
  texto: string
}

/**
 * Pestañas del panel. Marca la activa con una barra dorada que se desliza a la nueva al cambiar,
 * y le dice a la página si se avanza o se retrocede en el menú (ver app/admin/(panel)/template.tsx).
 */
export function MenuPanel({ opciones, children }: { opciones: OpcionMenu[]; children?: React.ReactNode }) {
  const ruta = usePathname()
  const activa = opciones.findIndex((o) => (o.href === '/admin' ? ruta === '/admin' : ruta.startsWith(o.href)))

  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:pb-0">
      {opciones.map((o, i) => {
        const esActiva = i === activa
        return (
          <Link
            key={o.href}
            href={o.href}
            transitionTypes={[i >= activa ? 'pestana-adelante' : 'pestana-atras']}
            aria-current={esActiva ? 'page' : undefined}
            className={`relative shrink-0 rounded-lg px-3 py-2 text-sm transition-[background-color,color,scale] duration-300 ease-elegante active:scale-[0.97] ${esActiva ? 'bg-niebla font-medium text-tinta' : 'text-humo hover:bg-niebla/60 hover:text-tinta'}`}
          >
            {esActiva && (
              <ViewTransition name="pestana-activa" share="indicador" default="none">
                <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-dorado lg:inset-x-auto lg:inset-y-2 lg:left-0 lg:h-auto lg:w-0.5" />
              </ViewTransition>
            )}
            {o.texto}
            <BrilloCarga />
          </Link>
        )
      })}
      {children}
    </nav>
  )
}
