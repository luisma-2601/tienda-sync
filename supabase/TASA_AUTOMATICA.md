# Activar la tasa BCV automática

Todo se hace desde el panel web de Supabase (supabase.com/dashboard → tu proyecto), sin CLI. Toma unos 15 minutos.

**Cómo funciona:** cada 2 horas, `pg_cron` llama a la función `actualizar-tasa`. La función lee la tasa y su "Fecha Valor" en www.bcv.org.ve. Si el BCV no responde (cae seguido y a veces rechaza conexiones de fuera de Venezuela), usa DolarAPI de respaldo. La tasa que el BCV publica en la tarde es la del día hábil siguiente: se guarda en el historial y se aplica cuando llega su fecha valor (hora de Caracas). Si el dueño fijó la tasa a mano, la automática se sigue guardando, pero no se aplica hasta que él vuelva al modo automático en Configuración.

Antes de empezar, ten a mano:

- La **URL del proyecto**: Project Settings → Data API (o General). Es `https://<ref>.supabase.co`.
- El archivo [`supabase/functions/actualizar-tasa/index.ts`](functions/actualizar-tasa/index.ts) y la migración [`supabase/migrations/0002_tasa_automatica.sql`](migrations/0002_tasa_automatica.sql) abiertos para copiarlos.

---

## 1. Ejecutar la migración 0002

1. **SQL Editor** → **New query**.
2. Pega todo el contenido de `supabase/migrations/0002_tasa_automatica.sql` y pulsa **Run**.
3. Comprueba el resultado:

   ```sql
   select id, tasa, fecha_valor, origen, aplicada from public.tasas_historial order by id desc limit 5;
   ```

   Debe mostrar las columnas `fecha_valor` y `origen` (las tasas anteriores quedan como `bcv` o `manual`).

La migración se puede volver a ejecutar sin problema. No toques `0001`: ya está aplicada.

## 2. Crear la función `actualizar-tasa`

1. **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Borra el código de ejemplo y pega todo el contenido de `supabase/functions/actualizar-tasa/index.ts`.
3. Abajo, en el nombre de la función, escribe exactamente `actualizar-tasa` y pulsa **Deploy function**.
4. Ya desplegada, abre la función → pestaña **Details** → en la configuración, **desactiva la verificación de JWT** (el interruptor se llama "Enforce JWT Verification" o "Verify JWT with legacy secret") y guarda.

   La protege el secreto del paso 3: sin el encabezado correcto responde `401 No autorizado`.

Si más adelante cambias `index.ts`, vuelve a abrir la función en **Edge Functions** → pestaña **Code**, pega el código nuevo y despliega. Revisa que la verificación de JWT siga desactivada.

## 3. Crear el secreto `CRON_SECRET`

1. Genera un valor aleatorio en el **SQL Editor**:

   ```sql
   select encode(extensions.gen_random_bytes(32), 'hex');
   ```

   Copia el resultado (64 caracteres).
2. **Edge Functions** → **Secrets** → agrega uno con nombre `CRON_SECRET` y el valor que copiaste → **Save**.
3. Guarda el mismo valor en el Vault de la base de datos, para que la tarea programada lo envíe sin dejarlo escrito en el código de la tarea:

   ```sql
   select vault.create_secret('<el-valor-que-copiaste>', 'cron_secret');
   ```

   Si más adelante cambias el secreto, cámbialo en los dos lugares (en el Vault, con `vault.update_secret`).

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya vienen configurados en toda función; no hay que crearlos.

## 4. Activar `pg_cron` y `pg_net`

**Database** → **Extensions** → busca `pg_cron` y actívala; luego busca `pg_net` y actívala (deja el esquema que propone).

O bien, en el SQL Editor:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
```

## 5. Probar una vez

En el SQL Editor, reemplaza `<ref>` por el de tu proyecto y ejecuta:

```sql
select net.http_post(
  url     := 'https://<ref>.supabase.co/functions/v1/actualizar-tasa',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
  ),
  body    := '{}'::jsonb,
  timeout_milliseconds := 60000
);
```

La llamada es asíncrona. Espera unos 30 segundos y revisa la respuesta:

```sql
select id, status_code, content::text, error_msg, timed_out, created
from net._http_response
order by created desc
limit 5;
```

| Respuesta | Qué significa |
| --- | --- |
| `200` con `"ok":true` | Funcionó. `origen` dice si vino del `bcv` o de `dolarapi`, `fechaValor` desde qué día rige y `tasa_vigente` la tasa que usa la tienda. En `fallas` queda el motivo si el BCV falló y se usó el respaldo. |
| `401 No autorizado` | El secreto del Vault no coincide con `CRON_SECRET` de la función. |
| `500` "Falta configurar el secreto CRON_SECRET" | Falta el paso 3.2. |
| `502` | Fallaron el BCV y DolarAPI. El error queda como alerta en el panel y se conserva la última tasa válida. |
| `404` | La URL o el nombre de la función no son exactamente `actualizar-tasa`. |
| `timed_out = true` | La función tardó más de 60 s. Vuelve a probar. |

Confirma también en la base de datos:

```sql
select tasa_bcv, tasa_modo, tasa_actualizada_en, tasa_ultimo_error from public.configuracion;
select tasa, fecha_valor, origen, aplicada, creada_en from public.tasas_historial order by id desc limit 5;
```

Si la consulta fue en la tarde, es normal ver la tasa de mañana con `aplicada = false`: se aplica sola en la primera consulta de su fecha valor.

## 6. Programar la tarea cada 2 horas

```sql
select cron.schedule(
  'tasa-bcv',
  '5 */2 * * *',
  $$
  select net.http_post(
    url     := 'https://<ref>.supabase.co/functions/v1/actualizar-tasa',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
```

`pg_cron` usa hora UTC: `5 */2 * * *` corre a los 5 minutos de cada hora par, también fines de semana. Una de esas corridas es a las 00:05 de Caracas, así que la tasa del día se aplica apenas empieza el día. Si ya existía una tarea `tasa-bcv` (por ejemplo, la versión anterior con la service role key), este comando la reemplaza.

Para revisar cómo van las corridas:

```sql
select jobname, schedule, active from cron.job;
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
```

Para detenerla: `select cron.unschedule('tasa-bcv');`

---

## En el panel de la tienda

- **Configuración → Tasa BCV:** la tasa vigente, la próxima tasa si hay una pendiente por fecha valor, y el historial con fecha valor y origen (BCV, DolarAPI respaldo o Manual).
- **Fijar tasa a mano** sigue igual: pasa a modo manual. **Volver a la tasa automática** aplica la siguiente lectura, aunque ya estuviera guardada.
- **Alerta "La tasa BCV no se actualizó"** en el Resumen: aparece si fallaron ambas fuentes o si pasaron más de 26 horas sin una lectura correcta. Una lectura igual a la anterior cuenta como correcta, así que en modo automático la alerta no salta los fines de semana. En modo manual las lecturas automáticas no actualizan esa hora (igual que antes), así que la alerta aparece 26 horas después de fijar la tasa a mano.
