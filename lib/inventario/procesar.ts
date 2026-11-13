// Flujo completo de importación del reporte del sistema administrativo, compartido por la pantalla /admin/importar
// y la ruta /admin/compartir (botón "Compartir" del celular). Solo se usa en el servidor.
//
//   subir archivo → ¿idéntico al último? → ¿hay columnas guardadas? → plan →
//   ¿es seguro aplicarlo solo? → aplicar (o mostrar vista previa con el motivo)

import { revalidatePath } from 'next/cache'
import type { supabaseServidor } from '@/lib/supabase/server'
import { leerXlsx } from './excel'
import { decidirAplicacion, esRepetido, hashArchivo, MAX_BYTES_REPORTE } from './flujo'
import {
  CAMPOS_OBLIGATORIOS,
  detectarEncabezado,
  encabezados,
  extraerFilas,
  mapeoValido,
  planificarImportacion,
  sugerirMapeo,
  type Celda,
  type ErrorFila,
  type Mapeo,
  type PlanImportacion,
  type ProductoExistente,
} from './importador'

type Supabase = Awaited<ReturnType<typeof supabaseServidor>>

export interface ArchivoReporte {
  nombre: string
  bytes: ArrayBuffer
}

export interface Analisis {
  filaEncabezado: number
  cabeceras: string[]
  mapeo: Mapeo
  mapeoGuardado: boolean
  muestra: Celda[][]
}

export interface ResumenPlan {
  filas: number
  actualizar: number
  porNombre: number
  reactivar: number
  nuevos: { fila: number; nombre: string }[]
  revisar: { fila: number; nombre: string; candidato: string | null; motivo: string }[]
  ocultar: { nombre: string }[]
  errores: ErrorFila[]
  avisos: string[]
}

export type ResultadoImportacion =
  | { tipo: 'error'; error: string }
  | { tipo: 'al-dia' }
  | { tipo: 'columnas'; analisis: Analisis }
  | { tipo: 'revisar'; analisis: Analisis; resumen: ResumenPlan; motivo: string | null }
  | { tipo: 'aplicado'; importacionId: string; resumen: ResumenPlan }

/**
 * - `auto`: lo que pasa al elegir o compartir un archivo. Si es idéntico al último, no hace nada;
 *   sin columnas guardadas, pide elegirlas; si es seguro, aplica; si no, devuelve la vista previa.
 * - `vista`: vista previa con las columnas elegidas a mano.
 * - `aplicar`: aplica con las columnas indicadas (la persona ya revisó).
 */
export type ModoImportacion = 'auto' | 'vista' | 'aplicar'

export function validarArchivo(nombre: string, tamano: number): string | null {
  if (tamano === 0) return 'Elige el reporte de inventario en Excel (.xlsx).'
  if (tamano > MAX_BYTES_REPORTE) return 'El archivo pesa más de 8 MB. ¿Es el reporte de inventario?'
  if (!/\.xlsx$/i.test(nombre)) return 'El archivo debe ser .xlsx (Excel), el reporte de inventario.'
  return null
}

