'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Moneda } from '@/lib/precios'

export interface ItemCarrito {
  clave: string // 'p:<id>' o 'd:<id>'
  tipo: 'producto' | 'decant'
  id: string
  nombre: string
  detalle: string // marca · ml
  slug: string
  foto: string | null
  precio_usd: number
  cantidad: number
  /** Unidades disponibles en inventario (con tope de 50). Los carritos guardados antes no lo traen. */
  maximo?: number
}

/** Tope por producto en el carrito: lo que hay en inventario, y nunca más de 50. */
export const MAXIMO_CARRITO = 50
export const tope = (i: { maximo?: number }) => Math.min(i.maximo ?? MAXIMO_CARRITO, MAXIMO_CARRITO)

interface Estado {
  moneda: Moneda
  setMoneda: (m: Moneda) => void
  items: ItemCarrito[]
  agregar: (item: Omit<ItemCarrito, 'cantidad' | 'clave'>, cantidad?: number) => void
  cambiarCantidad: (clave: string, cantidad: number) => void
  quitar: (clave: string) => void
  /** Aplica el inventario actual (clave → unidades disponibles): ajusta cantidades y quita lo agotado. */
  ajustar: (limites: Record<string, number>) => void
  vaciar: () => void
  unidades: number
  listo: boolean
}

const Ctx = createContext<Estado | null>(null)
const LLAVE = 'tienda-sync-v1'

export function TiendaProvider({ children }: { children: React.ReactNode }) {
  const [moneda, setMonedaState] = useState<Moneda>('divisas')
  const [items, setItems] = useState<ItemCarrito[]>([])
  const [listo, setListo] = useState(false)

  useEffect(() => {
    try {
      const guardado = JSON.parse(localStorage.getItem(LLAVE) ?? 'null')
      if (guardado?.moneda) setMonedaState(guardado.moneda)
      if (Array.isArray(guardado?.items)) setItems(guardado.items)
    } catch {
      /* almacenamiento no disponible: el carrito vive solo en memoria */
    }
    setListo(true)
  }, [])

  useEffect(() => {
    if (!listo) return
    try {
      localStorage.setItem(LLAVE, JSON.stringify({ moneda, items }))
    } catch {
      /* ignorar */
    }
  }, [moneda, items, listo])

  const agregar = useCallback<Estado['agregar']>((item, cantidad = 1) => {
    const clave = `${item.tipo === 'producto' ? 'p' : 'd'}:${item.id}`
    setItems((prev) => {
      const existe = prev.find((i) => i.clave === clave)
      // Nunca más de lo que hay en inventario; el máximo que trae el producto es el más reciente.
      if (existe) return prev.map((i) => (i.clave === clave ? { ...i, maximo: item.maximo, cantidad: Math.min(i.cantidad + cantidad, tope(item)) } : i))
      if (tope(item) <= 0) return prev
      return [...prev, { ...item, clave, cantidad: Math.min(cantidad, tope(item)) }]
    })
  }, [])

  const valor = useMemo<Estado>(
    () => ({
      moneda,
      setMoneda: setMonedaState,
      items,
      agregar,
      cambiarCantidad: (clave, cantidad) =>
        setItems((prev) => prev.map((i) => (i.clave === clave ? { ...i, cantidad: Math.max(1, Math.min(cantidad, tope(i))) } : i))),
      quitar: (clave) => setItems((prev) => prev.filter((i) => i.clave !== clave)),
      ajustar: (limites) =>
        setItems((prev) =>
          prev.flatMap((i) => {
            const maximo = limites[i.clave]
            if (maximo === undefined) return [i]
            if (maximo <= 0) return []
            return [{ ...i, maximo, cantidad: Math.min(i.cantidad, maximo) }]
          }),
        ),
      vaciar: () => setItems([]),
      unidades: items.reduce((s, i) => s + i.cantidad, 0),
      listo,
    }),
    [moneda, items, agregar, listo],
  )

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useTienda() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useTienda fuera de TiendaProvider')
  return v
}
