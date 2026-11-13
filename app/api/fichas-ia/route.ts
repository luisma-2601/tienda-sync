import { timingSafeEqual } from 'node:crypto'
import { after } from 'next/server'
import { avanzarLoteIA } from '@/lib/fichas-lote'

// La llama pg_cron cada minuto con el encabezado x-cron-secret (ver supabase/FICHAS_IA.md).
// Responde enseguida y avanza el lote después (after), para que pg_net no espere ni corte la corrida.
// Si el lote está apagado, en pausa o ya hay otra corrida, la corrida no hace nada.
export const maxDuration = 300

function mismoSecreto(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function POST(req: Request) {
  const secreto = process.env.CRON_SECRET ?? ''
  if (!secreto) return Response.json({ ok: false, error: 'Falta configurar CRON_SECRET' }, { status: 500 })
  if (!mismoSecreto(req.headers.get('x-cron-secret') ?? '', secreto)) return Response.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return Response.json({ ok: false, error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })

  after(async () => {
    const r = await avanzarLoteIA()
    if (r !== 'sin turno') console.info(`[fichas IA] Corrida: ${r}`)
  })
  return Response.json({ ok: true })
}
