'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import type { EstadoLoteIA } from '@/lib/fichas-lote'
import { detenerLoteIA, estadoLoteIA, iniciarLoteIA } from './acciones-ia'

/** Cada cuánto se consulta el avance mientras el lote está encendido. */
const CONSULTA_MS = 8_000

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })

/**
 * Fichas con IA: el dueño enciende el lote y el servidor lo avanza solo, uno por uno y con pausa entre llamadas
 * (la capa gratuita de Gemini limita las peticiones por minuto). Se puede cerrar la página. Todo queda en borrador.
 */
export function LoteIA({ inicial }: { inicial: EstadoLoteIA }) {
  const router = useRouter()
  const [estado, setEstado] = useState(inicial)
  const [ocupado, empezar] = useTransition()
  const [sinConexion, setSinConexion] = useState(false)
  const estabaActivo = useRef(inicial.activo)

  // Mientras está encendido, se consulta el avance. Al terminar se refresca la tabla de productos.
  useEffect(() => {
    if (!estado.activo) return
    const tic = setInterval(async () => {
      try {
        setEstado(await estadoLoteIA())
        setSinConexion(false)
      } catch {
        setSinConexion(true)
      }
    }, CONSULTA_MS)
    return () => clearInterval(tic)
  }, [estado.activo])

  useEffect(() => {
    if (estabaActivo.current && !estado.activo) router.refresh()
    estabaActivo.current = estado.activo
  }, [estado.activo, router])

  const accion = (f: () => Promise<EstadoLoteIA>) => empezar(async () => setEstado(await f()))

  const { activo, pausaHasta, aviso, sinFicha, lote } = estado
  const hechos = lote ? lote.alta + lote.media + lote.baja + lote.error : 0
  // Los que fallaron en este lote siguen sin ficha, pero ya no se intentan hasta el próximo.
  const restantes = Math.max(0, sinFicha - (lote?.error ?? 0))
  const total = hechos + restantes
  const progreso = total ? Math.round((hechos / total) * 100) : 0

  const texto = activo
    ? pausaHasta
      ? `En pausa por el límite de la IA. Se retoma solo a las ${hora(pausaHasta)}.`
      : `Trabajando en segundo plano: puedes cerrar esta página. ${restantes === 1 ? 'Falta 1 producto' : `Faltan ${restantes} productos`}.`
    : sinFicha > 0
      ? `${sinFicha} ${sinFicha === 1 ? 'producto sin ficha' : 'productos sin ficha'}. Toca el botón y se completan solas, aunque cierres el panel. Quedan en borrador para que las revises.`
      : 'Todos los productos tienen ficha.'

  return (
    <section className="tarjeta space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl">Fichas con IA</h2>
          <p className="text-sm text-humo">{texto}</p>
        </div>
        {activo ? (
          <button type="button" className="boton-sec" onClick={() => accion(detenerLoteIA)} disabled={ocupado}>
            {ocupado ? 'Deteniendo…' : 'Detener'}
          </button>
        ) : (
          <button type="button" className="boton" onClick={() => accion(iniciarLoteIA)} disabled={sinFicha === 0 || ocupado}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
            </svg>
            {ocupado ? 'Encendiendo…' : 'Completar fichas con IA'}
          </button>
        )}
      </div>

      {lote && total > 0 && (
        <div className="space-y-3">
          <div className="h-2 overflow-hidden rounded-full bg-niebla" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={hechos} aria-label="Progreso de las fichas">
            <div className="h-full rounded-full bg-dorado transition-[width] duration-500 ease-elegante" style={{ width: `${progreso}%` }} />
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="tabular-nums text-humo">{hechos} de {total}</span>
            <Pildora tono="ok">{lote.alta} confianza alta</Pildora>
            <Pildora tono="dorado">{lote.media} media</Pildora>
            <Pildora tono="alerta">{lote.baja} baja</Pildora>
            {lote.error > 0 && <Pildora tono="alerta">{lote.error} con error</Pildora>}
          </div>
          {lote.recientes.length > 0 && (
            <ul className="space-y-1 text-sm">
              {lote.recientes.map((r, i) => (
                <li key={`${r.nombre}-${i}`} className="flex animate-entrada justify-between gap-3">
                  <span className="min-w-0 truncate">{r.nombre}</span>
                  <span className={`max-w-[65%] text-right break-words ${{ ok: 'text-ok', dorado: 'text-dorado', alerta: 'text-alerta' }[r.tono]}`}>{r.detalle}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {sinConexion && <p role="status" className="text-sm text-humo">Sin conexión con el panel; el lote sigue en el servidor.</p>}
      {aviso && <p role="alert" className="rounded-lg bg-dorado-claro px-4 py-3 text-sm text-tinta">{aviso}</p>}
      {!activo && !aviso && lote && hechos > 0 && (
        <p role="status" className="rounded-lg bg-ok/10 px-4 py-3 text-sm text-ok">
          {restantes === 0 ? 'Listo.' : `Se detuvo con ${restantes} por hacer; toca el botón para seguir.`} Revisa las fichas en borrador y apruébalas.
          {lote.error > 0 && ' Los que tuvieron error siguen sin ficha: toca el botón para reintentarlos.'}
        </p>
      )}
    </section>
  )
}

function Pildora({ tono, children }: { tono: 'ok' | 'dorado' | 'alerta'; children: React.ReactNode }) {
  const color = { ok: 'bg-ok/10 text-ok', dorado: 'bg-dorado-claro text-dorado', alerta: 'bg-alerta/10 text-alerta' }[tono]
  return <span className={`rounded-full px-2.5 py-0.5 font-medium tabular-nums ${color}`}>{children}</span>
}
