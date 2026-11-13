// Función de Supabase (Deno): consulta la tasa oficial del dólar y la registra con su fecha valor.
// Fuente principal: página del BCV. Respaldo: DolarAPI (el BCV cae seguido o rechaza IPs de fuera de Venezuela).
// La llama pg_cron cada 2 horas con el encabezado x-cron-secret (ver supabase/TASA_AUTOMATICA.md).
// Se despliega con la verificación de JWT desactivada: la protege el secreto CRON_SECRET.
// La lectura de las páginas es la misma de lib/bcv.ts (probada en lib/logica.test.ts): si cambias una, cambia la otra.
import { createClient } from 'npm:@supabase/supabase-js@2'

const URL_BCV = 'https://www.bcv.org.ve/'
const URL_DOLARAPI = 'https://ve.dolarapi.com/v1/dolares/oficial'
const TIEMPO_MAXIMO_MS = 20000

// El servidor del BCV no envía su certificado intermedio y la conexión falla al validarlo.
// Este es ese intermedio (Sectigo Public Server Authentication CA DV R36, vence en 2036),
// tomado de http://crt.sectigo.com/SectigoPublicServerAuthenticationCADVR36.crt.
const CA_SECTIGO_DV_R36 = `-----BEGIN CERTIFICATE-----
MIIGTDCCBDSgAwIBAgIQOXpmzCdWNi4NqofKbqvjsTANBgkqhkiG9w0BAQwFADBf
MQswCQYDVQQGEwJHQjEYMBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTYwNAYDVQQD
Ey1TZWN0aWdvIFB1YmxpYyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gUm9vdCBSNDYw
HhcNMjEwMzIyMDAwMDAwWhcNMzYwMzIxMjM1OTU5WjBgMQswCQYDVQQGEwJHQjEY
MBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTcwNQYDVQQDEy5TZWN0aWdvIFB1Ymxp
YyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gQ0EgRFYgUjM2MIIBojANBgkqhkiG9w0B
AQEFAAOCAY8AMIIBigKCAYEAljZf2HIz7+SPUPQCQObZYcrxLTHYdf1ZtMRe7Yeq
RPSwygz16qJ9cAWtWNTcuICc++p8Dct7zNGxCpqmEtqifO7NvuB5dEVexXn9RFFH
12Hm+NtPRQgXIFjx6MSJcNWuVO3XGE57L1mHlcQYj+g4hny90aFh2SCZCDEVkAja
EMMfYPKuCjHuuF+bzHFb/9gV8P9+ekcHENF2nR1efGWSKwnfG5RawlkaQDpRtZTm
M64TIsv/r7cyFO4nSjs1jLdXYdz5q3a4L0NoabZfbdxVb+CUEHfB0bpulZQtH1Rv
38e/lIdP7OTTIlZh6OYL6NhxP8So0/sht/4J9mqIGxRFc0/pC8suja+wcIUna0HB
pXKfXTKpzgis+zmXDL06ASJf5E4A2/m+Hp6b84sfPAwQ766rI65mh50S0Di9E3Pn
2WcaJc+PILsBmYpgtmgWTR9eV9otfKRUBfzHUHcVgarub/XluEpRlTtZudU5xbFN
xx/DgMrXLUAPaI60fZ6wA+PTAgMBAAGjggGBMIIBfTAfBgNVHSMEGDAWgBRWc1hk
lfmSGrASKgRieaFAFYghSTAdBgNVHQ4EFgQUaMASFhgOr872h6YyV6NGUV3LBycw
DgYDVR0PAQH/BAQDAgGGMBIGA1UdEwEB/wQIMAYBAf8CAQAwHQYDVR0lBBYwFAYI
KwYBBQUHAwEGCCsGAQUFBwMCMBsGA1UdIAQUMBIwBgYEVR0gADAIBgZngQwBAgEw
VAYDVR0fBE0wSzBJoEegRYZDaHR0cDovL2NybC5zZWN0aWdvLmNvbS9TZWN0aWdv
UHVibGljU2VydmVyQXV0aGVudGljYXRpb25Sb290UjQ2LmNybDCBhAYIKwYBBQUH
AQEEeDB2ME8GCCsGAQUFBzAChkNodHRwOi8vY3J0LnNlY3RpZ28uY29tL1NlY3Rp
Z29QdWJsaWNTZXJ2ZXJBdXRoZW50aWNhdGlvblJvb3RSNDYucDdjMCMGCCsGAQUF
BzABhhdodHRwOi8vb2NzcC5zZWN0aWdvLmNvbTANBgkqhkiG9w0BAQwFAAOCAgEA
YtOC9Fy+TqECFw40IospI92kLGgoSZGPOSQXMBqmsGWZUQ7rux7cj1du6d9rD6C8
ze1B2eQjkrGkIL/OF1s7vSmgYVafsRoZd/IHUrkoQvX8FZwUsmPu7amgBfaY3g+d
q1x0jNGKb6I6Bzdl6LgMD9qxp+3i7GQOnd9J8LFSietY6Z4jUBzVoOoz8iAU84OF
h2HhAuiPw1ai0VnY38RTI+8kepGWVfGxfBWzwH9uIjeooIeaosVFvE8cmYUB4TSH
5dUyD0jHct2+8ceKEtIoFU/FfHq/mDaVnvcDCZXtIgitdMFQdMZaVehmObyhRdDD
4NQCs0gaI9AAgFj4L9QtkARzhQLNyRf87Kln+YU0lgCGr9HLg3rGO8q+Y4ppLsOd
unQZ6ZxPNGIfOApbPVf5hCe58EZwiWdHIMn9lPP6+F404y8NNugbQixBber+x536
WrZhFZLjEkhp7fFXf9r32rNPfb74X/U90Bdy4lzp3+X1ukh1BuMxA/EEhDoTOS3l
7ABvc7BYSQubQ2490OcdkIzUh3ZwDrakMVrbaTxUM2p24N6dB+ns2zptWCva6jzW
r8IWKIMxzxLPv5Kt3ePKcUdvkBU/smqujSczTzzSjIoR5QqQA6lN1ZRSnuHIWCvh
JEltkYnTAH41QJ6SAWO66GrrUESwN/cgZzL4JLEqz1Y=
-----END CERTIFICATE-----`

