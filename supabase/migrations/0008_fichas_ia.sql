-- =====================================================================
-- Tienda Sync · 0008 · Fichas de producto completadas con IA
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de 0007 (se puede repetir).
--
--   * Campos nuevos en productos para la ficha que propone la IA: el perfume
--     identificado (marca y nombre sugeridos), momento del día, temporadas,
--     pirámide de notas, familia olfativa y la confianza de la IA.
--   * La columna `nombre` NO cambia: el importador del sistema administrativo empareja por ella.
--   * origen_foto: nombre del producto en la web anterior (suele traer la
--     marca). Se usa como pista para la IA si está lleno.
--   * Día/Noche y Verano/Invierno dejan de ser "ocasiones": pasan a momento y
--     temporadas. Lo ya marcado se traslada antes de quitarlo de ocasion.
--   * catalogo_publico muestra la ficha nueva solo si está aprobada. Con la
--     ficha aprobada, el nombre y la marca visibles son los sugeridos.
--     Lo que llenó la IA (notas, género, ocasiones) tampoco se ve hasta aprobar.
-- =====================================================================

begin;

alter table public.productos
  add column if not exists marca_sugerida   text,
  add column if not exists nombre_sugerido  text,
  add column if not exists momento          text check (momento in ('dia', 'noche', 'ambos')),
  add column if not exists temporadas       text[] not null default '{}',
  add column if not exists notas_salida     text[] not null default '{}',
  add column if not exists notas_corazon    text[] not null default '{}',
  add column if not exists notas_fondo      text[] not null default '{}',
  add column if not exists familia_olfativa text,
  add column if not exists ia_confianza     text check (ia_confianza in ('alta', 'media', 'baja')),
  add column if not exists ia_generada_en   timestamptz,
  add column if not exists origen_foto      text;

-- Día/Noche → momento; Verano/Invierno → temporadas (solo donde aún no se definió).
update public.productos
   set momento = case when ocasion @> array['Día'] and ocasion @> array['Noche'] then 'ambos'
                      when ocasion @> array['Día'] then 'dia'
                      else 'noche' end
 where momento is null and ocasion && array['Día', 'Noche'];

update public.productos
   set temporadas = array(select distinct t from unnest(temporadas || array(
                     select lower(o) from unnest(ocasion) o where o in ('Verano', 'Invierno'))) t)
 where ocasion && array['Verano', 'Invierno'];

update public.productos
   set ocasion = array(select o from unnest(ocasion) o where o not in ('Día', 'Noche', 'Verano', 'Invierno'))
 where ocasion && array['Día', 'Noche', 'Verano', 'Invierno'];

-- Lote de la IA: busca rápido los que faltan y los que hay que revisar.
create index if not exists productos_descripcion_estado_idx on public.productos (descripcion_estado);

-- Misma vista que en 0007. create or replace solo permite cambiar el cálculo de columnas existentes
-- (sin cambiar su tipo) y agregar columnas al final.
create or replace view public.catalogo_publico with (security_barrier = true) as
select p.id, p.slug,
       case when p.descripcion_estado = 'aprobada' and nullif(trim(p.nombre_sugerido), '') is not null
            then p.nombre_sugerido else p.nombre end as nombre,
       case when p.descripcion_estado = 'aprobada' and nullif(trim(p.marca_sugerida), '') is not null
            then p.marca_sugerida else p.marca end as marca,
       p.presentacion_ml,
       p.precio_usd,
       public.precio_bs(p.precio_usd) as precio_bs,
       case when p.stock <= 0 then 'agotado'
            when p.stock <= c.umbral_ultimas then 'ultimas'
            else 'disponible' end as disponibilidad,
       case when ia.visible then p.genero end as genero,
       case when ia.visible then p.ocasion else '{}' end as ocasion,
       case when ia.visible then p.notas else '{}' end as notas,
       case when p.descripcion_estado = 'aprobada' then p.descripcion end as descripcion,
       p.fotos, p.actualizado_en,
       least(greatest(p.stock, 0), 50) as maximo,
       case when p.descripcion_estado = 'aprobada' then p.momento end as momento,
       case when p.descripcion_estado = 'aprobada' then p.temporadas else '{}' end as temporadas,
       case when p.descripcion_estado = 'aprobada' then p.notas_salida else '{}' end as notas_salida,
       case when p.descripcion_estado = 'aprobada' then p.notas_corazon else '{}' end as notas_corazon,
       case when p.descripcion_estado = 'aprobada' then p.notas_fondo else '{}' end as notas_fondo,
       case when p.descripcion_estado = 'aprobada' then p.familia_olfativa end as familia_olfativa
from public.productos p
cross join public.configuracion c
-- Lo que puso una persona se ve siempre; lo que llenó la IA, solo con la ficha aprobada.
cross join lateral (select p.ia_generada_en is null or p.descripcion_estado = 'aprobada' as visible) ia
where p.estado = 'publicado';

commit;

-- Que la API (PostgREST) vea las columnas nuevas.
notify pgrst, 'reload schema';
