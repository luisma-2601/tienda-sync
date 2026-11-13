// Lectura del reporte de inventario del sistema administrativo (XLSX) con ExcelJS.
import ExcelJS from 'exceljs'
import type { Celda } from './importador'

/** Lee la primera hoja con datos y devuelve sus filas como matriz de celdas simples. */
export async function leerXlsx(buffer: ArrayBuffer): Promise<{ hoja: string; filas: Celda[][] }> {
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(buffer)
  const hoja = libro.worksheets.find((h) => h.actualRowCount > 0) ?? libro.worksheets[0]
  if (!hoja) throw new Error('El archivo no tiene hojas')

  const filas: Celda[][] = []
  const columnas = hoja.columnCount
  hoja.eachRow({ includeEmpty: true }, (row, numero) => {
    const fila: Celda[] = []
    for (let c = 1; c <= columnas; c++) fila.push(valorSimple(row.getCell(c).value))
    filas[numero - 1] = fila
  })
  for (let i = 0; i < filas.length; i++) filas[i] ??= []
  return { hoja: hoja.name, filas }
}

function valorSimple(v: ExcelJS.CellValue): Celda {
  if (v === null || v === undefined) return null
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v instanceof Date) return v
  if (typeof v === 'object') {
    if ('result' in v) return valorSimple(v.result as ExcelJS.CellValue) // fórmula
    if ('richText' in v) return v.richText.map((t) => t.text).join('')
    if ('text' in v) return String(v.text) // hipervínculo
    if ('error' in v) return null
  }
  return String(v)
}
