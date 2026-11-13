// Importador del reporte de inventario del sistema administrativo (XLSX).
// Lógica pura: recibe las filas ya leídas del Excel y los productos existentes,
// y devuelve un plan (qué actualizar, crear, ocultar o revisar). No toca la base de datos.

import { normalizarCodigo, normalizarTexto, parsearNumero, similitud } from '../normalizar'

export type Celda = string | number | boolean | Date | null
export type Campo = 'codigo' | 'nombre' | 'marca' | 'stock' | 'precio_usd'

/** Mapeo guardado por nombre de encabezado (sobrevive a que el sistema administrativo reordene columnas). */
export type Mapeo = Partial<Record<Campo, string | null>>

export const CAMPOS_OBLIGATORIOS: Campo[] = ['nombre', 'stock']

export const ETIQUETA_CAMPO: Record<Campo, string> = {
  codigo: 'Código',
  nombre: 'Nombre del producto',
  marca: 'Marca',
  stock: 'Stock / existencia',
  precio_usd: 'Precio en dólares',
}

const PALABRAS: Record<Campo, string[]> = {
  codigo: ['codigo', 'cod', 'sku', 'referencia', 'ref', 'id producto'],
  nombre: ['nombre', 'producto', 'descripcion', 'articulo', 'item'],
  marca: ['marca', 'brand', 'fabricante'],
  stock: ['stock', 'existencia', 'existencias', 'cantidad', 'disponible', 'inventario', 'unidades'],
  precio_usd: ['precio usd', 'precio $', 'precio dolar', 'precio en dolares', 'precio de venta', 'pvp', 'precio'],
}

const PALABRAS_BS = ['bs', 'bolivar', 'bolivares', 'ves']
const PALABRAS_COSTO = ['costo', 'coste']

function puntaje(encabezado: string, campo: Campo): number {
  const h = normalizarTexto(encabezado) ?? ''
  if (!h) return 0
  const palabras = h.split(/[^a-z0-9$]+/).filter(Boolean)
  if (campo === 'precio_usd') {
    if (PALABRAS_BS.some((p) => palabras.includes(p))) return 0
    if (PALABRAS_COSTO.some((p) => h.includes(p))) return 0
  }
  if (campo === 'codigo' && h.includes('barra')) return 1 // código de barras: posible, pero no preferido
  let mejor = 0
  for (const p of PALABRAS[campo]) {
    if (h === p) mejor = Math.max(mejor, 3)
    else if (p.includes(' ') ? h.includes(p) : palabras.includes(p)) mejor = Math.max(mejor, 2)
  }
  return mejor
}

/** Busca la fila de encabezados en las primeras 20 filas (el reporte puede traer títulos arriba). */
export function detectarEncabezado(filas: Celda[][]): number {
  let mejorFila = -1
  let mejor = 0
  const limite = Math.min(filas.length, 20)
  for (let i = 0; i < limite; i++) {
    const textos = filas[i].filter((c) => typeof c === 'string' && c.trim() !== '') as string[]
    if (textos.length < 2) continue
    const campos = (Object.keys(PALABRAS) as Campo[]).filter((campo) => textos.some((t) => puntaje(t, campo) >= 2))
    if (campos.length > mejor) {
      mejor = campos.length
      mejorFila = i
    }
  }
  if (mejorFila >= 0) return mejorFila
  return Math.max(0, filas.findIndex((f) => f.some((c) => c !== null && String(c).trim() !== '')))
}

export function encabezados(filas: Celda[][], filaEncabezado: number): string[] {
  return (filas[filaEncabezado] ?? []).map((c, i) => (c === null || String(c).trim() === '' ? `Columna ${i + 1}` : String(c).trim()))
}

/** Propone qué columna es cada campo. Cada columna se usa una sola vez. */
export function sugerirMapeo(cabeceras: string[]): Mapeo {
  const usadas = new Set<string>()
  const mapeo: Mapeo = {}
  // Primero los campos con palabras más específicas.
  const orden: Campo[] = ['codigo', 'marca', 'stock', 'precio_usd', 'nombre']
  for (const campo of orden) {
    let elegido: string | null = null
    let mejor = 0
    for (const h of cabeceras) {
      if (usadas.has(h)) continue
      const p = puntaje(h, campo)
      if (p > mejor) {
        mejor = p
        elegido = h
      }
    }
    mapeo[campo] = mejor >= 2 || (campo === 'codigo' && mejor >= 1) ? elegido : null
    if (mapeo[campo]) usadas.add(mapeo[campo]!)
  }
  return mapeo
}

