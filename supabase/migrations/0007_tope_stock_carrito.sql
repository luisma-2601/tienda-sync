-- =====================================================================
-- Tienda Sync · 0007 · No se puede pedir más de lo que hay en inventario
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de 0006 (se puede repetir).
--
--   * catalogo_publico expone `maximo`: cuántas unidades se pueden poner en
--     el carrito (el stock, con tope de 50 por producto). La tienda lo usa
--     para no dejar sumar más unidades de las que existen.
--   * Cada línea de un pedido se valida contra el stock SUMANDO todas las
--     líneas del mismo producto en ese pedido. crear_pedido revisaba cada
--     línea por separado: dos líneas de 3 unidades pasaban con stock 5.
--     Va en un trigger porque crear_pedido se puede llamar directamente con
--     la clave pública; el mensaje le llega tal cual al cliente.
-- =====================================================================

begin;

-- Misma vista que en 0001, con `maximo` agregado al final (create or replace solo permite agregar columnas al final).
create or replace view public.catalogo_publico with (security_barrier = true) as
select p.id, p.slug, p.nombre, p.marca, p.presentacion_ml,
       p.precio_usd,
       public.precio_bs(p.precio_usd) as precio_bs,
       case when p.stock <= 0 then 'agotado'
            when p.stock <= c.umbral_ultimas then 'ultimas'
            else 'disponible' end as disponibilidad,
       p.genero, p.ocasion, p.notas,
       case when p.descripcion_estado = 'aprobada' then p.descripcion end as descripcion,
       p.fotos, p.actualizado_en,
       least(greatest(p.stock, 0), 50) as maximo
from public.productos p
cross join public.configuracion c
where p.estado = 'publicado';

create or replace function public.validar_stock_pedido_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_stock  integer;
  v_nombre text;
  v_total  integer;
begin
  if new.es_decant then
    return new;  -- los decants no llevan stock
  end if;

  select stock, nombre into v_stock, v_nombre from public.productos where id = new.producto_id;

  select coalesce(sum(i.cantidad), 0) + new.cantidad into v_total
    from public.pedido_items i
   where i.pedido_id = new.pedido_id and i.producto_id = new.producto_id and not i.es_decant;

  if v_total > coalesce(v_stock, 0) then
    if coalesce(v_stock, 0) <= 0 then
      raise exception '% se agotó. Quítalo de tu carrito para continuar.', v_nombre;
    elsif v_stock = 1 then
      raise exception 'Solo queda 1 unidad de %. Ajusta la cantidad en tu carrito.', v_nombre;
    else
      raise exception 'Solo quedan % unidades de %. Ajusta la cantidad en tu carrito.', v_stock, v_nombre;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_pedido_items_stock on public.pedido_items;
create trigger trg_pedido_items_stock
before insert on public.pedido_items
for each row execute function public.validar_stock_pedido_item();

-- Solo la usa el trigger: nadie la llama directamente.
revoke execute on function public.validar_stock_pedido_item() from public, anon, authenticated;

commit;

-- Que la API (PostgREST) vea la columna nueva de la vista.
notify pgrst, 'reload schema';
