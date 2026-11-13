// Fichas de perfumes con IA. Siempre quedan como borrador: una persona las aprueba.
// El prompt y la validación son comunes; cada proveedor (Gemini o Anthropic) solo envía el pedido y devuelve el texto.
import { OCASIONES, TEMPORADAS, type ConfianzaIA, type Momento } from './tipos'
import { marca } from '@/marca.config'

export interface FichaIA {
  marca_sugerida: string | null
  nombre_sugerido: string | null
  confianza: ConfianzaIA
  descripcion: string
  momento: Momento | null
  temporadas: string[]
  ocasion: string[]
  notas_salida: string[]
  notas_corazon: string[]
  notas_fondo: string[]
  familia_olfativa: string | null
  genero: 'hombre' | 'mujer' | 'unisex' | null
  /** Unión de las tres capas de notas, para la columna `notas` de siempre. */
  notas: string[]
  seguro: boolean // false = la IA no reconoce el perfume con certeza; revisar con más cuidado
}

/** Lo que se le cuenta a la IA de cada producto. */
export interface EntradaFicha {
  /** Nombre en el sistema administrativo: en minúsculas y normalmente sin marca (ej. "khamrah clasico"). */
  nombre: string
  marca?: string | null
  ml: number | null
  /** Nombre del producto en la web anterior; suele traer la marca. */
  origenFoto?: string | null
  /** URL de la primera foto: se descarga en el servidor y se envía junto al texto. */
  foto?: string | null
}

/** Se alcanzó el límite de uso del proveedor (p. ej. la capa gratuita de Gemini por hoy). */
export class ErrorCuotaIA extends Error {
  constructor() {
    super('Se alcanzó el límite de uso de la IA (la capa gratuita de Gemini tiene un tope por minuto y por día).')
    this.name = 'ErrorCuotaIA'
  }
}

/** Falta la clave, no es válida o el modelo no existe: no tiene sentido seguir con otros productos. */
export class ErrorConfiguracionIA extends Error {
  constructor(mensaje: string) {
    super(`${mensaje} Corrígelo en Vercel (Settings → Environment Variables) y vuelve a desplegar.`)
    this.name = 'ErrorConfiguracionIA'
  }
}

/** Falla pasajera del proveedor (500, 503, tiempo agotado, red): vale la pena reintentar el mismo producto. */

export class ErrorTemporalIA extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorTemporalIA'
  }
}

const SISTEMA = `Eres quien escribe las fichas de ${marca.contextoIA}.
Te paso los datos de un producto del inventario: el nombre del sistema (en minúsculas y normalmente sin la marca),
la presentación en ml y, a veces, el nombre que tenía en la web anterior y una foto.

PRIMERO identifica el producto: di la marca y el nombre comercial correcto con su escritura oficial
(ej. "khamrah clasico" -> marca "Lattafa", nombre "Khamrah"), y qué tan seguro estás:
- "alta": sabes exactamente qué perfume es (el nombre, la foto o la web anterior no dejan dudas).
- "media": es muy probable, pero hay versiones o marcas parecidas.
- "baja": no lo reconoces o el nombre es genérico.
Si no lo sabes, marca_sugerida y nombre_sugerido van en null. No adivines la marca.

LUEGO escribe la ficha en español neutro, cercano y con chispa, sin exagerar ni usar clichés de lujo. Nada de emojis.
Reglas estrictas, sin excepción:
- Nunca inventes datos. Si la confianza NO es "alta": las tres listas de notas van vacías, familia_olfativa en null,
  y la descripción es general (basada solo en el tipo de producto y su nombre), sin afirmar ingredientes ni notas.
- Sets, body sprays, lociones, cremas y productos genéricos (ej. "locion", "body sprays") se describen como lo que son:
  no los presentes como un perfume concreto ni les inventes notas.
- Solo usa los valores permitidos que se indican.

Responde SOLO con un objeto JSON con esta forma:
{"marca_sugerida": "marca oficial" | null,
 "nombre_sugerido": "nombre comercial oficial, sin la marca ni los ml" | null,
 "confianza": "alta" | "media" | "baja",
 "descripcion": "2 o 3 frases, máximo 60 palabras, que cuenten cómo huele y cuándo usarlo",
 "momento": "dia" | "noche" | "ambos" | null,
 "temporadas": [elige de: ${Object.keys(TEMPORADAS).map((t) => `"${t}"`).join(', ')}],
 "ocasion": [elige de: ${OCASIONES.map((o) => `"${o}"`).join(', ')}],
 "notas_salida": ["hasta 4 notas"],
 "notas_corazon": ["hasta 4 notas"],
 "notas_fondo": ["hasta 4 notas"],
 "familia_olfativa": "ej. Oriental amaderada" | null,
 "genero": "hombre" | "mujer" | "unisex" | null}`