/** Un mapeo guardado sirve si todas sus columnas siguen existiendo en el archivo nuevo. */
export function mapeoValido(mapeo: Mapeo | null | undefined, cabeceras: string[]): mapeo is Mapeo {
  if (!mapeo) return false
  for (const campo of CAMPOS_OBLIGATORIOS) if (!mapeo[campo]) return false
  return Object.values(mapeo).every((h) => !h || cabeceras.includes(h))
}

export interface FilaInventario {
  fila: number // número de fila en Excel (1 = primera)
  codigo: string | null
  codigoNorm: string | null
  nombre: string
  nombreNorm: string
  marca: string | null
  stock: number
  precio_usd: number | null
}

export interface ErrorFila {
  fila: number
  motivo: string
}

export function extraerFilas(
  filas: Celda[][],
  filaEncabezado: number,
  mapeo: Mapeo,
): { filas: FilaInventario[]; errores: ErrorFila[] } {
  const cab = encabezados(filas, filaEncabezado)
  const idx = (campo: Campo) => (mapeo[campo] ? cab.indexOf(mapeo[campo]!) : -1)
  const iCodigo = idx('codigo'), iNombre = idx('nombre'), iMarca = idx('marca'), iStock = idx('stock'), iPrecio = idx('precio_usd')
  if (iNombre < 0 || iStock < 0) throw new Error('Faltan columnas obligatorias: nombre y stock')

  const res: FilaInventario[] = []
  const errores: ErrorFila[] = []
  const texto = (c: Celda | undefined) => (c === null || c === undefined ? '' : String(c).trim())

  for (let i = filaEncabezado + 1; i < filas.length; i++) {
    const f = filas[i]
    const numFila = i + 1
    if (!f || f.every((c) => texto(c) === '')) continue

    const nombre = texto(f[iNombre])
    const codigo = iCodigo >= 0 ? texto(f[iCodigo]) || null : null
    const nombreNorm = normalizarTexto(nombre)
    // Filas de totales o subtítulos al final del reporte.
    if (!codigo && (!nombreNorm || /^(total|subtotal|totales)\b/.test(nombreNorm))) continue
    if (!nombreNorm) {
      errores.push({ fila: numFila, motivo: 'Sin nombre de producto' })
      continue
    }
    const stock = parsearNumero(f[iStock])
    if (stock === null) {
      errores.push({ fila: numFila, motivo: `Stock no válido: "${texto(f[iStock])}"` })
      continue
    }
    let precio: number | null = null
    if (iPrecio >= 0) {
      precio = parsearNumero(f[iPrecio])
      if (precio === null || precio < 0) {
        errores.push({ fila: numFila, motivo: `Precio no válido: "${texto(f[iPrecio])}"` })
        continue
      }
    }
    res.push({
      fila: numFila,
      codigo,
      codigoNorm: normalizarCodigo(codigo),
      nombre,
      nombreNorm,
      marca: iMarca >= 0 ? texto(f[iMarca]) || null : null,
      stock: Math.trunc(stock),
      precio_usd: precio === null ? null : Math.round(precio * 100) / 100,
    })
  }
  return { filas: res, errores }
}

export interface ProductoExistente {
  id: string
  nombre: string
  codigo_sistema: string | null
  estado: 'borrador' | 'publicado' | 'oculto'
  en_ultimo_reporte: boolean
}

export interface Actualizacion {
  id: string
  nombre: string
  fila: FilaInventario
  por: 'codigo' | 'nombre'
  asignarCodigo: boolean // el producto no tenía código y el reporte sí trae uno
  reactivar: boolean // estaba oculto porque había salido del reporte
}

export interface Revision {
  fila: FilaInventario
  candidatoId: string | null
  candidatoNombre: string | null
  similitud: number
  motivo: string
}

export interface PlanImportacion {
  actualizar: Actualizacion[]
  nuevos: FilaInventario[]
  revisar: Revision[]
  ocultar: { id: string; nombre: string }[]
  errores: ErrorFila[]
  avisos: string[]
}

export const UMBRAL_REVISION = 0.45

