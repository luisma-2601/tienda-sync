'use client'

import { useEffect, useState } from 'react'

// Evento de Chrome/Android cuando la página se puede instalar como app.
type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

/**
 * Aviso discreto para instalar el panel. En Android, la app instalada aparece en "Compartir":
 * desde el sistema administrativo se comparte el reporte con el panel instalado y el inventario se actualiza solo.
 * En iPhone no existe esa opción: se instala con "Agregar a inicio" y el archivo se elige aquí.
 */
export function AvisoInstalar() {
  const [modo, setModo] = useState<'ninguno' | 'android' | 'iphone'>('ninguno')
  const [evento, setEvento] = useState<EventoInstalar | null>(null)

  useEffect(() => {
    const instalada = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (instalada) return
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      setModo('iphone')
      return
    }
    const alPoder = (e: Event) => {
      e.preventDefault()
      setEvento(e as EventoInstalar)
      setModo('android')
    }
    const alInstalar = () => setModo('ninguno')
    window.addEventListener('beforeinstallprompt', alPoder)
    window.addEventListener('appinstalled', alInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', alPoder)
      window.removeEventListener('appinstalled', alInstalar)
    }
  }, [])

  if (modo === 'ninguno') return null
  return (
    <p className="animate-entrada text-sm text-humo">
      {modo === 'android' ? (
        <>
          Instala el panel en tu celular para actualizar el inventario con Compartir.{' '}
          <button
            className="font-medium text-dorado underline-offset-4 hover:underline"
            onClick={async () => {
              await evento?.prompt()
              setModo('ninguno')
            }}
          >
            Instalar
          </button>
        </>
      ) : (
        'En iPhone: toca Compartir › "Agregar a inicio" para tener el panel a mano, y elige el reporte desde aquí.'
      )}
    </p>
  )
}
