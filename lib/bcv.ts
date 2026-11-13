// Lectura de la tasa oficial del dólar: página del BCV y, de respaldo, DolarAPI.
// La misma lógica se usa en la función de Supabase (supabase/functions/actualizar-tasa).
import { parsearNumero } from './normalizar'

export const URL_BCV = 'https://www.bcv.org.ve/'
export const URL_DOLARAPI = 'https://ve.dolarapi.com/v1/dolares/oficial'

/** Tasa leída y la fecha (AAAA-MM-DD, hora de Caracas) desde la que rige. */
export type LecturaTasa = { tasa: number; fechaValor: string }

/**
 * Extrae la tasa del bloque id="dolar" y la "Fecha Valor" de la página del BCV.
 * Lanza error si la página cambió o los valores no son razonables.
 */
export function parsearTasaBcv(html: string): LecturaTasa {
  const bloque = html.match(/id=["']dolar["'][\s\S]*?<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i)
  if (!bloque) throw new Error('No se encontró la tasa del dólar en la página del BCV')
  const fecha = html.match(/Fecha\s+Valor[\s\S]{0,300}?content=["'](\d{4}-\d{2}-\d{2})/i)
  if (!fecha) throw new Error('No se encontró la fecha valor en la página del BCV')
  return { tasa: validarTasa(parsearNumero(bloque[1]), bloque[1]), fechaValor: validarFecha(fecha[1]) }
}

/** Lee la respuesta de DolarAPI (campos "promedio" y "fechaActualizacion"). */
export function parsearTasaDolarApi(datos: unknown): LecturaTasa {
  const d = (datos ?? {}) as { promedio?: unknown; fechaActualizacion?: unknown }
  const fecha = typeof d.fechaActualizacion === 'string' ? d.fechaActualizacion.match(/^(\d{4}-\d{2}-\d{2})/) : null
  if (!fecha) throw new Error('DolarAPI no trajo la fecha de la tasa')
  return { tasa: validarTasa(parsearNumero(d.promedio), String(d.promedio)), fechaValor: validarFecha(fecha[1]) }
}

function validarTasa(valor: number | null, texto: string): number {
  if (valor === null || !(valor > 0) || valor >= 1_000_000) throw new Error(`Tasa fuera de rango: ${texto}`)
  return Math.round(valor * 10000) / 10000
}

function validarFecha(texto: string): string {
  const [a, m, d] = texto.split('-').map(Number)
  const f = new Date(Date.UTC(a, m - 1, d))
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) throw new Error(`Fecha valor no válida: ${texto}`)
  return texto
}