export function planificarImportacion(filas: FilaInventario[], existentes: ProductoExistente[]): PlanImportacion {
  const plan: PlanImportacion = { actualizar: [], nuevos: [], revisar: [], ocultar: [], errores: [], avisos: [] }

  const porCodigo = new Map<string, ProductoExistente>()
  const porNombre = new Map<string, ProductoExistente[]>()
  for (const p of existentes) {
    const c = normalizarCodigo(p.codigo_sistema)
    if (c) porCodigo.set(c, p)
    const n = normalizarTexto(p.nombre)
    if (n) porNombre.set(n, [...(porNombre.get(n) ?? []), p])
  }

  const usados = new Set<string>()
  const codigosVistos = new Set<string>()

  const actualizar = (p: ProductoExistente, fila: FilaInventario, por: 'codigo' | 'nombre') => {
    usados.add(p.id)
    plan.actualizar.push({
      id: p.id,
      nombre: p.nombre,
      fila,
      por,
      asignarCodigo: !p.codigo_sistema && !!fila.codigo,
      reactivar: p.estado === 'oculto' && !p.en_ultimo_reporte,
    })
  }

  for (const fila of filas) {
    if (fila.codigoNorm) {
      if (codigosVistos.has(fila.codigoNorm)) {
        plan.errores.push({ fila: fila.fila, motivo: `Código repetido en el reporte: ${fila.codigo}` })
        continue
      }
      codigosVistos.add(fila.codigoNorm)

      const p = porCodigo.get(fila.codigoNorm)
      if (p && !usados.has(p.id)) {
        actualizar(p, fila, 'codigo')
        continue
      }
    }

    // Sin código o sin coincidencia por código: probar por nombre exacto (normalizado).
    const mismosNombre = (porNombre.get(fila.nombreNorm) ?? []).filter((p) => !usados.has(p.id))
    if (mismosNombre.length === 1) {
      const p = mismosNombre[0]
      const codigoP = normalizarCodigo(p.codigo_sistema)
      if (!codigoP || !fila.codigoNorm) {
        actualizar(p, fila, 'nombre')
      } else {
        // Mismo nombre pero otro código: puede ser otra presentación. Que lo decida una persona.
        plan.revisar.push({ fila, candidatoId: p.id, candidatoNombre: p.nombre, similitud: 1, motivo: `Mismo nombre, código distinto (${p.codigo_sistema})` })
      }
      continue
    }
    if (mismosNombre.length > 1) {
      plan.revisar.push({ fila, candidatoId: null, candidatoNombre: null, similitud: 1, motivo: 'Hay varios productos con este nombre' })
      continue
    }

    // Parecido, pero no igual: a revisión.
    let mejor: ProductoExistente | null = null
    let mejorSim = 0
    for (const p of existentes) {
      if (usados.has(p.id)) continue
      if (fila.codigoNorm && normalizarCodigo(p.codigo_sistema)) continue // ambos con código y no coinciden: no es el mismo
      const s = similitud(fila.nombre, p.nombre)
      if (s > mejorSim) {
        mejorSim = s
        mejor = p
      }
    }
    if (mejor && mejorSim >= UMBRAL_REVISION) {
      plan.revisar.push({ fila, candidatoId: mejor.id, candidatoNombre: mejor.nombre, similitud: Math.round(mejorSim * 100) / 100, motivo: 'Nombre parecido' })
    } else {
      plan.nuevos.push(fila)
    }
  }

  // Productos que no aparecieron en el reporte: se ocultan, salvo que el reporte parezca incompleto.
  const enRevision = new Set(plan.revisar.map((r) => r.candidatoId).filter(Boolean))
  const activos = existentes.filter((p) => p.estado !== 'oculto')
  const faltantes = activos.filter((p) => !usados.has(p.id) && !enRevision.has(p.id))
  const coincidencias = activos.filter((p) => usados.has(p.id)).length

  if (activos.length >= 10 && coincidencias < activos.length * 0.5) {
    plan.avisos.push(
      `Solo ${coincidencias} de ${activos.length} productos activos aparecen en este reporte. ` +
        'Por seguridad no se ocultará ninguno. Revisa que el archivo esté completo y que las columnas estén bien elegidas.',
    )
  } else {
    plan.ocultar = faltantes.map((p) => ({ id: p.id, nombre: p.nombre }))
  }
  return plan
}
