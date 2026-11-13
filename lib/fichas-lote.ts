// Lote "Completar fichas con IA" en segundo plano: el dueño lo enciende desde el panel y pg_cron llama
// cada minuto a /api/fichas-ia, que avanza unos productos por corrida (ver supabase/FICHAS_IA.md).
// Así sigue aunque el panel se cierre. Todo queda en borrador para que el dueño lo revise.
import type { SupabaseClient } from '@supabase/supabase-js'
import { cambiosPorFicha, ErrorConfiguracionIA, ErrorCuotaIA, ErrorTemporalIA, generarFicha } from './ia'
import { supabaseServicio } from './supabase/servicio'
import type { ConfianzaIA } from './tipos'

/** Espera antes de cada reintento del mismo producto cuando la IA falla de forma pasajera (503, tiempo agotado…). */
export const REINTENTOS_MS = [5_000, 15_000, 30_000]
/** Con tantos productos seguidos fallando en la IA se apaga el lote: el proveedor está caído. */
export const MAX_ERRORES_SEGUIDOS = 5
/** Con la cuota agotada (por minuto o por día) el lote queda en pausa y se retoma solo: reintentar no cuesta nada. */
const PAUSA_CUOTA_MIN = 15
/** Cada corrida termina antes de esto (la ruta tiene maxDuration = 300 s)… */
const PRESUPUESTO_MS = 240_000
/** …y solo empieza una llamada si le queda este margen: lo que puede tardar la IA, la foto y el guardado. */
const MARGEN_LLAMADA_MS = 105_000
/** El turno vence solo, por si la plataforma corta la corrida sin que lo devuelva. */
const TURNO_S = 290

export const AVISO_CAIDA = 'Gemini no está respondiendo, intenta más tarde.'

const pausaEntreProductos = () => Math.max(0, Number(process.env.TIENDA_IA_PAUSA_MS) || 13_000)
const esperar = (ms: number) => new Promise((listo) => setTimeout(listo, ms))

export type ResultadoFichaIA =
  | { tipo: 'ok'; nombre: string; confianza: ConfianzaIA }
  | { tipo: 'omitido' } // ya tenía ficha o ya no existe
  | { tipo: 'cuota'; mensaje: string } // límite del proveedor: pausa sin marcar nada
  | { tipo: 'configuracion'; mensaje: string } // falta la clave: se apaga el lote sin marcar nada
  | { tipo: 'temporal'; nombre: string; mensaje: string } // 500, 503, tiempo agotado o red: se reintenta
  | { tipo: 'error'; nombre: string; mensaje: string; origen: 'ia' | 'guardar' }

/** Error de Supabase con todo lo que trae, para ver en el panel por qué no se guardó. */
export function textoErrorBase(e: { message: string; code?: string; details?: string | null; hint?: string | null }) {
  return [e.message, e.code && `código ${e.code}`, e.details, e.hint && `pista: ${e.hint}`].filter(Boolean).join(' · ')
}

/** Errores seguidos de la IA tras este resultado. Un error al guardar es de ese producto, no del proveedor. */
export function erroresSeguidos(antes: number, r: ResultadoFichaIA) {
  if (r.tipo === 'omitido') return antes
  return r.tipo === 'error' && r.origen === 'ia' ? antes + 1 : 0
}

const CAMPOS = 'id, nombre, marca, presentacion_ml, fotos, origen_foto, genero, ocasion, notas, descripcion_estado'

/** Pide la ficha de un producto y la guarda. Si algo falla no se toca el producto: sigue en 'sin'. */
async function completarFicha(db: SupabaseClient, id: string): Promise<ResultadoFichaIA> {
  const { data: p } = await db.from('productos').select(CAMPOS).eq('id', id).maybeSingle()
  if (!p || p.descripcion_estado !== 'sin') return { tipo: 'omitido' }
  try {
    const f = await generarFicha({
      nombre: p.nombre,
      marca: p.marca,
      ml: p.presentacion_ml ? Number(p.presentacion_ml) : null,
      origenFoto: p.origen_foto,
      foto: p.fotos?.[0] ?? null,
    })
    const { error } = await db.from('productos').update(cambiosPorFicha(p, f)).eq('id', id).eq('descripcion_estado', 'sin')
    if (error) {
      console.error('[fichas IA] No se pudo guardar la ficha', { id, nombre: p.nombre, ...error })
      return { tipo: 'error', nombre: p.nombre, mensaje: `No se guardó: ${textoErrorBase(error)}`, origen: 'guardar' }
    }
    return { tipo: 'ok', nombre: f.nombre_sugerido ? [f.marca_sugerida, f.nombre_sugerido].filter(Boolean).join(' ') : p.nombre, confianza: f.confianza }
  } catch (e) {
    if (e instanceof ErrorCuotaIA) return { tipo: 'cuota', mensaje: e.message }
    if (e instanceof ErrorConfiguracionIA) return { tipo: 'configuracion', mensaje: e.message }
    if (e instanceof ErrorTemporalIA) return { tipo: 'temporal', nombre: p.nombre, mensaje: e.message }
    return { tipo: 'error', nombre: p.nombre, mensaje: e instanceof Error ? e.message : 'Error de la IA', origen: 'ia' }
  }
}

