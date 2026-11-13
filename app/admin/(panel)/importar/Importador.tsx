'use client'

import { EnlacePanel } from '@/components/admin/Carga'
import { useEffect, useRef, useState, useTransition } from 'react'
import { textoResultado } from '@/lib/inventario/flujo'
import { ETIQUETA_CAMPO, type Campo, type ErrorFila, type Mapeo } from '@/lib/inventario/importador'
import type { Analisis, ResultadoImportacion, ResumenPlan } from '@/lib/inventario/procesar'
import { subirReporte } from './acciones'

const CAMPOS: Campo[] = ['codigo', 'nombre', 'marca', 'stock', 'precio_usd']
const AYUDA: Partial<Record<Campo, string>> = {
  codigo: 'Recomendado. Si falta, se empareja por nombre.',
  precio_usd: 'Si no la eliges, se conserva el precio actual.',
}

export interface Conteos {
  actualizados: number
  nuevos: number
  porRevisar: number
  ocultados: number
  errores: ErrorFila[]
}

/** Resultado que llega ya resuelto desde el servidor (por ejemplo, tras "Compartir" desde el celular). */
export type Inicial = { tipo: 'listo'; conteos: Conteos } | { tipo: 'al-dia' } | { tipo: 'error'; error: string }

type Estado =
  | { tipo: 'inicio' }
  | { tipo: 'listo'; conteos: Conteos }
  | Exclude<ResultadoImportacion, { tipo: 'aplicado' }>

const conteosDe = (r: ResumenPlan): Conteos => ({
  actualizados: r.actualizar, nuevos: r.nuevos.length, porRevisar: r.revisar.length, ocultados: r.ocultar.length, errores: r.errores,
})

