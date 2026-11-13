// Reglas del flujo rápido de importación (sin base de datos, para poder probarlas).
// La lógica de emparejamiento está en ./importador.ts y no cambia aquí.

export const MAX_BYTES_REPORTE = 8 * 1024 * 1024

/** Se aplica sin vista previa si se ocultarían como máximo 10 productos o el 5 % de los activos, lo que sea mayor. */
export function limiteOcultar(activos: number): number {
  return Math.max(10, Math.floor(activos * 0.05))
}

export type Decision = { automatico: true } | { automatico: false; motivo: string }

/**
 * ¿Se puede aplicar el reporte sin que nadie lo revise? Solo si se usa el mapeo de columnas
 * guardado (y sigue siendo válido), el plan no trae avisos y no se ocultan demasiados productos.
 * Las filas dudosas no bloquean: van a la cola de revisión como siempre.
 */
export function decidirAplicacion(p: { mapeoGuardadoValido: boolean; avisos: string[]; ocultar: number; activos: number }): Decision {
  if (!p.mapeoGuardadoValido) return { automatico: false, motivo: 'Las columnas del reporte cambiaron: confirma qué columna es cada dato.' }
  if (p.avisos.length) return { automatico: false, motivo: 'El reporte parece incompleto: confirma que sea el inventario completo.' }
  const limite = limiteOcultar(p.activos)
  if (p.ocultar > limite) {
    return { automatico: false, motivo: `Se ocultarían ${p.ocultar} productos; confirma que el reporte esté completo.` }
  }
  return { automatico: true }
}

/** SHA-256 del archivo en hexadecimal, para reconocer un reporte ya importado. */
export async function hashArchivo(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** El archivo es idéntico al último importado. */
export function esRepetido(hash: string, ultimoHash: string | null | undefined): boolean {
  return !!ultimoHash && hash === ultimoHash
}

/** "Listo. 132 productos actualizados, 3 nuevos en borrador, 2 por revisar" */
export function textoResultado(r: { actualizados: number; nuevos: number; porRevisar: number; ocultados: number }): string {
  const partes = [`${r.actualizados} ${r.actualizados === 1 ? 'producto actualizado' : 'productos actualizados'}`]
  if (r.nuevos) partes.push(`${r.nuevos} ${r.nuevos === 1 ? 'nuevo' : 'nuevos'} en borrador`)
  if (r.porRevisar) partes.push(`${r.porRevisar} por revisar`)
  if (r.ocultados) partes.push(`${r.ocultados} ${r.ocultados === 1 ? 'oculto' : 'ocultos'} por no venir en el reporte`)
  return `Listo. ${partes.join(', ')}.`
}
