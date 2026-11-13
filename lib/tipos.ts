import type { Disponibilidad, Moneda } from './precios'

export type Rol = 'dueno' | 'empleado' | 'cliente'
export type EstadoProducto = 'borrador' | 'publicado' | 'oculto'
export type EstadoDescripcion = 'sin' | 'borrador' | 'aprobada'
export interface ProductoPublico {
  id: string
  slug: string
  nombre: string
  marca: string | null
  presentacion_ml: number | null
  precio_usd: number
  precio_bs: number | null
  disponibilidad: Disponibilidad
  genero: 'hombre' | 'mujer' | 'unisex' | null
  ocasion: string[]
  notas: string[]
  descripcion: string | null
  fotos: string[]
  /** Unidades que se pueden poner en el carrito: el stock, con tope de 50 (migración 0007). */
  maximo?: number
  // Ficha completada (migración 0008): solo llegan con la ficha aprobada.
  momento?: Momento | null
  temporadas?: string[]
  notas_salida?: string[]
  notas_corazon?: string[]
  notas_fondo?: string[]
  familia_olfativa?: string | null
}

export interface DecantPublico {
  id: string
  producto_id: string
  ml: number
  precio_usd: number
  precio_bs: number | null
  disponible: boolean
}

export interface ConfigPublica {
  tasa_bcv: number
  recargo_bs_pct: number
  redondeo_bs: number
  whatsapp_numero: string | null
  tasa_actualizada_en: string | null
}

export interface MetodoPago {
  id: string
  nombre: string
  moneda: Moneda
}

export interface ZonaDelivery {
  id: string
  nombre: string
  costo_usd: number
}

export interface Producto {
  id: string
  codigo_sistema: string | null
  nombre: string
  marca: string | null
  presentacion_ml: number | null
  precio_usd: number
  stock: number
  genero: 'hombre' | 'mujer' | 'unisex' | null
  ocasion: string[]
  notas: string[]
  descripcion: string | null
  descripcion_estado: EstadoDescripcion
  fotos: string[]
  estado: EstadoProducto
  slug: string
  en_ultimo_reporte: boolean
  actualizado_en: string
  // Ficha propuesta por la IA (migración 0008). `nombre` no se toca: con él empareja el importador del sistema administrativo.
  marca_sugerida: string | null
  nombre_sugerido: string | null
  momento: Momento | null
  temporadas: string[]
  notas_salida: string[]
  notas_corazon: string[]
  notas_fondo: string[]
  familia_olfativa: string | null
  ia_confianza: ConfianzaIA | null
  ia_generada_en: string | null
  origen_foto: string | null
}

export interface Pedido {
  id: string
  numero: number
  cliente_nombre: string
  cliente_telefono: string
  entrega: 'retiro' | 'delivery'
  zona_id: string | null
  direccion: string | null
  moneda: Moneda
  metodo_pago: string
  tasa_usada: number
  recargo_usado: number
  costo_delivery_usd: number
  total_usd: number
  total_bs: number | null
  creado_en: string
  entregado_en: string | null // checklist opcional de entrega en "Pedidos web"
}

export interface PedidoItem {
  id: string
  pedido_id: string
  es_decant: boolean
  codigo_sistema: string | null
  descripcion: string
  cantidad: number
  precio_unit_usd: number
  precio_unit_bs: number | null
}

/** Supabase devuelve numeric como string; esto los convierte. */
export function aNumero<T extends object>(fila: T, campos: (keyof T)[]): T {
  const copia = { ...fila }
  for (const c of campos) {
    const v = copia[c] as unknown
    if (typeof v === 'string') (copia[c] as unknown) = Number(v)
  }
  return copia
}

export const GENEROS = { hombre: 'Hombre', mujer: 'Mujer', unisex: 'Unisex' } as const
// Día/Noche y las estaciones ya no son ocasiones: van en `momento` y `temporadas` (migración 0008).
export const OCASIONES = ['Oficina', 'Citas', 'Eventos', 'Casual'] as const
export type Momento = 'dia' | 'noche' | 'ambos'
export const MOMENTOS: Record<Momento, string> = { dia: 'Día', noche: 'Noche', ambos: 'Día y noche' }
export const TEMPORADAS = { primavera: 'Primavera', verano: 'Verano', otono: 'Otoño', invierno: 'Invierno' } as const
export type ConfianzaIA = 'alta' | 'media' | 'baja'