export function Importador({ inicial, pendiente: pendienteInicial }: { inicial?: Inicial; pendiente?: string }) {
  const [estado, setEstado] = useState<Estado>(inicial ?? { tipo: 'inicio' })
  const [archivo, setArchivo] = useState<File | null>(null)
  const [pendiente, setPendiente] = useState(pendienteInicial ?? '')
  const [mapeo, setMapeo] = useState<Mapeo>({})
  const [elegirColumnas, setElegirColumnas] = useState(false)
  const [cargando, iniciar] = useTransition()
  const [arrastrando, setArrastrando] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  function enviar(modo: 'auto' | 'vista' | 'aplicar', fuente: { archivo?: File | null; pendiente?: string } = { archivo, pendiente }, analisis?: Analisis) {
    iniciar(async () => {
      const f = new FormData()
      f.set('modo', modo)
      if (fuente.archivo) f.set('archivo', fuente.archivo)
      else if (fuente.pendiente) f.set('pendiente', fuente.pendiente)
      if (analisis) {
        f.set('mapeo', JSON.stringify(mapeo))
        f.set('filaEncabezado', String(analisis.filaEncabezado))
      }
      const r = await subirReporte(f)
      if (r.tipo === 'aplicado') {
        setEstado({ tipo: 'listo', conteos: conteosDe(r.resumen) })
        setPendiente('')
      } else {
        setEstado(r)
        if (r.tipo === 'columnas' || r.tipo === 'revisar') setMapeo(r.analisis.mapeo)
        setElegirColumnas(r.tipo === 'columnas')
      }
    })
  }

  // Reporte compartido desde el celular que quedó esperando revisión: se retoma solo.
  const retomado = useRef(false)
  useEffect(() => {
    if (pendienteInicial && !retomado.current) {
      retomado.current = true
      enviar('auto', { pendiente: pendienteInicial })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendienteInicial])

  function elegir(f: File | null | undefined) {
    if (!f) return
    setArchivo(f)
    setPendiente('')
    enviar('auto', { archivo: f })
  }

  const reiniciar = () => {
    setEstado({ tipo: 'inicio' })
    setArchivo(null)
    setPendiente('')
    if (input.current) input.current.value = ''
  }

  const conAnalisis = estado.tipo === 'columnas' || estado.tipo === 'revisar' ? estado.analisis : null
  const indice = (campo: Campo) => (mapeo[campo] ? conAnalisis?.cabeceras.indexOf(mapeo[campo]!) ?? -1 : -1)

  return (
    <div className="space-y-6">
      <label
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); elegir(e.dataTransfer.files?.[0]) }}
        className={`tarjeta flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed p-8 text-center transition-[border-color,background-color,scale] duration-300 ease-elegante active:scale-[0.99] sm:min-h-64 ${arrastrando ? 'border-dorado bg-dorado-claro' : 'hover:border-tinta/40'} ${cargando ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input
          ref={input}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => elegir(e.target.files?.[0])}
        />
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-dorado-claro text-dorado">
          {cargando ? (
            <svg className="h-8 w-8 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            </svg>
          )}
        </span>
        <span className="font-display text-3xl">{cargando ? 'Actualizando inventario…' : 'Elegir el reporte de inventario'}</span>
        <span className="text-sm text-humo" aria-live="polite">
          {cargando ? (archivo?.name ?? 'Reporte compartido') : archivo ? `${archivo.name} · toca para elegir otro` : 'Archivo .xlsx de inventario. Se procesa al elegirlo.'}
        </span>
      </label>

      {estado.tipo === 'error' && <p role="alert" className="rounded-lg bg-alerta/10 px-4 py-3 text-sm text-alerta">{estado.error}</p>}

      {estado.tipo === 'al-dia' && (
        <section role="status" className="tarjeta flex items-center gap-4 p-6">
          <Palomita />
          <div>
            <p className="font-display text-2xl">El inventario ya estaba al día con este reporte</p>
            <p className="text-sm text-humo">Es el mismo archivo que se importó la última vez; no se cambió nada.</p>
          </div>
        </section>
      )}

      {estado.tipo === 'listo' && <Confirmacion c={estado.conteos} onOtro={reiniciar} />}

      {estado.tipo === 'revisar' && estado.motivo && (
        <p role="status" className="rounded-lg bg-dorado-claro px-4 py-3 text-sm">{estado.motivo}</p>
      )}

      {conAnalisis && (elegirColumnas || estado.tipo === 'columnas') && (
        <section className="tarjeta animate-entrada space-y-5 p-6">
          <div>
            <h2 className="text-3xl">¿Qué columna es cada dato?</h2>
            <p className="text-sm text-humo">
              {conAnalisis.mapeoGuardado
                ? 'Usamos las mismas columnas de la última vez. Cámbialas solo si el reporte cambió de formato.'
                : 'Las elegimos automáticamente. Revisa que sean correctas: se guardan para que las próximas veces se aplique solo.'}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAMPOS.map((c) => (
              <label key={c}>
                <span className="etiqueta">{ETIQUETA_CAMPO[c]}{c === 'nombre' || c === 'stock' ? ' *' : ''}</span>
                <select className="campo" value={mapeo[c] ?? ''} onChange={(e) => setMapeo({ ...mapeo, [c]: e.target.value || null })}>
                  <option value="">No usar</option>
                  {conAnalisis.cabeceras.map((h) => <option key={h}>{h}</option>)}
                </select>
                {AYUDA[c] && <span className="mt-1 block text-xs text-humo">{AYUDA[c]}</span>}
              </label>
            ))}
          </div>

          <div className="overflow-x-auto">
            <p className="etiqueta">Así se leen las primeras filas</p>
            <table className="tabla">
              <thead><tr>{CAMPOS.map((c) => <th key={c}>{ETIQUETA_CAMPO[c]}</th>)}</tr></thead>
              <tbody>
                {conAnalisis.muestra.map((fila, i) => (
                  <tr key={i}>{CAMPOS.map((c) => <td key={c}>{indice(c) >= 0 ? String(fila[indice(c)] ?? '') : <span className="text-humo">—</span>}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="boton" disabled={cargando || !mapeo.nombre || !mapeo.stock} onClick={() => enviar('vista', undefined, conAnalisis)}>
            Ver qué va a cambiar
          </button>
        </section>
      )}

      {estado.tipo === 'revisar' && (
        <VistaPrevia
          r={estado.resumen}
          cargando={cargando}
          onAplicar={() => enviar('aplicar', undefined, estado.analisis)}
          onColumnas={elegirColumnas ? undefined : () => setElegirColumnas(true)}
        />
      )}
    </div>
  )
}

function Confirmacion({ c, onOtro }: { c: Conteos; onOtro: () => void }) {
  return (
    <section role="status" className="tarjeta animate-entrada space-y-4 p-6">
      <div className="flex items-start gap-4">
        <Palomita />
        <p className="font-display text-2xl leading-snug sm:text-3xl">{textoResultado(c)}</p>
      </div>
      {(c.porRevisar > 0 || c.nuevos > 0) && (
        <div className="flex flex-wrap gap-2">
          {c.porRevisar > 0 && <EnlacePanel href="/admin/importar/revision" className="boton">Revisar {c.porRevisar} {c.porRevisar === 1 ? 'fila' : 'filas'}</EnlacePanel>}
          {c.nuevos > 0 && <EnlacePanel href="/admin/productos?estado=borrador" className="boton-sec">Completar {c.nuevos === 1 ? 'el producto nuevo' : `los ${c.nuevos} nuevos`}</EnlacePanel>}
        </div>
      )}
      <Lista titulo="Filas con error (no se importaron)" items={c.errores.map((x) => `Fila ${x.fila}: ${x.motivo}`)} />
      <button className="text-sm text-humo underline-offset-4 hover:underline" onClick={onOtro}>Subir otro reporte</button>
    </section>
  )
}

function VistaPrevia({ r, onAplicar, onColumnas, cargando }: { r: ResumenPlan; onAplicar: () => void; onColumnas?: () => void; cargando: boolean }) {
  return (
    <section className="tarjeta animate-entrada space-y-5 p-6">
      <div>
        <h2 className="text-3xl">Esto es lo que va a cambiar</h2>
        <p className="text-sm text-humo">{r.filas} filas leídas del reporte.</p>
      </div>

      {r.avisos.map((a) => <p key={a} className="rounded-lg bg-dorado-claro px-4 py-3 text-sm">{a}</p>)}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Cifra t="Se actualizan" v={r.actualizar} n={r.porNombre ? `${r.porNombre} por nombre` : undefined} />
        <Cifra t="Nuevos (borrador)" v={r.nuevos.length} />
        <Cifra t="Por revisar" v={r.revisar.length} />
        <Cifra t="Se ocultan" v={r.ocultar.length} n="No vinieron en el reporte" />
        <Cifra t="Con error" v={r.errores.length} />
      </dl>

      <Lista titulo="Se ocultarán de la tienda" items={r.ocultar.map((x) => x.nombre)} />
      <Lista titulo="Por revisar: una persona decide" items={r.revisar.map((x) => `Fila ${x.fila}: ${x.nombre}${x.candidato ? ` ↔ ${x.candidato}` : ''} (${x.motivo})`)} />
      <Lista titulo="Productos nuevos" items={r.nuevos.map((x) => `Fila ${x.fila}: ${x.nombre}`)} />
      <Lista titulo="Filas con error (no se importan)" items={r.errores.map((x) => `Fila ${x.fila}: ${x.motivo}`)} />

      <div className="flex flex-wrap items-center gap-3">
        <button className="boton" disabled={cargando} onClick={onAplicar}>{cargando ? 'Aplicando…' : 'Aplicar cambios'}</button>
        {onColumnas && <button className="text-sm text-humo underline-offset-4 hover:underline" onClick={onColumnas}>Revisar las columnas</button>}
      </div>
    </section>
  )
}

function Palomita() {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ok/10 text-ok">
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray="24" className="animate-trazo" />
      </svg>
    </span>
  )
}

function Cifra({ t, v, n }: { t: string; v: number; n?: string }) {
  return (
    <div className="rounded-xl bg-niebla p-3">
      <dt className="text-xs text-humo">{t}</dt>
      <dd className="font-display text-2xl tabular-nums">{v}</dd>
      {n && <dd className="text-xs text-humo">{n}</dd>}
    </div>
  )
}

function Lista({ titulo, items }: { titulo: string; items: string[] }) {
  if (!items.length) return null
  return (
    <details>
      <summary className="cursor-pointer text-sm font-medium">{titulo} ({items.length})</summary>
      <ul className="mt-2 max-h-60 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-humo">
        {items.slice(0, 300).map((x, i) => <li key={i}>{x}</li>)}
      </ul>
    </details>
  )
}
