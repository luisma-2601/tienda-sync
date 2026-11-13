-- =====================================================================
-- Tienda Sync · 0004 · Límite de pedidos por hora por persona
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de 0003 (se puede repetir).
--
-- Evita pedidos repetidos o de spam: como máximo 3 pedidos por hora con el
-- mismo teléfono (ventana móvil de 60 minutos). El teléfono se compara por
-- sus últimos 10 dígitos, así "0412 123 4567" y "+58 412-1234567" cuentan
-- como la misma persona.
--
-- Va en la base de datos (no solo en la página) porque crear_pedido se
-- puede llamar directamente con la clave pública. El mensaje de error le
-- llega tal cual al cliente en el carrito.
-- =====================================================================

begin;

create or replace function public.limitar_pedidos_por_hora()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c_limite   constant integer := 3;   -- pedidos por hora con el mismo teléfono
  v_telefono text := right(regexp_replace(coalesce(new.cliente_telefono, ''), '\D', '', 'g'), 10);
  v_recientes integer;
begin
  if v_telefono = '' then
    return new;  -- crear_pedido ya exige el teléfono
  end if;

  -- Dos pedidos simultáneos del mismo teléfono esperan su turno, para que no se cuelen ambos.
  perform pg_advisory_xact_lock(hashtext('pedidos-telefono:' || v_telefono));

  select count(*) into v_recientes
    from public.pedidos
   where creado_en > now() - interval '1 hour'
     and right(regexp_replace(cliente_telefono, '\D', '', 'g'), 10) = v_telefono;

  if v_recientes >= c_limite then
    raise exception 'Ya recibimos % pedidos con este teléfono en la última hora. Si necesitas cambiar algo, escríbenos por WhatsApp.', c_limite;
  end if;
  return new;
end $$;

drop trigger if exists trg_pedidos_limite on public.pedidos;
create trigger trg_pedidos_limite
before insert on public.pedidos
for each row execute function public.limitar_pedidos_por_hora();

-- Solo la usa el trigger: nadie la llama directamente.
revoke execute on function public.limitar_pedidos_por_hora() from public, anon, authenticated;

commit;