export async function importarReporte(
  supabase: Supabase,
  usuarioId: string,
  archivo: ArchivoReporte,
  opciones: { modo: ModoImportacion; mapeo?: Mapeo; filaEncabezado?: number },
): Promise<ResultadoImportacion> {
  try {
    const invalido = validarArchivo(archivo.nombre, archivo.bytes.byteLength)
    if (invalido) return { tipo: 'error', error: invalido }

    const hash = await hashArchivo(archivo.bytes)
    if (opciones.modo === 'auto') {
      const { data: ultima } = await supabase.from('importaciones').select('archivo_sha256').order('creada_en', { ascending: false }).limit(1).maybeSingle()
      if (esRepetido(hash, ultima?.archivo_sha256)) return { tipo: 'al-dia' }
    }

    const { filas } = await leerXlsx(archivo.bytes)
    const detectada = detectarEncabezado(filas)
    const filaEncabezado = opciones.filaEncabezado ?? detectada
    const cabeceras = encabezados(filas, filaEncabezado)
    const { data: guardado } = await supabase.rpc('leer_mapeo_inventario')
    const mapeoGuardadoValido = mapeoValido(guardado as Mapeo | null, cabeceras)
    const analisis: Analisis = {
      filaEncabezado,
      cabeceras,
      mapeo: opciones.mapeo ?? (mapeoGuardadoValido ? (guardado as Mapeo) : sugerirMapeo(cabeceras)),
      mapeoGuardado: mapeoGuardadoValido,
      muestra: filas.slice(filaEncabezado + 1, filaEncabezado + 6),
    }

    // Primera vez, o el sistema administrativo cambió sus columnas: que una persona las elija.
    if (opciones.modo === 'auto' && !mapeoGuardadoValido) return { tipo: 'columnas', analisis }

    const mapeo = analisis.mapeo
    for (const c of CAMPOS_OBLIGATORIOS) if (!mapeo[c]) return { tipo: 'error', error: 'Elige al menos las columnas de nombre y stock.' }

    const { filas: filasInventario, errores } = extraerFilas(filas, filaEncabezado, mapeo)
    const existentes = await traerProductos(supabase)
    const plan = planificarImportacion(filasInventario, existentes)
    plan.errores = [...errores, ...plan.errores].sort((a, b) => a.fila - b.fila)
    const resumen = resumir(plan, filasInventario.length + errores.length)

    if (opciones.modo === 'vista') return { tipo: 'revisar', analisis, resumen, motivo: null }
    if (opciones.modo === 'auto') {
      const decision = decidirAplicacion({
        mapeoGuardadoValido,
        avisos: plan.avisos,
        ocultar: plan.ocultar.length,
        activos: existentes.filter((p) => p.estado !== 'oculto').length,
      })
      if (!decision.automatico) return { tipo: 'revisar', analisis, resumen, motivo: decision.motivo }
    }

    const importacionId = await aplicarPlan(supabase, usuarioId, archivo.nombre, hash, mapeo, plan, existentes, resumen.filas)
    return { tipo: 'aplicado', importacionId, resumen }
  } catch (e) {
    return { tipo: 'error', error: e instanceof Error ? e.message : 'No se pudo procesar el reporte.' }
  }
}

type ExistenteConPrecio = ProductoExistente & { precio_usd: number }

async function traerProductos(supabase: Supabase): Promise<ExistenteConPrecio[]> {
  const todos: ExistenteConPrecio[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from('productos')
      .select('id, nombre, codigo_sistema, estado, en_ultimo_reporte, precio_usd')
      .order('id')
      .range(desde, desde + 999)
    if (error) throw new Error('No se pudieron leer los productos actuales.')
    todos.push(...(data as ExistenteConPrecio[]).map((p) => ({ ...p, precio_usd: Number(p.precio_usd) })))
    if (!data || data.length < 1000) return todos
  }
}

function resumir(plan: PlanImportacion, filas: number): ResumenPlan {
  return {
    filas,
    actualizar: plan.actualizar.length,
    porNombre: plan.actualizar.filter((a) => a.por === 'nombre').length,
    reactivar: plan.actualizar.filter((a) => a.reactivar).length,
    nuevos: plan.nuevos.map((f) => ({ fila: f.fila, nombre: f.nombre })),
    revisar: plan.revisar.map((r) => ({ fila: r.fila.fila, nombre: r.fila.nombre, candidato: r.candidatoNombre, motivo: r.motivo })),
    ocultar: plan.ocultar.map((o) => ({ nombre: o.nombre })),
    errores: plan.errores,
    avisos: plan.avisos,
  }
}

const trozos = <T,>(arr: T[], n = 500) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))