async function sigueEncendido(db: SupabaseClient) {
  const { data } = await db.from('configuracion').select('ia_lote_activo').eq('id', 1).single()
  return Boolean(data?.ia_lote_activo)
}

/**
 * Reintenta las fallas pasajeras con espera creciente. null = se apagó el lote o no queda tiempo en esta
 * corrida: el producto queda como estaba y la próxima corrida lo retoma.
 */
async function conReintentos(db: SupabaseClient, id: string, queda: () => number): Promise<ResultadoFichaIA | null> {
  for (let intento = 0; ; intento++) {
    const r = await completarFicha(db, id)
    if (r.tipo !== 'temporal') return r
    if (intento >= REINTENTOS_MS.length) return { tipo: 'error', nombre: r.nombre, mensaje: `${r.mensaje} (tras ${REINTENTOS_MS.length} reintentos)`, origen: 'ia' }
    if (queda() < REINTENTOS_MS[intento] + MARGEN_LLAMADA_MS) return null
    console.warn(`[fichas IA] ${r.nombre}: ${r.mensaje}. Reintento ${intento + 1} de ${REINTENTOS_MS.length}.`)
    await esperar(REINTENTOS_MS[intento])
    if (!(await sigueEncendido(db))) return null
  }
}

/** Productos sin ficha que este lote aún no intentó, primero los publicados (los ve el cliente). */
async function pendientes(db: SupabaseClient, iniciadoEn: string | null) {
  const [{ data: sin }, { data: fallidos }] = await Promise.all([
    db.from('productos').select('id, estado').eq('descripcion_estado', 'sin').order('nombre').limit(2000),
    db.from('fichas_ia_registro').select('producto_id').eq('resultado', 'error').gte('en', iniciadoEn ?? new Date(0).toISOString()),
  ])
  const saltar = new Set((fallidos ?? []).map((f) => f.producto_id as string))
  const orden = { publicado: 0, borrador: 1, oculto: 2 } as Record<string, number>
  return (sin ?? [])
    .filter((p) => !saltar.has(p.id as string))
    .sort((a, b) => (orden[a.estado] ?? 3) - (orden[b.estado] ?? 3))
    .map((p) => p.id as string)
}

async function anotar(db: SupabaseClient, id: string, r: ResultadoFichaIA) {
  if (r.tipo !== 'ok' && r.tipo !== 'error') return
  const fila: { producto_id: string; nombre: string; resultado: 'ok' | 'error'; confianza: ConfianzaIA | null; detalle: string | null; en: string } = r.tipo === 'ok'
    ? { producto_id: id, nombre: r.nombre, resultado: 'ok', confianza: r.confianza, detalle: null, en: new Date().toISOString() }
    : { producto_id: id, nombre: r.nombre, resultado: 'error', confianza: null, detalle: r.mensaje.slice(0, 500), en: new Date().toISOString() }
  const { error } = await db.from('fichas_ia_registro').upsert(fila)
  if (error) console.error('[fichas IA] No se pudo anotar el resultado', { id, ...error })
}

const config = (db: SupabaseClient, cambios: Record<string, unknown>) =>
  db.from('configuracion').update({ ...cambios, ia_lote_latido_en: new Date().toISOString() }).eq('id', 1)

/**
 * Una corrida del lote: toma el turno, completa productos mientras quede tiempo y lo devuelve.
 * Si otra corrida está en curso, el lote está apagado o en pausa, no hace nada.
 */
