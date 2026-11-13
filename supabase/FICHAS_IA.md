# Fichas con IA en segundo plano

**Cómo funciona:** en Panel → Productos, el dueño toca **Completar fichas con IA** una vez y puede cerrar el panel. Cada minuto, `pg_cron` llama a la tienda (`/api/fichas-ia`). Cada corrida completa varios productos, uno por uno, con la pausa de `TIENDA_IA_PAUSA_MS` entre llamadas, y termina antes de los 5 minutos. Todo queda en borrador para revisar.

- **Falla pasajera de la IA** (500, 503, tiempo agotado, red): el mismo producto se reintenta hasta 3 veces (a los 5, 15 y 30 s). Si sigue fallando, queda con error y se sigue con el siguiente.
- **Cuota agotada (429):** el lote queda en pausa 15 minutos y se retoma solo.
- **5 errores seguidos de la IA:** el lote se apaga y el panel muestra "Gemini no está respondiendo, intenta más tarde".
- **Detener** apaga el lote. El producto que se está procesando termina.
- Los productos con error siguen **sin ficha**. El lote no los repite. El siguiente toque del botón empieza un lote nuevo y los reintenta.

Con el panel abierto, el lote avanza aunque la tarea programada no esté configurada todavía. Sin la tarea, se detiene al cerrar el panel.

Antes de empezar: la tienda tiene que estar publicada (por ejemplo, en Vercel), porque `pg_cron` la llama desde Internet. Ten a mano su URL pública (`https://tu-dominio`) y el secreto `cron_secret` del Vault, que se creó para la tasa automática ([TASA_AUTOMATICA.md](TASA_AUTOMATICA.md), paso 3). Si no lo creaste, sigue ese paso primero.

## 1. Ejecutar la migración 0009

**SQL Editor** → pega todo `supabase/migrations/0009_fichas_ia_segundo_plano.sql` → **Run**. Se puede repetir.

## 2. Variables de entorno de la tienda

En Vercel → Settings → Environment Variables (y en `.env.local` para desarrollo), agrega:

| Variable | Valor |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → `service_role` (o una *secret key*). **Nunca** con el prefijo `NEXT_PUBLIC_`. |
| `CRON_SECRET` | El mismo valor del secreto `cron_secret` del Vault: `select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret';` |

`GEMINI_API_KEY` y `TIENDA_IA_PAUSA_MS` siguen igual. Vuelve a desplegar para que la tienda las lea.

La ruta necesita hasta 5 minutos por corrida (`maxDuration = 300`). En Vercel, eso requiere Fluid Compute, que viene activado en los proyectos nuevos (Settings → Functions).

## 3. Probar una vez

Reemplaza `https://tu-dominio` y ejecuta en el SQL Editor:

```sql
select net.http_post(
  url     := 'https://tu-dominio/api/fichas-ia',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
  ),
  body    := '{}'::jsonb,
  timeout_milliseconds := 10000
);

-- Unos segundos después:
select status_code, content::text, error_msg from net._http_response order by created desc limit 3;
```

| Respuesta | Qué significa |
| --- | --- |
| `200` con `"ok":true` | Funciona. La ruta responde enseguida y la corrida sigue por detrás; si el lote está apagado, no hace nada. |
| `401 No autorizado` | `CRON_SECRET` de la tienda no coincide con el del Vault. |
| `500` "Falta configurar…" | Falta la variable que dice el mensaje, o no se volvió a desplegar. |
| `404` | La URL no es la de la tienda publicada. |

## 4. Programar la tarea cada minuto

```sql
select cron.schedule(
  'fichas-ia',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://tu-dominio/api/fichas-ia',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);
```

Con el lote apagado, cada llamada solo lee una fila y responde. Mientras hay una corrida en curso, las siguientes no hacen nada: un turno en la base evita que dos corridas trabajen a la vez.

Para revisar: `select status, return_message, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'fichas-ia') order by start_time desc limit 5;`

Los errores de cada producto se ven en el panel y en los registros de la tienda (Vercel → Logs, buscando `[fichas IA]`).

Para detener la tarea programada: `select cron.unschedule('fichas-ia');`
