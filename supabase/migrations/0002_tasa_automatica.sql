-- =====================================================================
-- Tienda Sync · 0002 · Tasa BCV automática con fecha valor
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de 0001 (se puede repetir).
--
--   * tasas_historial guarda la fecha valor y el origen de cada lectura
--     (bcv, dolarapi o manual).
--   * El BCV publica en la tarde la tasa del día hábil siguiente: se guarda
--     al leerla, pero se aplica cuando llega su fecha valor (hora de Caracas).
--   * Una lectura igual a la anterior no se repite en el historial, pero sí
--     marca la tasa como verificada (tasa_actualizada_en), para que la
--     alerta de "tasa vieja" no salte los fines de semana.
--   * Modo manual: la automática se guarda pero no se aplica. Al volver a
--     automático, la siguiente lectura se aplica aunque ya estuviera guardada.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Historial: fecha valor y origen
-- ---------------------------------------------------------------------
alter table public.tasas_historial
  add column if not exists fecha_valor date,
  add column if not exists origen      text;

-- Lecturas anteriores a esta migración: venían del BCV o eran manuales,
-- y regían desde el día en que se registraron.
update public.tasas_historial
   set origen      = coalesce(origen, case when fuente = 'manual' then 'manual' else 'bcv' end),
       fecha_valor = coalesce(fecha_valor, (creada_en at time zone 'America/Caracas')::date)
 where origen is null or fecha_valor is null;

alter table public.tasas_historial
  alter column fecha_valor set not null,
  alter column origen      set not null;

alter table public.tasas_historial drop constraint if exists tasas_historial_origen_check;
alter table public.tasas_historial add constraint tasas_historial_origen_check
  check (origen in ('bcv', 'dolarapi', 'manual') and (origen = 'manual') = (fuente = 'manual'));

-- ---------------------------------------------------------------------
-- registrar_tasa con fecha valor y origen (opcionales).
-- Las llamadas actuales (p_tasa, p_fuente) siguen funcionando.
-- ---------------------------------------------------------------------
drop function if exists public.registrar_tasa(numeric, public.fuente_tasa);
drop function if exists public.registrar_tasa(numeric, public.fuente_tasa, date, text);

create function public.registrar_tasa(
  p_tasa        numeric,
  p_fuente      public.fuente_tasa,
  p_fecha_valor date default null,
  p_origen      text default null
)
returns public.configuracion
language plpgsql security definer set search_path = public as $$
declare
  cfg       public.configuracion;
  v_hoy     date := (now() at time zone 'America/Caracas')::date;
  v_tasa    numeric(14, 4);
  v_origen  text;
  v_fecha   date;
  v_ultima  public.tasas_historial;
  v_aplicar boolean;
begin
  if p_fuente = 'manual' and not public.tiene_rol('dueno') then
    raise exception 'Solo el dueño puede fijar la tasa manualmente';
  end if;
  if p_fuente = 'auto' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'La tasa automática solo la registra el servidor';
  end if;
  if p_tasa is null or p_tasa <= 0 or p_tasa >= 1000000 then
    raise exception 'Tasa no válida';
  end if;

  v_tasa := round(p_tasa, 4);
  if p_fuente = 'manual' then
    -- La tasa manual rige desde ya.
    v_origen := 'manual';
    v_fecha  := v_hoy;
  else
    v_origen := coalesce(p_origen, 'bcv');
    v_fecha  := coalesce(p_fecha_valor, v_hoy);
    if v_origen not in ('bcv', 'dolarapi') then
      raise exception 'Origen de tasa automática no válido: %', v_origen;
    end if;
  end if;

  select * into cfg from public.configuracion where id = 1 for update;

  if p_fuente = 'manual' then
    insert into public.tasas_historial (tasa, fuente, aplicada, registrada_por, fecha_valor, origen)
    values (v_tasa, 'manual', true, auth.uid(), v_fecha, v_origen);

    update public.configuracion c
       set tasa_bcv            = v_tasa,
           tasa_modo           = 'manual',
           tasa_actualizada_en = now(),
           tasa_ultimo_error   = null,
           actualizado_en      = now()
     where c.id = 1
    returning * into cfg;
    return cfg;
  end if;

  -- Automática: se aplica solo en modo automático y cuando ya llegó su fecha valor
  -- (o si la tienda aún no tiene ninguna tasa). Nunca se retrocede a una fecha
  -- valor anterior a la última tasa automática aplicada.
  v_aplicar := cfg.tasa_modo = 'auto'
               and (v_fecha <= v_hoy or cfg.tasa_bcv = 0)
               and not exists (select 1 from public.tasas_historial h
                                where h.fuente = 'auto' and h.aplicada and h.fecha_valor > v_fecha);

  select * into v_ultima from public.tasas_historial order by id desc limit 1;

  if v_ultima.id is not null and v_ultima.fuente = 'auto'
     and v_ultima.tasa = v_tasa and v_ultima.fecha_valor = v_fecha then
    -- Misma lectura que la anterior: no se repite. Si ahora corresponde aplicarla
    -- (llegó su fecha valor o se volvió a modo automático), se marca como aplicada.
    if v_aplicar and not v_ultima.aplicada then
      update public.tasas_historial set aplicada = true where id = v_ultima.id;
    end if;
  else
    insert into public.tasas_historial (tasa, fuente, aplicada, registrada_por, fecha_valor, origen)
    values (v_tasa, 'auto', v_aplicar, auth.uid(), v_fecha, v_origen);
  end if;

  -- En modo manual la tasa del dueño no se toca, ni su fecha de actualización.
  update public.configuracion c
     set tasa_bcv            = case when v_aplicar then v_tasa else c.tasa_bcv end,
         tasa_actualizada_en = case when c.tasa_modo = 'auto' then now() else c.tasa_actualizada_en end,
         tasa_ultimo_error   = null,
         actualizado_en      = now()
   where c.id = 1
  returning * into cfg;
  return cfg;
end $$;

-- Mismos permisos que antes: el dueño (authenticated) fija la manual, service_role
-- registra la automática (la función lo verifica) y anon no puede ejecutarla.
-- Supabase da EXECUTE a anon por defecto en funciones nuevas: se quita explícitamente.
revoke execute on function public.registrar_tasa(numeric, public.fuente_tasa, date, text) from public, anon;
grant execute on function public.registrar_tasa(numeric, public.fuente_tasa, date, text) to authenticated, service_role;

commit;

-- Que la API (PostgREST) vea la nueva firma de inmediato.
notify pgrst, 'reload schema';