export async function avanzarLoteIA(): Promise<string> {
  const db = supabaseServicio()
  const { data: turno, error } = await db.rpc('tomar_turno_fichas_ia', { p_segundos: TURNO_S })
  if (error) {
    console.error('[fichas IA] No se pudo tomar el turno', error)
    return 'error'
  }
  if (!turno) return 'sin turno'

  const inicio = Date.now()
  const queda = () => PRESUPUESTO_MS - (Date.now() - inicio)
  try {
    const { data: cfg } = await db.from('configuracion').select('ia_lote_iniciado_en, ia_lote_errores_seguidos').eq('id', 1).single()
    const ids = await pendientes(db, cfg?.ia_lote_iniciado_en ?? null)
    if (!ids.length) {
      await config(db, { ia_lote_activo: false, ia_lote_pausa_hasta: null, ia_lote_errores_seguidos: 0 })
      return 'terminado'
    }
    let seguidos = cfg?.ia_lote_errores_seguidos ?? 0
    for (let i = 0; i < ids.length; i++) {
      if (queda() < MARGEN_LLAMADA_MS || !(await sigueEncendido(db))) break
      const r = await conReintentos(db, ids[i], queda)
      if (!r) break
      if (r.tipo === 'cuota') {
        await config(db, { ia_lote_pausa_hasta: new Date(Date.now() + PAUSA_CUOTA_MIN * 60_000).toISOString(), ia_lote_aviso: r.mensaje })
        return 'cuota'
      }
      if (r.tipo === 'configuracion') {
        await config(db, { ia_lote_activo: false, ia_lote_errores_seguidos: 0, ia_lote_aviso: r.mensaje })
        return 'configuracion'
      }
      await anotar(db, ids[i], r)
      seguidos = erroresSeguidos(seguidos, r)
      if (seguidos >= MAX_ERRORES_SEGUIDOS) {
        // Se apaga: el siguiente toque del botón empieza un lote nuevo y reintenta todos los que fallaron.
        await config(db, { ia_lote_activo: false, ia_lote_errores_seguidos: 0, ia_lote_aviso: AVISO_CAIDA })
        return 'caida'
      }
      await config(db, { ia_lote_errores_seguidos: seguidos, ...(r.tipo === 'ok' ? { ia_lote_aviso: null } : {}) })
      if (r.tipo !== 'omitido' && i < ids.length - 1) await esperar(pausaEntreProductos())
    }
    return 'avanzó'
  } catch (e) {
    console.error('[fichas IA] La corrida falló', e)
    return 'error'
  } finally {
    await config(db, { ia_lote_ocupado_hasta: null })
  }
}

export type EstadoLoteIA = {
  activo: boolean
  /** Pausa por cuota: se retoma solo a esta hora. */
  pausaHasta: string | null
  aviso: string | null
  /** Productos sin ficha en la tienda (incluye los que fallaron en este lote). */
  sinFicha: number
  /** Resultados del lote actual o del último (si fue en las últimas 24 h). */
  lote: {
    alta: number
    media: number
    baja: number
    error: number
    recientes: { nombre: string; detalle: string; tono: 'ok' | 'dorado' | 'alerta' }[]
  } | null
}

const TONO: Record<ConfianzaIA, 'ok' | 'dorado' | 'alerta'> = { alta: 'ok', media: 'dorado', baja: 'alerta' }

/** Estado del lote para el panel. Usa el cliente con la sesión del dueño (RLS). */
export async function leerEstadoLoteIA(supabase: SupabaseClient): Promise<EstadoLoteIA> {
  const [{ data: cfg }, { count: sinFicha }] = await Promise.all([
    supabase.from('configuracion').select('ia_lote_activo, ia_lote_iniciado_en, ia_lote_pausa_hasta, ia_lote_aviso, ia_lote_latido_en').eq('id', 1).single(),
    supabase.from('productos').select('id', { count: 'exact', head: true }).eq('descripcion_estado', 'sin'),
  ])
  const activo = Boolean(cfg?.ia_lote_activo)
  const pausaHasta = activo && cfg?.ia_lote_pausa_hasta && new Date(cfg.ia_lote_pausa_hasta) > new Date() ? cfg.ia_lote_pausa_hasta : null
  const reciente = cfg?.ia_lote_latido_en && Date.now() - new Date(cfg.ia_lote_latido_en).getTime() < 24 * 3600_000

  let lote: EstadoLoteIA['lote'] = null
  if (cfg?.ia_lote_iniciado_en && (activo || reciente)) {
    const { data } = await supabase
      .from('fichas_ia_registro')
      .select('nombre, resultado, confianza, detalle, en')
      .gte('en', cfg.ia_lote_iniciado_en)
      .order('en', { ascending: false })
      .limit(5000)
    const filas = data ?? []
    if (activo || filas.length) {
      const contar = (f: (x: (typeof filas)[number]) => boolean) => filas.filter(f).length
      lote = {
        alta: contar((x) => x.confianza === 'alta'),
        media: contar((x) => x.confianza === 'media'),
        baja: contar((x) => x.resultado === 'ok' && x.confianza !== 'alta' && x.confianza !== 'media'),
        error: contar((x) => x.resultado === 'error'),
        recientes: filas.slice(0, 6).map((x) =>
          x.resultado === 'error'
            ? { nombre: x.nombre, detalle: x.detalle ?? 'Error', tono: 'alerta' as const }
            : { nombre: x.nombre, detalle: `confianza ${x.confianza}`, tono: TONO[x.confianza as ConfianzaIA] ?? 'alerta' }),
      }
    }
  }
  return { activo, pausaHasta, aviso: cfg?.ia_lote_aviso ?? null, sinFicha: sinFicha ?? 0, lote }
}
