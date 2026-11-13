-- =====================================================================
-- Tienda Sync · 0005 · Contador mensual de pedidos web (solo en la base de datos)
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de 0004 (se puede repetir).
--
-- Una fila por mes (hora de Caracas) con:
--   * pedidos:  pedidos web recibidos en el mes.
--   * clientes: clientes distintos en el mes (por teléfono, últimos 10 dígitos).
--
-- Se actualiza sola con cada pedido que se guarda. Los rechazados (límite por
-- hora, stock, datos inválidos) no cuentan. Es un contador propio: se conserva
-- aunque luego se borren pedidos. No se muestra en la tienda ni en el panel;
-- se consulta en Supabase (Table Editor → estadisticas_mensuales):
--
--   select * from public.estadisticas_mensuales order by mes desc;
-- =====================================================================

begin;

create table if not exists public.estadisticas_mensuales (
  mes            date primary key check (extract(day from mes) = 1),  -- primer día del mes
  pedidos        integer not null default 0 check (pedidos >= 0),
  clientes       integer not null default 0 check (clientes >= 0),
  actualizado_en timestamptz not null default now()
);

comment on table public.estadisticas_mensuales is
  'Pedidos web y clientes distintos por mes (hora de Caracas). Se llena sola con cada pedido; solo para consulta del dueño en Supabase.';

-- Solo se consulta desde el panel de Supabase: la API pública no la ve.
alter table public.estadisticas_mensuales enable row level security;
revoke all on public.estadisticas_mensuales from anon, authenticated;

create or replace function public.contar_pedido_mensual()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mes      date := date_trunc('month', new.creado_en at time zone 'America/Caracas')::date;
  v_desde    timestamptz := v_mes::timestamp at time zone 'America/Caracas';
  v_hasta    timestamptz := (v_mes + interval '1 month')::timestamp at time zone 'America/Caracas';
  v_telefono text := right(regexp_replace(new.cliente_telefono, '\D', '', 'g'), 10);
  v_nuevo    integer;
begin
  -- ¿Es la primera vez que este teléfono pide en el mes?
  v_nuevo := case when exists (
    select 1 from public.pedidos p
     where p.id <> new.id
       and p.creado_en >= v_desde and p.creado_en < v_hasta
       and right(regexp_replace(p.cliente_telefono, '\D', '', 'g'), 10) = v_telefono
  ) then 0 else 1 end;

  insert into public.estadisticas_mensuales as e (mes, pedidos, clientes)
  values (v_mes, 1, v_nuevo)
  on conflict (mes) do update
     set pedidos = e.pedidos + 1,
         clientes = e.clientes + v_nuevo,
         actualizado_en = now();
  return null;
end $$;

drop trigger if exists trg_pedidos_contador on public.pedidos;
create trigger trg_pedidos_contador
after insert on public.pedidos
for each row execute function public.contar_pedido_mensual();

revoke execute on function public.contar_pedido_mensual() from public, anon, authenticated;

-- Meses anteriores, a partir de los pedidos que ya existen. Si el mes ya tiene
-- fila (por ejemplo, al volver a ejecutar esta migración), no se toca.
insert into public.estadisticas_mensuales (mes, pedidos, clientes)
select date_trunc('month', creado_en at time zone 'America/Caracas')::date,
       count(*),
       count(distinct right(regexp_replace(cliente_telefono, '\D', '', 'g'), 10))
  from public.pedidos
 group by 1
on conflict (mes) do nothing;

commit;