/** Texto que acompaña a la foto: solo los datos que existen. */
export function pedidoFicha(p: EntradaFicha, conFoto: boolean) {
  return [
    'Producto del inventario:',
    `- Nombre en el sistema: "${p.nombre}"`,
    p.marca ? `- Marca registrada en el sistema: "${p.marca}"` : null,
    p.ml ? `- Presentación: ${p.ml} ml` : null,
    p.origenFoto ? `- Nombre en la web anterior (suele traer la marca): "${p.origenFoto}"` : null,
    conFoto ? '- Se adjunta la foto del producto.' : '- No hay foto.',
  ]
    .filter(Boolean)
    .join('\n')
}

type Foto = { mime: string; base64: string }
const MAX_FOTO = 1024 * 1024

/** Descarga la foto en el servidor; si pesa más de ~1 MB la reduce. Si algo falla, se sigue sin foto. */
async function descargarFoto(url: string | null | undefined): Promise<Foto | null> {
  if (!url || !/^https:\/\//i.test(url)) return null
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    const tipo = r.headers.get('content-type')?.split(';')[0].trim() ?? ''
    if (!r.ok || !/^image\/(jpeg|png|webp|gif)$/.test(tipo)) return null
    let bytes = Buffer.from(await r.arrayBuffer())
    let mime = tipo
    if (bytes.byteLength > MAX_FOTO) {
      const sharp = (await import('sharp')).default
      bytes = await sharp(bytes).resize({ width: 1024, height: 1024, fit: 'inside' }).jpeg({ quality: 80 }).toBuffer()
      mime = 'image/jpeg'
      if (bytes.byteLength > MAX_FOTO) return null
    }
    return { mime, base64: bytes.toString('base64') }
  } catch {
    return null
  }
}

const esCuota = (estado: number, cuerpo: string) => estado === 429 || /RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(cuerpo)
const ESPERA_IA_MS = 90_000

/** El motivo que trae el cuerpo de error de Gemini o Anthropic ({"error": {"message": …}}), recortado. */
function motivoError(cuerpo: string) {
  try {
    const m = (JSON.parse(cuerpo) as { error?: { message?: unknown } }).error?.message
    return typeof m === 'string' ? m.slice(0, 200) : ''
  } catch {
    return ''
  }
}

/** Llama al proveedor y devuelve el JSON; separa cuota, configuración, fallas pasajeras y errores definitivos. */
async function llamarIA<T>(url: string, init: RequestInit, ajustes: { modelo: string; variableModelo: string; variableClave: string }): Promise<T> {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(ESPERA_IA_MS) })
    if (!r.ok) {
      const cuerpo = await r.text()
      const motivo = motivoError(cuerpo)
      if (esCuota(r.status, cuerpo)) throw new ErrorCuotaIA()
      if (r.status === 404) throw new ErrorConfiguracionIA(`El modelo "${ajustes.modelo}" no está disponible para esta clave. Revisa ${ajustes.variableModelo}.`)
      // Gemini responde 400 "API key not valid" con una clave mal copiada.
      if (r.status === 401 || r.status === 403 || /api.?key/i.test(motivo)) throw new ErrorConfiguracionIA(`La clave ${ajustes.variableClave} no es válida o no tiene permiso${motivo ? ` (${motivo})` : ''}.`)
      // 529: Anthropic saturado. 408: tiempo agotado del lado del proveedor.
      if (r.status >= 500 || r.status === 408) throw new ErrorTemporalIA(`La IA respondió con error ${r.status}`)
      throw new Error(`La IA respondió con error ${r.status}${motivo ? `: ${motivo}` : ''}`)
    }
    return (await r.json()) as T
  } catch (e) {
    if (e instanceof ErrorCuotaIA || e instanceof ErrorTemporalIA || e instanceof ErrorConfiguracionIA) throw e
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new ErrorTemporalIA('La IA tardó demasiado en responder')
    // fetch lanza TypeError cuando no hay conexión (DNS, conexión cortada…).
    if (e instanceof TypeError) throw new ErrorTemporalIA('No se pudo conectar con la IA')
    throw e
  }
}

