-- =====================================================================
-- Tienda Sync · 0009 · Fichas con IA en segundo plano
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de 0008 (se puede repetir).
--
--   * El lote "Completar fichas con IA" ya no depende de que el panel quede
--     abierto: el dueño lo enciende y pg_cron llama cada minuto a la tienda
--     (/api/fichas-ia), que avanza unos productos por corrida.
--   * configuracion guarda el estado del lote: encendido, desde cuándo, la
--     pausa por cuota, el aviso para el dueño y un turno para que nunca haya
--     dos corridas a la vez.
--   * fichas_ia_registro: último resultado de cada producto (ok o error).
--     Un producto con error sigue en descripcion_estado = 'sin': dentro del
--     mismo lote no se repite y el siguiente lote lo reintenta.
-- =====================================================================

begin;

alter table public.configuracion
  add column if not exists ia_lote_activo           boolean not null default false,
  add column if not exists ia_lote_iniciado_en      timestamptz,
  add column if not exists ia_lote_pausa_hasta      timestamptz,
  add column if not exists ia_lote_aviso            text,
  add column if not exists ia_lote_errores_seguidos integer not null default 0,
  add column if not exists ia_lote_ocupado_hasta    timestamptz,
  add column if not exists ia_lote_latido_en        timestamptz;

create table if not exists public.fichas_ia_registro (
  producto_id uuid primary key references public.productos (id) on delete cascade,
  nombre      text not null,
  resultado   text not null check (resultado in ('ok', 'error')),
  confianza   text check (confianza in ('alta', 'media', 'baja')),
  detalle     text,
  en          timestamptz not null default now()
);
create index if not exists fichas_ia_registro_en_idx on public.fichas_ia_registro (en desc);

-- Lo lee el dueño en el panel; lo escribe solo el servidor (service role, que salta RLS).
alter table public.fichas_ia_registro enable row level security;
drop policy if exists fichas_ia_registro_dueno_select on public.fichas_ia_registro;
create policy fichas_ia_registro_dueno_select on public.fichas_ia_registro for select using (public.tiene_rol('dueno'));
revoke all on public.fichas_ia_registro from anon, authenticated;
grant select on public.fichas_ia_registro to authenticated;

-- Turno de trabajo: true si esta corrida puede avanzar el lote (encendido, sin pausa y sin otra corrida en curso).
-- El turno vence solo a los p_segundos, por si una corrida se corta sin devolverlo.
create or replace function public.tomar_turno_fichas_ia(p_segundos integer)
returns boolean language sql security definer set search_path = public as $$
  with turno as (
    update public.configuracion
       set ia_lote_ocupado_hasta = now() + make_interval(secs => p_segundos),
           ia_lote_latido_en     = now()
     where id = 1
       and ia_lote_activo
       and (ia_lote_ocupado_hasta is null or ia_lote_ocupado_hasta < now())
       and (ia_lote_pausa_hasta is null or ia_lote_pausa_hasta <= now())
    returning 1
  )
  select exists (select 1 from turno)
$$;
revoke execute on function public.tomar_turno_fichas_ia(integer) from public, anon, authenticated;
grant execute on function public.tomar_turno_fichas_ia(integer) to service_role;

commit;

-- Que la API (PostgREST) vea las columnas y la función nuevas.
notify pgrst, 'reload schema';
