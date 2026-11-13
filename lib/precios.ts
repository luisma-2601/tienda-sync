// Formato de precios. El cálculo oficial vive en la base de datos (precio_bs);
// esta copia solo sirve para mostrar y para las pruebas.

export type Moneda = 'divisas' | 'bolivares'

export interface ConfigPrecios {
  tasa_bcv: number
  recargo_bs_pct: number
  redondeo_bs: number
}

export function calcularPrecioBs(usd: number, cfg: ConfigPrecios): number | null {
  if (!(cfg.tasa_bcv > 0)) return null
  const bruto = usd * cfg.tasa_bcv * (1 + cfg.recargo_bs_pct / 100)
  const paso = cfg.redondeo_bs > 0 ? cfg.redondeo_bs : 0.01
  return Math.round(Math.round(bruto / paso) * paso * 100) / 100
}

const fmtUsd = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtBs = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatoUsd(n: number): string {
  return `$${fmtUsd.format(n)}`
}

export function formatoBs(n: number): string {
  return `Bs. ${fmtBs.format(n)}`
}

export function formatoPrecio(moneda: Moneda, usd: number, bs: number | null): string {
  if (moneda === 'bolivares') return bs === null ? '—' : formatoBs(bs)
  return formatoUsd(usd)
}

export type Disponibilidad = 'disponible' | 'ultimas' | 'agotado'

export const textoDisponibilidad: Record<Disponibilidad, string> = {
  disponible: 'Disponible',
  ultimas: 'Últimas unidades',
  agotado: 'Agotado',
}