async function pedirGemini(texto: string, foto: Foto | null): Promise<string> {
  const clave = process.env.GEMINI_API_KEY
  if (!clave) throw new ErrorConfiguracionIA('Falta configurar GEMINI_API_KEY en el servidor.')
  const modelo = process.env.TIENDA_MODELO_GEMINI || 'gemini-3.8-flash'
  // La clave va en el header, nunca en la URL (las URLs quedan en registros).
  const json = await llamarIA<{ candidates?: { content?: { parts?: { text?: string }[] } }[] }>(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': clave },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SISTEMA }] },
      contents: [{ role: 'user', parts: [{ text: texto }, ...(foto ? [{ inlineData: { mimeType: foto.mime, data: foto.base64 } }] : [])] }],
      // Gemini 3 en adelante pide dejar la temperatura por defecto (1.0); bajarla puede hacer que repita texto.
      generationConfig: { responseMimeType: 'application/json', ...(/^gemini-2/.test(modelo) ? { temperature: 0.3 } : {}) },
    }),
  }, { modelo, variableModelo: 'TIENDA_MODELO_GEMINI', variableClave: 'GEMINI_API_KEY' })
  return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
}

async function pedirAnthropic(texto: string, foto: Foto | null): Promise<string> {
  const clave = process.env.ANTHROPIC_API_KEY
  if (!clave) throw new ErrorConfiguracionIA('Falta configurar ANTHROPIC_API_KEY en el servidor.')
  const modelo = process.env.TIENDA_MODELO_IA ?? 'claude-haiku-5-5'
  const json = await llamarIA<{ content?: { type: string; text?: string }[] }>('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': clave, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: modelo,
      max_tokens: 1200,
      system: SISTEMA,
      messages: [{
        role: 'user',
        content: [
          ...(foto ? [{ type: 'image', source: { type: 'base64', media_type: foto.mime, data: foto.base64 } }] : []),
          { type: 'text', text: texto },
        ],
      }],
    }),
  }, { modelo, variableModelo: 'TIENDA_MODELO_IA', variableClave: 'ANTHROPIC_API_KEY' })
  return json.content?.find((c) => c.type === 'text')?.text ?? ''
}

/** TIENDA_IA_PROVEEDOR: 'gemini' (por defecto) o 'anthropic'. */
export function proveedorIA(): 'gemini' | 'anthropic' {
  return process.env.TIENDA_IA_PROVEEDOR === 'anthropic' ? 'anthropic' : 'gemini'
}

export async function generarFicha(p: EntradaFicha): Promise<FichaIA> {
  const foto = await descargarFoto(p.foto)
  const texto = pedidoFicha(p, Boolean(foto))
  const respuesta = proveedorIA() === 'anthropic' ? await pedirAnthropic(texto, foto) : await pedirGemini(texto, foto)
  return validarFicha(respuesta)
}

/** Para comparar respuestas de la IA: sin tildes, mayúsculas ni espacios de más ("Día " → "dia"). */
const comparable = (v: unknown) =>
  typeof v === 'string' ? v.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim() : ''

/** Texto apto para la base: Postgres rechaza el carácter nulo y los caracteres de control no sirven en una ficha. */
const limpio = (v: string) => v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()

/** Busca el valor permitido que corresponde a lo que mandó la IA (o a uno de sus sinónimos). */
function elegir<T extends string>(v: unknown, permitidos: Record<string, T>): T | null {
  const k = comparable(v)
  // hasOwn: que "constructor" o "toString" no encuentren algo del prototipo.
  return Object.hasOwn(permitidos, k) ? permitidos[k] : null
}

const MOMENTOS_IA: Record<string, Momento> = {
  dia: 'dia', diurno: 'dia', manana: 'dia', day: 'dia',
  noche: 'noche', nocturno: 'noche', night: 'noche',
  ambos: 'ambos', 'dia y noche': 'ambos', 'dia/noche': 'ambos', 'todo el dia': 'ambos', cualquiera: 'ambos', both: 'ambos',
}
const GENEROS_IA: Record<string, NonNullable<FichaIA['genero']>> = {
  hombre: 'hombre', hombres: 'hombre', masculino: 'hombre', caballero: 'hombre', men: 'hombre', male: 'hombre',
  mujer: 'mujer', mujeres: 'mujer', femenino: 'mujer', dama: 'mujer', women: 'mujer', female: 'mujer',
  unisex: 'unisex', ambos: 'unisex', mixto: 'unisex',
}
const CONFIANZAS_IA: Record<string, ConfianzaIA> = { alta: 'alta', high: 'alta', media: 'media', medium: 'media', baja: 'baja', low: 'baja' }
const TEMPORADAS_IA: Record<string, string> = {
  ...Object.fromEntries(Object.keys(TEMPORADAS).map((t) => [t, t])),
  spring: 'primavera', summer: 'verano', autumn: 'otono', fall: 'otono', winter: 'invierno',
}
const OCASIONES_IA: Record<string, string> = Object.fromEntries(OCASIONES.map((o) => [comparable(o), o]))

