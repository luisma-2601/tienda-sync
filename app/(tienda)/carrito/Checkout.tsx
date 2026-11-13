'use client'

import Link from 'next/link'
import { startTransition, useEffect, useRef, useState, useTransition, ViewTransition } from 'react'
import { tope, useTienda, type ItemCarrito } from '@/components/tienda/TiendaContexto'
import { SelectorMoneda } from '@/components/tienda/Piezas'
import { DialogoConfirmacion } from '@/components/DialogoConfirmacion'
import { Frasco } from '@/components/Frasco'
import { sonar } from '@/lib/sonidos'
import { calcularPrecioBs, formatoBs, formatoPrecio, formatoUsd } from '@/lib/precios'
import type { ConfigPublica, MetodoPago, ZonaDelivery } from '@/lib/tipos'
import { enviarPedido, revisarCarrito } from './acciones'

export function Checkout({ config, metodos, zonas }: { config: ConfigPublica; metodos: MetodoPago[]; zonas: ZonaDelivery[] }) {
  const { items, moneda, cambiarCantidad, quitar, ajustar, vaciar, listo } = useTienda()
  const [entrega, setEntrega] = useState<'retiro' | 'delivery'>('retiro')
  const [zonaId, setZonaId] = useState('')
  const [metodo, setMetodo] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Al quitar el último producto, el carrito espera a que termine su caída antes de mostrarse vacío.
  const [vaciando, setVaciando] = useState(false)
  const [enviando, iniciar] = useTransition()
  const [porQuitar, setPorQuitar] = useState<string | null>(null)
  const [ajustes, setAjustes] = useState<string[]>([])

  // El carrito vive en el navegador y puede tener días: se compara con el inventario de ahora.
  // Devuelve si hubo que cambiar algo.
  async function revisarInventario(actuales: ItemCarrito[]) {
    if (!actuales.length) return false
    const limites = await revisarCarrito(actuales.map((i) => ({ tipo: i.tipo, id: i.id })))
    if (!limites) return false
    const avisos = avisosDeAjuste(actuales, limites)
    setAjustes(avisos)
    ajustar(limites)
    return avisos.length > 0
  }
  const revisado = useRef(false)
  useEffect(() => {
    if (!listo || revisado.current) return
    revisado.current = true
    revisarInventario(items)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una sola vez, con el carrito recién cargado
  }, [listo])

  const bs = (usd: number) => calcularPrecioBs(usd, config)
  const precio = (usd: number) => formatoPrecio(moneda, usd, bs(usd))
  const metodosMoneda = metodos.filter((m) => m.moneda === moneda)
  const metodoValido = metodosMoneda.some((m) => m.id === metodo) ? metodo : ''
  const zona = zonas.find((z) => z.id === zonaId)
  const subtotalUsd = items.reduce((s, i) => s + i.precio_usd * i.cantidad, 0)
  const deliveryUsd = entrega === 'delivery' ? (zona?.costo_usd ?? 0) : 0
  const totalUsd = subtotalUsd + deliveryUsd
  const totalBs = items.reduce((s, i) => s + (bs(i.precio_usd) ?? 0) * i.cantidad, 0) + (bs(deliveryUsd) ?? 0)
  // Dentro de una transición, React anima la salida del producto y el reacomodo de la lista.
  const quitarSuave = (clave: string) => {
    sonar('quitar')
    const ultimo = items.length === 1
    startTransition(() => {
      if (ultimo) setVaciando(true)
      quitar(clave)
    })
    if (ultimo) setTimeout(() => startTransition(() => setVaciando(false)), 650)
  }

  if (!listo) return <div className="py-24" />

  const avisoAjustes = ajustes.length > 0 && (
    <div role="status" className="rounded-xl border border-dorado/40 bg-dorado-claro px-4 py-3 text-left text-sm text-tinta">
      <p className="font-medium">Actualizamos tu carrito según el inventario de hoy:</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">{ajustes.map((a) => <li key={a}>{a}</li>)}</ul>
    </div>
  )

  if (items.length === 0 && !vaciando) {
    return (
      <div className="py-20 text-center">
        {avisoAjustes && <div className="mx-auto mb-10 max-w-lg">{avisoAjustes}</div>}
        <Frasco />
        <h1 className="mt-6 animate-entrada text-5xl [animation-delay:0.6s]">Tu carrito está vacío.</h1>
        <p className="mt-3 animate-entrada text-humo [animation-delay:0.75s]">Explora el catálogo y agrega los perfumes que quieras pedir.</p>
        <Link href="/" className="boton mt-8 animate-entrada [animation-delay:0.9s]">Ver perfumes</Link>
      </div>
    )
  }

  function enviar(form: FormData) {
    setError(null)
    iniciar(async () => {
      const r = await enviarPedido({
        items: items.map((i) => ({ tipo: i.tipo, id: i.id, cantidad: i.cantidad })),
        moneda,
        metodo: metodoValido,
        nombre: String(form.get('nombre') ?? ''),
        telefono: String(form.get('telefono') ?? ''),
        entrega,
        zonaId: entrega === 'delivery' ? zonaId : null,
        direccion: String(form.get('direccion') ?? ''),
      })
      if (!r.ok) {
        // Si el inventario cambió mientras tanto, el carrito se corrige solo y lo explica arriba.
        const ajustado = await revisarInventario(items)
        setError(ajustado ? 'El inventario cambió y ajustamos tu carrito. Revísalo y vuelve a enviar el pedido.' : r.error)
        return
      }
      // Se deja sonar el arpegio antes de saltar a WhatsApp (el botón sigue en "Enviando pedido…").
      sonar('pedido')
      await new Promise((listo) => setTimeout(listo, 450))
      vaciar()
      window.location.href = r.url
    })
  }

  return (
    <div className="grid gap-10 py-10 lg:grid-cols-[1fr_400px]">
      <section>
        <h1 className="text-5xl">Tu carrito</h1>
        {avisoAjustes && <div className="mt-6">{avisoAjustes}</div>}
        <ul className="mt-8 divide-y divide-linea border-y border-linea">
          {items.map((i, n) => (
            <ViewTransition key={i.clave} exit="salida-item" update="reacomodo">
              <li className="flex animate-entrada gap-4 py-5" style={{ animationDelay: `${Math.min(n, 8) * 60}ms` }}>
                <Link href={`/p/${i.slug}`} className="h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-foto">
                  {i.foto && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.foto} alt="" className="h-full w-full object-contain p-2" />
                  )}
                </Link>
                <div className="flex flex-1 flex-col">
                  <p className="text-sm text-humo">{i.detalle}</p>
                  <p className="font-display text-2xl leading-snug">{i.nombre}</p>
                  <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                    <div className="inline-flex items-center rounded-full border border-linea bg-vidrio">
                      <button className="px-3 py-1 transition-[color,scale] duration-200 hover:text-dorado active:scale-75" aria-label="Quitar uno" onClick={() => { if (i.cantidad > 1) sonar('menos'); cambiarCantidad(i.clave, i.cantidad - 1) }}>−</button>
                      <span className="w-6 text-center tabular-nums" aria-live="polite"><span key={i.cantidad} className="inline-block animate-cambio">{i.cantidad}</span></span>
                      <button className="px-3 py-1 transition-[color,scale,opacity] duration-200 hover:text-dorado active:not-disabled:scale-75 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-current" aria-label="Agregar uno" disabled={i.cantidad >= tope(i)} onClick={() => { sonar('mas'); cambiarCantidad(i.clave, i.cantidad + 1) }}>+</button>
                    </div>
                    <span key={`${moneda}-${i.cantidad}`} className="inline-block animate-cambio font-semibold tabular-nums">{precio(i.precio_usd * i.cantidad)}</span>
                  </div>
                  {i.tipo === 'producto' && i.maximo !== undefined && i.cantidad >= tope(i) && (
                    <p className="mt-1 animate-entrada text-xs text-dorado">
                      {i.maximo === 1 ? 'Es la única unidad disponible.' : `Tienes las ${i.maximo} unidades disponibles.`}
                    </p>
                  )}
                  <button className="mt-1 self-start text-sm text-humo underline-offset-4 transition-colors hover:text-alerta hover:underline" onClick={() => setPorQuitar(i.clave)}>
                    Quitar
                  </button>
                </div>
              </li>
            </ViewTransition>
          ))}
        </ul>
        <DialogoConfirmacion
          abierto={porQuitar !== null}
          titulo="¿Quitar del carrito?"
          mensaje={<>Se quitará <strong className="text-tinta">{items.find((i) => i.clave === porQuitar)?.nombre}</strong> de tu carrito.</>}
          confirmar="Quitar"
          onCerrar={() => setPorQuitar(null)}
          onConfirmar={() => porQuitar && quitarSuave(porQuitar)}
        />
      </section>

      {/* React 19 vacía un <form action> al terminar el envío, aunque falle: aquí se cancela para no perder los datos. */}
      <form action={enviar} onReset={(e) => e.preventDefault()} className="tarjeta h-fit space-y-6 p-6 lg:sticky lg:top-24">
        <div>
          <p className="etiqueta">¿Cómo vas a pagar?</p>
          <SelectorMoneda />
          {moneda === 'bolivares' && (
            <p className="mt-2 animate-entrada text-sm text-humo">
              Tasa BCV del día {config.tasa_bcv > 0 ? formatoBs(config.tasa_bcv) : 'no disponible'}
              {config.recargo_bs_pct > 0 ? ' con el ajuste por pago en bolívares incluido.' : '.'}
            </p>
          )}
        </div>

        <fieldset>
          <legend className="etiqueta">Método de pago</legend>
          <div className="flex flex-wrap gap-2">
            {metodosMoneda.map((m) => (
              <label key={m.id} className={`opcion cursor-pointer rounded-full border px-3.5 py-1.5 text-sm ${metodoValido === m.id ? 'border-tinta bg-tinta text-vidrio' : 'border-linea bg-vidrio'}`}>
                <input type="radio" name="metodo" value={m.id} className="sr-only" checked={metodoValido === m.id} onChange={() => setMetodo(m.id)} />
                {m.nombre}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="etiqueta">Entrega</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['retiro', 'delivery'] as const).map((e) => (
              <label key={e} className={`opcion cursor-pointer rounded-xl border px-3 py-2.5 text-sm ${entrega === e ? 'border-tinta bg-tinta text-vidrio' : 'border-linea bg-vidrio'}`}>
                <input type="radio" name="entrega" className="sr-only" checked={entrega === e} onChange={() => setEntrega(e)} />
                {e === 'retiro' ? 'Retiro en tienda' : 'Delivery'}
              </label>
            ))}
          </div>
          {entrega === 'delivery' && (
            <div className="mt-3 animate-entrada space-y-3">
              <select className="campo" value={zonaId} onChange={(e) => setZonaId(e.target.value)} aria-label="Zona de delivery">
                <option value="">Elige tu zona</option>
                {zonas.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.nombre} · {precio(z.costo_usd)}
                  </option>
                ))}
              </select>
              <textarea name="direccion" className="campo" rows={2} placeholder="Dirección y punto de referencia" aria-label="Dirección" />
            </div>
          )}
        </fieldset>

        <div className="grid gap-3">
          <label>
            <span className="etiqueta">Tu nombre</span>
            <input name="nombre" className="campo" autoComplete="name" required />
          </label>
          <label>
            <span className="etiqueta">Teléfono (WhatsApp)</span>
            <input name="telefono" className="campo" type="tel" autoComplete="tel" placeholder="0412 123 4567" required />
          </label>
        </div>

        <div className="space-y-1 border-t border-linea pt-4 text-sm">
          {entrega === 'delivery' && zona && (
            <div className="flex animate-entrada justify-between text-humo"><span>Delivery</span><span className="tabular-nums">{precio(deliveryUsd)}</span></div>
          )}
          <div className="flex items-baseline justify-between">
            <span className="text-base">Total</span>
            <span key={moneda} className="inline-block animate-cambio font-display text-3xl tabular-nums">{moneda === 'bolivares' ? formatoBs(totalBs) : formatoUsd(totalUsd)}</span>
          </div>
        </div>

        {error && <p role="alert" className="rounded-lg bg-alerta/10 px-3 py-2 text-sm text-alerta">{error}</p>}

        <button className="boton w-full" disabled={enviando || !metodoValido}>
          {enviando ? 'Enviando pedido…' : 'Enviar pedido por WhatsApp'}
        </button>
        <p className="text-center text-xs text-humo">Te atenderemos por WhatsApp para confirmar disponibilidad y pago.</p>
      </form>
    </div>
  )
}

/** Explica al cliente qué cambió en su carrito al compararlo con el inventario actual. */
function avisosDeAjuste(items: ItemCarrito[], limites: Record<string, number>) {
  return items.flatMap((i) => {
    const maximo = limites[i.clave]
    if (maximo === undefined) return []
    if (maximo <= 0) return [`${i.nombre} se agotó y lo quitamos.`]
    if (i.cantidad > maximo) return [`De ${i.nombre} ${maximo === 1 ? 'solo queda 1 unidad' : `solo quedan ${maximo} unidades`}: ajustamos la cantidad.`]
    return []
  })
}