async function aplicarPlan(
  supabase: Supabase,
  usuarioId: string,
  nombreArchivo: string,
  hash: string,
  mapeo: Mapeo,
  plan: PlanImportacion,
  existentes: ExistenteConPrecio[],
  filas: number,
): Promise<string> {
  await supabase.rpc('guardar_mapeo_inventario', { p_mapeo: mapeo })

  const { data: imp, error: errImp } = await supabase
    .from('importaciones')
    .insert({ usuario_id: usuarioId, archivo: nombreArchivo, archivo_sha256: hash, filas })
    .select('id')
    .single()
  if (errImp || !imp) throw new Error('No se pudo registrar la importación.')

  // Actualizaciones: todas las filas con las mismas columnas para que el upsert no pise nada por omisión.
  const porId = new Map(existentes.map((p) => [p.id, p]))
  const cambios = plan.actualizar.map((a) => {
    const p = porId.get(a.id)!
    return {
      id: a.id,
      nombre: p.nombre,
      codigo_sistema: a.asignarCodigo ? a.fila.codigo : p.codigo_sistema,
      stock: a.fila.stock,
      precio_usd: a.fila.precio_usd ?? p.precio_usd,
      estado: a.reactivar ? 'publicado' : p.estado,
      en_ultimo_reporte: true,
    }
  })
  for (const t of trozos(cambios)) {
    const { error } = await supabase.from('productos').upsert(t, { onConflict: 'id' })
    if (error) throw new Error(`Error actualizando productos: ${error.message}`)
  }

  for (const t of trozos(plan.nuevos)) {
    const { error } = await supabase.from('productos').insert(
      t.map((f) => ({ codigo_sistema: f.codigo, nombre: f.nombre, marca: f.marca, stock: f.stock, precio_usd: f.precio_usd ?? 0, estado: 'borrador' })),
    )
    if (error) throw new Error(`Error creando productos nuevos: ${error.message}`)
  }

  for (const t of trozos(plan.ocultar.map((o) => o.id))) {
    const { error } = await supabase.from('productos').update({ estado: 'oculto', en_ultimo_reporte: false }).in('id', t).neq('estado', 'oculto')
    if (error) throw new Error(`Error ocultando productos: ${error.message}`)
  }

  if (plan.revisar.length) {
    const { error } = await supabase.from('importacion_revision').insert(
      plan.revisar.map((r) => ({ importacion_id: imp.id, fila: r.fila, candidato_id: r.candidatoId, similitud: r.similitud })),
    )
    if (error) throw new Error(`Error guardando filas por revisar: ${error.message}`)
  }

  await supabase
    .from('importaciones')
    .update({
      actualizados: plan.actualizar.length,
      nuevos: plan.nuevos.length,
      ocultados: plan.ocultar.length,
      por_revisar: plan.revisar.length,
      errores: plan.errores,
    })
    .eq('id', imp.id)

  revalidatePath('/', 'layout')
  return imp.id
}

// ---------------------------------------------------------------------
// Reportes compartidos desde el celular que necesitan revisión: se guardan
// en el bucket privado "reportes" (carpeta del usuario) hasta confirmarlos.
// ---------------------------------------------------------------------
const BUCKET = 'reportes'
const ruta = (usuarioId: string, id: string) => `${usuarioId}/${id}.xlsx`

export async function guardarPendiente(supabase: Supabase, usuarioId: string, archivo: ArchivoReporte): Promise<string> {
  const id = crypto.randomUUID()
  const { error } = await supabase.storage.from(BUCKET).upload(ruta(usuarioId, id), archivo.bytes, {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  if (error) throw new Error('No se pudo guardar el reporte para revisarlo.')
  return id
}

export async function leerPendiente(supabase: Supabase, usuarioId: string, id: string): Promise<ArchivoReporte | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data } = await supabase.storage.from(BUCKET).download(ruta(usuarioId, id))
  if (!data) return null
  return { nombre: 'reporte-compartido.xlsx', bytes: await data.arrayBuffer() }
}

export async function borrarPendiente(supabase: Supabase, usuarioId: string, id: string) {
  if (/^[0-9a-f-]{36}$/i.test(id)) await supabase.storage.from(BUCKET).remove([ruta(usuarioId, id)])
}
