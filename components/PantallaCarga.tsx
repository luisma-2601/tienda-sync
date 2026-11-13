'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Frasco } from '@/components/Frasco'

/** Tiempo mínimo que se ve la pantalla de carga, para que la animación del frasco se aprecie. */
const MINIMO_MS = 1000

// Estado compartido entre la capa (en el layout raíz) y los marcadores (en app/loading.tsx).
// `hasta` usa el reloj de performance.now(), que empieza en 0 al abrir la página: la primera carga cuenta desde ahí.
let cargas = 0
let hasta = MINIMO_MS
let oculta = false
const avisos = new Set<() => void>()
const avisar = () => avisos.forEach((f) => f())
const suscribir = (f: () => void) => { avisos.add(f); return () => { avisos.delete(f) } }

/** Lo monta app/loading.tsx: mientras exista, hay una carga en curso. */
export function MarcadorCarga() {
  useEffect(() => {
    // Si la capa ya se ocultó, es una navegación nueva: vuelve a contar el mínimo desde ahora.
    if (oculta) { hasta = performance.now() + MINIMO_MS; oculta = false }
    cargas++
    avisar()
    return () => { cargas--; avisar() }
  }, [])
  return null
}

/** Capa con el frasco: visible al abrir el sitio y en cada carga, durante al menos MINIMO_MS. */
export function PantallaCarga() {
  const enCurso = useSyncExternalStore(suscribir, () => cargas > 0 || !oculta, () => true)
  const [vuelta, setVuelta] = useState(0)
  const primera = useRef(true)

  useEffect(() => {
    if (!enCurso) return
    // En cada navegación se vuelve a montar el frasco para que caiga de nuevo (en la primera carga ya está cayendo).
    if (primera.current) primera.current = false
    else setVuelta((v) => v + 1)
    let reloj: ReturnType<typeof setTimeout>
    const revisar = () => {
      if (oculta) return
      const falta = hasta - performance.now()
      if (cargas > 0) return // al terminar la carga, el marcador avisa y se revisa de nuevo
      if (falta > 0) { reloj = setTimeout(revisar, falta); return }
      oculta = true
      avisar()
    }
    revisar()
    const quitar = suscribir(() => { clearTimeout(reloj); revisar() })
    return () => { clearTimeout(reloj); quitar() }
  }, [enCurso])

  return (
    <div
      aria-hidden={!enCurso}
      inert={!enCurso}
      className={`pantalla-carga fixed inset-0 z-50 flex flex-col items-center justify-center bg-niebla px-4 text-center transition-[opacity,visibility] duration-400 ease-elegante ${enCurso ? 'visible opacity-100' : 'invisible opacity-0'}`}
    >
      {/* Sigue montado mientras se desvanece, para que no desaparezca de golpe. */}
      <div key={vuelta}>
        <Frasco continuo />
        <p className="mt-8 animate-entrada font-display text-4xl [animation-delay:0.6s] sm:text-5xl">Cargando…</p>
      </div>
    </div>
  )
}