/**
 * Acepta solo lo que encaja con la ficha y con los check de la base (migración 0008): normaliza mayúsculas,
 * tildes y sinónimos, y descarta lo que quede fuera de lista. Un valor raro nunca impide guardar la ficha.
 * Con confianza que no sea alta, no deja notas.
 */
export function validarFicha(texto: string): FichaIA {
  const inicio = texto.indexOf('{')
  const fin = texto.lastIndexOf('}')
  if (inicio < 0 || fin < inicio) throw new Error('La IA no devolvió una ficha válida')
  let d: Record<string, unknown>
  try {
    const crudo: unknown = JSON.parse(texto.slice(inicio, fin + 1))
    d = crudo && typeof crudo === 'object' && !Array.isArray(crudo) ? (crudo as Record<string, unknown>) : {}
  } catch {
    throw new Error('La IA no devolvió una ficha válida')
  }
  /** Lista de textos sin repetir; acepta también un texto suelto separado por comas. */
  const textos = (v: unknown) =>
    (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [])
      .filter((x): x is string | number => typeof x === 'string' || typeof x === 'number')
      .map((x) => limpio(String(x)))
      .filter(Boolean)
  const lista = (v: unknown, max = 8) => {
    const vistos = new Set<string>()
    return textos(v).map((x) => x.slice(0, 60)).filter((x) => !vistos.has(comparable(x)) && vistos.add(comparable(x))).slice(0, max)
  }
  const deLista = (v: unknown, permitidos: Record<string, string>) =>
    [...new Set(textos(v).map((x) => elegir(x, permitidos)).filter((x): x is string => x !== null))]
  const corto = (v: unknown, max = 80) => {
    const t = typeof v === 'string' ? limpio(v).slice(0, max) : ''
    return t && !['null', 'ninguno', 'ninguna', 'desconocido', 'desconocida', 'n/a'].includes(comparable(t)) ? t : null
  }

  const descripcion = typeof d.descripcion === 'string' ? limpio(d.descripcion).slice(0, 600) : ''
  if (!descripcion) throw new Error('La IA no devolvió una descripción')
  const confianza = elegir(d.confianza, CONFIANZAS_IA) ?? 'baja'
  const seguro = confianza === 'alta'
  // Regla estricta: sin certeza no hay notas ni familia olfativa, aunque la IA las haya puesto.
  const salida = seguro ? lista(d.notas_salida, 4) : []
  const corazon = seguro ? lista(d.notas_corazon, 4) : []
  const fondo = seguro ? lista(d.notas_fondo, 4) : []

  return {
    marca_sugerida: corto(d.marca_sugerida),
    nombre_sugerido: corto(d.nombre_sugerido, 120),
    confianza,
    descripcion,
    momento: elegir(d.momento, MOMENTOS_IA),
    temporadas: deLista(d.temporadas, TEMPORADAS_IA),
    ocasion: deLista(d.ocasion, OCASIONES_IA),
    notas_salida: salida,
    notas_corazon: corazon,
    notas_fondo: fondo,
    familia_olfativa: seguro ? corto(d.familia_olfativa) : null,
    genero: elegir(d.genero, GENEROS_IA),
    notas: lista([...salida, ...corazon, ...fondo], 12),
    seguro,
  }
}

/**
 * Cambios a guardar en productos con una ficha nueva: todo queda en borrador para revisión.
 * `notas` toma la unión de las tres capas; género y ocasiones solo se llenan si estaban vacíos.
 */
export function cambiosPorFicha(actual: { genero: string | null; ocasion: string[] | null; notas: string[] | null }, f: FichaIA) {
  return {
    descripcion: f.descripcion,
    descripcion_estado: 'borrador' as const,
    marca_sugerida: f.marca_sugerida,
    nombre_sugerido: f.nombre_sugerido,
    momento: f.momento,
    temporadas: f.temporadas,
    notas_salida: f.notas_salida,
    notas_corazon: f.notas_corazon,
    notas_fondo: f.notas_fondo,
    familia_olfativa: f.familia_olfativa,
    ia_confianza: f.confianza,
    ia_generada_en: new Date().toISOString(),
    notas: f.notas.length ? f.notas : (actual.notas ?? []),
    genero: actual.genero ?? f.genero,
    ocasion: actual.ocasion?.length ? actual.ocasion : f.ocasion,
  }
}