type Lectura = { tasa: number; fechaValor: string; origen: 'bcv' | 'dolarapi' }

// "1.234,56" (venezolano) o "1234.56" → número.
function parsearNumero(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  if (valor === null || valor === undefined) return null
  let t = String(valor).replace(/[^\d,.-]/g, '')
  if (t === '' || t === '-') return null
  t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
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

function parsearTasaBcv(html: string): Omit<Lectura, 'origen'> {
  const bloque = html.match(/id=["']dolar["'][\s\S]*?<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i)
  if (!bloque) throw new Error('No se encontró la tasa del dólar en la página del BCV')
  const fecha = html.match(/Fecha\s+Valor[\s\S]{0,300}?content=["'](\d{4}-\d{2}-\d{2})/i)
  if (!fecha) throw new Error('No se encontró la fecha valor en la página del BCV')
  return { tasa: validarTasa(parsearNumero(bloque[1]), bloque[1]), fechaValor: validarFecha(fecha[1]) }
}

function parsearTasaDolarApi(datos: unknown): Omit<Lectura, 'origen'> {
  const d = (datos ?? {}) as { promedio?: unknown; fechaActualizacion?: unknown }
  const fecha = typeof d.fechaActualizacion === 'string' ? d.fechaActualizacion.match(/^(\d{4}-\d{2}-\d{2})/) : null
  if (!fecha) throw new Error('DolarAPI no trajo la fecha de la tasa')
  return { tasa: validarTasa(parsearNumero(d.promedio), String(d.promedio)), fechaValor: validarFecha(fecha[1]) }
}

// Cliente HTTP que confía además en el intermedio del BCV. Si el entorno no lo permite, se usa fetch normal.
type ClienteHttp = { close(): void }
function crearClienteBcv(): ClienteHttp | undefined {
  const crear = (Deno as unknown as { createHttpClient?: (o: { caCerts: string[] }) => ClienteHttp }).createHttpClient
  try {
    return crear?.({ caCerts: [CA_SECTIGO_DV_R36] })
  } catch {
    return undefined
  }
}

async function leerBcv(): Promise<Lectura> {
  const client = crearClienteBcv()
  try {
    const res = await fetch(URL_BCV, {
      headers: { 'User-Agent': 'Mozilla/5.0 (tienda-sync tasa)', Accept: 'text/html' },
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
      ...(client ? { client } : {}),
    } as RequestInit)
    if (!res.ok) throw new Error(`respondió ${res.status}`)
    return { ...parsearTasaBcv(await res.text()), origen: 'bcv' }
  } finally {
    client?.close()
  }
}

async function leerDolarApi(): Promise<Lectura> {
  const res = await fetch(URL_DOLARAPI, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS) })
  if (!res.ok) throw new Error(`respondió ${res.status}`)
  return { ...parsearTasaDolarApi(await res.json()), origen: 'dolarapi' }
}

function mensajeDe(e: unknown): string {
  if (e instanceof DOMException && e.name === 'TimeoutError') return `no respondió en ${TIEMPO_MAXIMO_MS / 1000} s`
  return e instanceof Error ? e.message : String(e)
}

// Comparación en tiempo constante para no filtrar el secreto por tiempos de respuesta.
function mismoSecreto(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let dif = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return dif === 0
}

Deno.serve(async (req) => {
  const secreto = Deno.env.get('CRON_SECRET') ?? ''
  if (!secreto) return Response.json({ ok: false, error: 'Falta configurar el secreto CRON_SECRET' }, { status: 500 })
  if (!mismoSecreto(req.headers.get('x-cron-secret') ?? '', secreto)) return new Response('No autorizado', { status: 401 })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const fallas: string[] = []
  let lectura: Lectura | null = null
  for (const [nombre, leer] of [['BCV', leerBcv], ['DolarAPI', leerDolarApi]] as const) {
    try {
      lectura = await leer()
      break
    } catch (e) {
      fallas.push(`${nombre}: ${mensajeDe(e)}`)
    }
  }

  if (!lectura) {
    // Queda visible en el panel del dueño como alerta; se conserva la última tasa válida.
    const mensaje = `No se pudo leer la tasa. ${fallas.join(' · ')}`
    await supabase.rpc('registrar_error_tasa', { p_error: mensaje })
    return Response.json({ ok: false, error: mensaje }, { status: 502 })
  }

  const { data: cfg, error } = await supabase.rpc('registrar_tasa', {
    p_tasa: lectura.tasa,
    p_fuente: 'auto',
    p_fecha_valor: lectura.fechaValor,
    p_origen: lectura.origen,
  })
  if (error) {
    const mensaje = `No se pudo guardar la tasa: ${error.message}`
    await supabase.rpc('registrar_error_tasa', { p_error: mensaje })
    return Response.json({ ok: false, error: mensaje }, { status: 500 })
  }

  return Response.json({
    ok: true,
    ...lectura,
    tasa_vigente: cfg?.tasa_bcv ?? null,
    modo: cfg?.tasa_modo ?? null,
    fallas, // si el BCV falló y se usó DolarAPI, aquí queda el motivo
  })
})
