-- =====================================================================
-- Tienda Sync · Esquema de base de datos (Supabase / Postgres)
-- Ejecutar en el SQL Editor de Supabase o como migración.
--
-- Principios:
--   * El precio en USD que viene del sistema administrativo es la única fuente de verdad.
--     El precio en Bs. SIEMPRE se calcula aquí (tasa BCV × recargo).
--   * Los permisos se aplican con RLS, no solo en la interfaz.
--   * El cliente nunca envía precios: crear_pedido() los calcula.
--
-- Marcados con "CONFIGURABLE" los valores que cada negocio ajusta (la mayoría desde el panel).
-- =====================================================================

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm  with schema extensions;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.rol_usuario        as enum ('dueno', 'empleado', 'cliente');
create type public.estado_producto    as enum ('borrador', 'publicado', 'oculto');
create type public.estado_descripcion as enum ('sin', 'borrador', 'aprobada');
create type public.estado_pedido      as enum ('pendiente', 'pagado', 'entregado', 'cancelado');
create type public.moneda_pago        as enum ('divisas', 'bolivares');
create type public.tipo_entrega       as enum ('retiro', 'delivery');
create type public.fuente_tasa        as enum ('auto', 'manual');
create type public.modo_tasa          as enum ('auto', 'manual');

-- ---------------------------------------------------------------------
-- Utilidades de normalización (usadas por el importador del sistema administrativo)
-- ---------------------------------------------------------------------

-- Texto: minúsculas, sin acentos, espacios simples.
create or replace function public.normalizar_texto(t text)
returns text language sql immutable parallel safe as $$
  select nullif(
    btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, ''))),
                         '\s+', ' ', 'g')),
    '')
$$;

-- Código: sin espacios, en mayúsculas. Conserva ceros a la izquierda.
-- Excel a veces convierte "123" en "123.0": se quita ese ".0" final.
create or replace function public.normalizar_codigo(t text)
returns text language sql immutable parallel safe as $$
  select nullif(
    regexp_replace(upper(regexp_replace(coalesce(t, ''), '\s+', '', 'g')), '\.0+$', ''),
    '')
$$;

create or replace function public.slugify(t text)
returns text language sql immutable parallel safe as $$
  select trim(both '-' from regexp_replace(coalesce(public.normalizar_texto(t), ''), '[^a-z0-9]+', '-', 'g'))
$$;

-- ---------------------------------------------------------------------
-- Perfiles y roles
-- ---------------------------------------------------------------------
create table public.perfiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nombre      text,
  email       text,
  telefono    text,
  rol         public.rol_usuario not null default 'cliente',
  creado_en   timestamptz not null default now()
);

-- Todo usuario nuevo nace como cliente. El dueño asciende a empleados.
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre, email)
  values (new.id, new.raw_user_meta_data ->> 'nombre', new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger trg_crear_perfil
after insert on auth.users
for each row execute function public.crear_perfil_nuevo_usuario();

-- ¿El usuario actual tiene alguno de estos roles?
create or replace function public.tiene_rol(variadic roles public.rol_usuario[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = any (roles))
$$;

create or replace function public.rol_actual()
returns public.rol_usuario language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid()
$$;

create or replace function public.es_staff()
returns boolean language sql stable as $$
  select public.tiene_rol('dueno', 'empleado')
$$;

-- ---------------------------------------------------------------------
-- Configuración (una sola fila)
-- ---------------------------------------------------------------------
create table public.configuracion (
  id                    smallint primary key default 1 check (id = 1),
  tasa_bcv              numeric(14, 4) not null default 0 check (tasa_bcv >= 0),
  tasa_modo             public.modo_tasa not null default 'auto',
  tasa_actualizada_en   timestamptz,
  tasa_ultimo_error     text,
  recargo_bs_pct        numeric(6, 2) not null default 0 check (recargo_bs_pct between 0 and 100),
  -- CONFIGURABLE: regla de redondeo en Bs. (0.01 = céntimos, 1 = Bs. enteros, 10 = decenas)
  redondeo_bs           numeric(10, 2) not null default 0.01 check (redondeo_bs > 0),
  umbral_ultimas        integer not null default 3 check (umbral_ultimas >= 0),
  whatsapp_numero       text,           -- formato internacional sin '+', ej. 584121234567
  mapeo_inventario            jsonb,          -- columnas del XLSX del sistema administrativo elegidas por el dueño
  actualizado_en        timestamptz not null default now()
);
insert into public.configuracion (id) values (1);

create table public.tasas_historial (
  id          bigint generated always as identity primary key,
  tasa        numeric(14, 4) not null check (tasa > 0),
  fuente      public.fuente_tasa not null,
  aplicada    boolean not null,            -- false si llegó en modo manual y no se aplicó
  registrada_por uuid references public.perfiles (id),
  creada_en   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Cálculo de precios (única implementación)
-- ---------------------------------------------------------------------
create or replace function public.precio_bs(p_usd numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select case when c.tasa_bcv > 0 and p_usd is not null then
           round(p_usd * c.tasa_bcv * (1 + c.recargo_bs_pct / 100) / c.redondeo_bs) * c.redondeo_bs
         end
  from public.configuracion c where c.id = 1
$$;

-- ---------------------------------------------------------------------
-- Métodos de pago y zonas de delivery
-- ---------------------------------------------------------------------
create table public.metodos_pago (
  id        text primary key,
  nombre    text not null,
  moneda    public.moneda_pago not null,
  activo    boolean not null default true,
  orden     smallint not null default 0
);
-- CONFIGURABLE: qué métodos cuentan como divisas (se cambia en el panel).
insert into public.metodos_pago (id, nombre, moneda, orden) values
  ('binance',       'Binance',        'divisas',   1),
  ('zinli',         'Zinli',          'divisas',   2),
  ('efectivo',      'Efectivo ($)',   'divisas',   3),
  ('pago_movil',    'Pago Móvil',     'bolivares', 4),
  ('transferencia', 'Transferencia',  'bolivares', 5);

-- CONFIGURABLE: zonas y costos reales.
create table public.zonas_delivery (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  costo_usd  numeric(10, 2) not null default 0 check (costo_usd >= 0),
  activa     boolean not null default true
);

-- ---------------------------------------------------------------------
-- Productos y decants
-- ---------------------------------------------------------------------
create table public.productos (
  id                  uuid primary key default gen_random_uuid(),
  codigo_sistema         text,
  codigo_norm         text generated always as (public.normalizar_codigo(codigo_sistema)) stored,
  nombre              text not null,
  nombre_norm         text generated always as (public.normalizar_texto(nombre)) stored,
  marca               text,
  presentacion_ml     numeric(8, 1),
  precio_usd          numeric(12, 2) not null default 0 check (precio_usd >= 0),
  stock               integer not null default 0,
  genero              text check (genero in ('hombre', 'mujer', 'unisex')),
  ocasion             text[] not null default '{}',
  notas               text[] not null default '{}',
  descripcion         text,
  descripcion_estado  public.estado_descripcion not null default 'sin',
  fotos               text[] not null default '{}',
  estado              public.estado_producto not null default 'borrador',
  slug                text unique,
  en_ultimo_reporte   boolean not null default true,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
create unique index productos_codigo_norm_uq on public.productos (codigo_norm) where codigo_norm is not null;
create index productos_nombre_trgm on public.productos using gin (nombre_norm extensions.gin_trgm_ops);
create index productos_estado_idx on public.productos (estado);

create or replace function public.productos_antes_de_guardar()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  -- El slug se fija una vez para no romper links ya compartidos en TikTok o WhatsApp.
  if new.slug is null then
    new.slug := public.slugify(concat_ws(' ', new.marca, new.nombre,
                  case when new.presentacion_ml is not null then new.presentacion_ml::int || 'ml' end))
                || '-' || left(new.id::text, 6);
  end if;
  return new;
end $$;

create trigger trg_productos_guardar
before insert or update on public.productos
for each row execute function public.productos_antes_de_guardar();

-- Los decants no existen en el sistema administrativo: se manejan solo aquí (solo el dueño).
create table public.decants (
  id           uuid primary key default gen_random_uuid(),
  producto_id  uuid not null references public.productos (id) on delete cascade,
  ml           numeric(6, 1) not null check (ml > 0),
  -- CONFIGURABLE: precio fijo por tamaño o proporcional al perfume.
  precio_usd   numeric(10, 2) not null check (precio_usd >= 0),
  disponible   boolean not null default true,
  unique (producto_id, ml)
);

-- ---------------------------------------------------------------------
-- Importaciones del reporte del sistema administrativo
-- ---------------------------------------------------------------------
create table public.importaciones (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid references public.perfiles (id),
  archivo       text,
  filas         integer not null default 0,
  actualizados  integer not null default 0,
  nuevos        integer not null default 0,
  ocultados     integer not null default 0,
  por_revisar   integer not null default 0,
  errores       jsonb not null default '[]',
  creada_en     timestamptz not null default now()
);

create table public.importacion_revision (
  id              uuid primary key default gen_random_uuid(),
  importacion_id  uuid not null references public.importaciones (id) on delete cascade,
  fila            jsonb not null,            -- la fila tal como vino del sistema administrativo
  candidato_id    uuid references public.productos (id) on delete set null,
  similitud       real,
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'vinculado', 'nuevo', 'descartado')),
  resuelta_por    uuid references public.perfiles (id),
  resuelta_en     timestamptz
);

-- El staff (incluidos empleados) guarda qué columna del XLSX es cada dato,
-- sin poder tocar el resto de la configuración.
create or replace function public.guardar_mapeo_inventario(p_mapeo jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_staff() then raise exception 'Sin permiso'; end if;
  update public.configuracion set mapeo_inventario = p_mapeo, actualizado_en = now() where id = 1;
end $$;

create or replace function public.leer_mapeo_inventario()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.es_staff() then mapeo_inventario end from public.configuracion where id = 1
$$;

-- Candidatos por nombre para una fila sin código coincidente.
create or replace function public.buscar_candidatos(p_nombre text, p_limite int default 3)
returns table (id uuid, nombre text, similitud real)
language sql stable set search_path = public, extensions as $$
  select p.id, p.nombre, similarity(p.nombre_norm, public.normalizar_texto(p_nombre)) as similitud
  from public.productos p
  where p.nombre_norm % public.normalizar_texto(p_nombre)
  order by similitud desc
  limit p_limite
$$;

-- ---------------------------------------------------------------------
-- Pedidos y ventas
-- ---------------------------------------------------------------------
create table public.pedidos (
  id                 uuid primary key default gen_random_uuid(),
  numero             bigint generated always as identity (start with 1001) unique,
  cliente_id         uuid references public.perfiles (id) on delete set null,
  cliente_nombre     text not null,
  cliente_telefono   text not null,
  entrega            public.tipo_entrega not null,
  zona_id            uuid references public.zonas_delivery (id),
  direccion          text,
  moneda             public.moneda_pago not null,
  metodo_pago        text not null references public.metodos_pago (id),
  tasa_usada         numeric(14, 4) not null,
  recargo_usado      numeric(6, 2) not null,
  costo_delivery_usd numeric(10, 2) not null default 0,
  total_usd          numeric(12, 2) not null,
  total_bs           numeric(16, 2),          -- solo si paga en bolívares
  estado             public.estado_pedido not null default 'pendiente',
  notas_internas     text,
  creado_en          timestamptz not null default now(),
  pagado_en          timestamptz,
  entregado_en       timestamptz,
  exportado_sistema_en  timestamptz
);
create index pedidos_estado_idx on public.pedidos (estado, creado_en desc);

create table public.pedido_items (
  id               uuid primary key default gen_random_uuid(),
  pedido_id        uuid not null references public.pedidos (id) on delete cascade,
  producto_id      uuid references public.productos (id) on delete set null,
  decant_id        uuid references public.decants (id) on delete set null,
  es_decant        boolean not null default false,
  codigo_sistema      text,              -- copia al momento de la venta
  descripcion      text not null,
  cantidad         integer not null check (cantidad > 0),
  precio_unit_usd  numeric(12, 2) not null,
  precio_unit_bs   numeric(16, 2)
);

create table public.favoritos (
  cliente_id   uuid references public.perfiles (id) on delete cascade,
  producto_id  uuid references public.productos (id) on delete cascade,
  creado_en    timestamptz not null default now(),
  primary key (cliente_id, producto_id)
);

-- Crear un pedido desde la tienda. Los precios se calculan aquí.
-- p_items: [{"producto_id": "...", "cantidad": 1} | {"decant_id": "...", "cantidad": 2}]
create or replace function public.crear_pedido(
  p_items     jsonb,
  p_moneda    public.moneda_pago,
  p_metodo    text,
  p_nombre    text,
  p_telefono  text,
  p_entrega   public.tipo_entrega,
  p_zona_id   uuid default null,
  p_direccion text default null
) returns table (pedido_id uuid, numero bigint, total_usd numeric, total_bs numeric, items jsonb)
language plpgsql security definer set search_path = public as $$
declare
  cfg        public.configuracion;
  v_metodo   public.metodos_pago;
  v_pedido   public.pedidos;
  v_item     jsonb;
  v_cant     integer;
  v_prod     public.productos;
  v_dec      public.decants;
  v_usd      numeric := 0;
  v_bs       numeric := 0;
  v_delivery numeric := 0;
begin
  select * into cfg from public.configuracion where id = 1;
  if p_moneda = 'bolivares' and cfg.tasa_bcv <= 0 then
    raise exception 'La tasa BCV no está configurada';
  end if;

  select * into v_metodo from public.metodos_pago where id = p_metodo and activo;
  if not found or v_metodo.moneda <> p_moneda then
    raise exception 'Método de pago no válido para la moneda elegida';
  end if;

  if coalesce(trim(p_nombre), '') = '' or coalesce(trim(p_telefono), '') = '' then
    raise exception 'Nombre y teléfono son obligatorios';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;

  if p_entrega = 'delivery' then
    select costo_usd into v_delivery from public.zonas_delivery where id = p_zona_id and activa;
    if not found then raise exception 'Zona de delivery no válida'; end if;
  end if;

  insert into public.pedidos (cliente_id, cliente_nombre, cliente_telefono, entrega, zona_id, direccion,
                              moneda, metodo_pago, tasa_usada, recargo_usado, costo_delivery_usd, total_usd)
  values (auth.uid(), trim(p_nombre), trim(p_telefono), p_entrega,
          case when p_entrega = 'delivery' then p_zona_id end,
          case when p_entrega = 'delivery' then p_direccion end,
          p_moneda, p_metodo, cfg.tasa_bcv, cfg.recargo_bs_pct, v_delivery, 0)
  returning * into v_pedido;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cant := (v_item ->> 'cantidad')::int;
    if v_cant is null or v_cant <= 0 or v_cant > 50 then
      raise exception 'Cantidad no válida';
    end if;

    if v_item ? 'decant_id' then
      select d.* into v_dec from public.decants d
        join public.productos p on p.id = d.producto_id
       where d.id = (v_item ->> 'decant_id')::uuid and d.disponible and p.estado = 'publicado';
      if not found then raise exception 'Un decant del carrito ya no está disponible'; end if;
      select * into v_prod from public.productos where id = v_dec.producto_id;

      insert into public.pedido_items (pedido_id, producto_id, decant_id, es_decant, codigo_sistema, descripcion,
                                       cantidad, precio_unit_usd, precio_unit_bs)
      values (v_pedido.id, v_prod.id, v_dec.id, true, null,
              concat_ws(' ', 'Decant', v_prod.marca, v_prod.nombre, v_dec.ml || 'ml'),
              v_cant, v_dec.precio_usd,
              case when p_moneda = 'bolivares' then public.precio_bs(v_dec.precio_usd) end);
      v_usd := v_usd + v_dec.precio_usd * v_cant;
      v_bs  := v_bs + coalesce(public.precio_bs(v_dec.precio_usd), 0) * v_cant;
    else
      select * into v_prod from public.productos
       where id = (v_item ->> 'producto_id')::uuid and estado = 'publicado';
      if not found then raise exception 'Un producto del carrito ya no está disponible'; end if;
      if v_prod.stock < v_cant then
        raise exception 'Stock insuficiente para %', v_prod.nombre;
      end if;

      insert into public.pedido_items (pedido_id, producto_id, es_decant, codigo_sistema, descripcion,
                                       cantidad, precio_unit_usd, precio_unit_bs)
      values (v_pedido.id, v_prod.id, false, v_prod.codigo_sistema,
              concat_ws(' ', v_prod.marca, v_prod.nombre,
                        case when v_prod.presentacion_ml is not null then v_prod.presentacion_ml::int || 'ml' end),
              v_cant, v_prod.precio_usd,
              case when p_moneda = 'bolivares' then public.precio_bs(v_prod.precio_usd) end);
      v_usd := v_usd + v_prod.precio_usd * v_cant;
      v_bs  := v_bs + coalesce(public.precio_bs(v_prod.precio_usd), 0) * v_cant;
    end if;
  end loop;

  v_usd := v_usd + v_delivery;
  v_bs  := v_bs + coalesce(public.precio_bs(v_delivery), 0);

  update public.pedidos p
     set total_usd = v_usd,
         total_bs  = case when p_moneda = 'bolivares' then v_bs end
   where p.id = v_pedido.id;

  return query select v_pedido.id, v_pedido.numero, v_usd,
                      case when p_moneda = 'bolivares' then v_bs end,
                      (select jsonb_agg(jsonb_build_object(
                                'descripcion', i.descripcion, 'cantidad', i.cantidad,
                                'precio_unit_usd', i.precio_unit_usd, 'precio_unit_bs', i.precio_unit_bs)
                              order by i.es_decant, i.descripcion)
                         from public.pedido_items i where i.pedido_id = v_pedido.id);
end $$;

-- Cambios de estado: descuenta stock al pagar y lo devuelve si se cancela una venta pagada.
-- Los decants no llevan stock. La siguiente importación del sistema administrativo vuelve a mandar.
create or replace function public.pedidos_cambio_estado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = old.estado then return new; end if;

  if old.estado = 'pendiente' and new.estado in ('pagado', 'entregado') then
    new.pagado_en := coalesce(new.pagado_en, now());
    update public.productos p set stock = greatest(p.stock - i.cantidad, 0)
      from public.pedido_items i
     where i.pedido_id = new.id and not i.es_decant and p.id = i.producto_id;
  elsif old.estado in ('pagado', 'entregado') and new.estado = 'cancelado' then
    update public.productos p set stock = p.stock + i.cantidad
      from public.pedido_items i
     where i.pedido_id = new.id and not i.es_decant and p.id = i.producto_id;
  elsif old.estado = 'entregado' and new.estado = 'pendiente' then
    raise exception 'Un pedido entregado no puede volver a pendiente';
  end if;

  if new.estado = 'entregado' then new.entregado_en := coalesce(new.entregado_en, now()); end if;
  return new;
end $$;

create trigger trg_pedidos_estado
before update of estado on public.pedidos
for each row execute function public.pedidos_cambio_estado();

-- ---------------------------------------------------------------------
-- Tasa BCV
-- ---------------------------------------------------------------------
-- Llamada por la tarea automática (service_role) o por el dueño (manual).
create or replace function public.registrar_tasa(p_tasa numeric, p_fuente public.fuente_tasa)
returns public.configuracion
language plpgsql security definer set search_path = public as $$
declare
  cfg public.configuracion;
  v_aplicar boolean;
begin
  if p_fuente = 'manual' and not public.tiene_rol('dueno') then
    raise exception 'Solo el dueño puede fijar la tasa manualmente';
  end if;
  if p_fuente = 'auto' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'La tasa automática solo la registra el servidor';
  end if;
  if p_tasa is null or p_tasa <= 0 then
    raise exception 'Tasa no válida';
  end if;

  select * into cfg from public.configuracion where id = 1 for update;
  -- Fijar a mano pasa a modo manual; en modo manual la automática se guarda pero no se aplica.
  v_aplicar := p_fuente = 'manual' or cfg.tasa_modo = 'auto';

  insert into public.tasas_historial (tasa, fuente, aplicada, registrada_por)
  values (p_tasa, p_fuente, v_aplicar, auth.uid());

  update public.configuracion c
     set tasa_bcv            = case when v_aplicar then p_tasa else c.tasa_bcv end,
         tasa_modo           = case when p_fuente = 'manual' then 'manual'::public.modo_tasa else c.tasa_modo end,
         tasa_actualizada_en = case when v_aplicar then now() else c.tasa_actualizada_en end,
         tasa_ultimo_error   = null,
         actualizado_en      = now()
   where c.id = 1
  returning * into cfg;
  return cfg;
end $$;

-- La tarea automática anota aquí cuando no pudo leer la tasa (para alertar al dueño).
create or replace function public.registrar_error_tasa(p_error text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor registra errores de tasa';
  end if;
  update public.configuracion set tasa_ultimo_error = left(p_error, 500), actualizado_en = now() where id = 1;
end $$;

-- ---------------------------------------------------------------------
-- Vistas públicas (lo único que ve un visitante)
-- Corren con permisos del dueño de la vista a propósito: así el visitante
-- ve "disponible / últimas / agotado" sin acceso al stock exacto.
-- ---------------------------------------------------------------------
create view public.catalogo_publico with (security_barrier = true) as
select p.id, p.slug, p.nombre, p.marca, p.presentacion_ml,
       p.precio_usd,
       public.precio_bs(p.precio_usd) as precio_bs,
       case when p.stock <= 0 then 'agotado'
            when p.stock <= c.umbral_ultimas then 'ultimas'
            else 'disponible' end as disponibilidad,
       p.genero, p.ocasion, p.notas,
       case when p.descripcion_estado = 'aprobada' then p.descripcion end as descripcion,
       p.fotos, p.actualizado_en
from public.productos p
cross join public.configuracion c
where p.estado = 'publicado';

create view public.decants_publicos with (security_barrier = true) as
select d.id, d.producto_id, d.ml, d.precio_usd, public.precio_bs(d.precio_usd) as precio_bs, d.disponible
from public.decants d
join public.productos p on p.id = d.producto_id and p.estado = 'publicado';

create view public.configuracion_publica with (security_barrier = true) as
select tasa_bcv, recargo_bs_pct, redondeo_bs, whatsapp_numero, tasa_actualizada_en
from public.configuracion where id = 1;

-- Ventas listas para importar en el sistema administrativo (sin decants).
-- El formato exacto de columnas se ajusta al recibir la plantilla del sistema administrativo.
create view public.ventas_para_sistema with (security_invoker = true) as
select pe.id as pedido_id, pe.numero, pe.pagado_en, i.codigo_sistema, i.descripcion, i.cantidad,
       i.precio_unit_usd, i.precio_unit_bs, pe.moneda, pe.metodo_pago, pe.tasa_usada,
       pe.cliente_nombre, pe.cliente_telefono, pe.exportado_sistema_en
from public.pedidos pe
join public.pedido_items i on i.pedido_id = pe.id
where pe.estado in ('pagado', 'entregado') and not i.es_decant;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.perfiles             enable row level security;
alter table public.configuracion        enable row level security;
alter table public.tasas_historial      enable row level security;
alter table public.metodos_pago         enable row level security;
alter table public.zonas_delivery       enable row level security;
alter table public.productos            enable row level security;
alter table public.decants              enable row level security;
alter table public.importaciones        enable row level security;
alter table public.importacion_revision enable row level security;
alter table public.pedidos              enable row level security;
alter table public.pedido_items         enable row level security;
alter table public.favoritos            enable row level security;

-- Perfiles: cada quien ve el suyo; el dueño ve y cambia todos (para asignar roles).
create policy perfiles_propio_select on public.perfiles for select using (id = auth.uid() or public.tiene_rol('dueno'));
create policy perfiles_propio_update on public.perfiles for update using (id = auth.uid())
  with check (id = auth.uid() and rol = public.rol_actual());  -- nadie se asciende a sí mismo
create policy perfiles_dueno_update on public.perfiles for update using (public.tiene_rol('dueno'));

-- Configuración: staff la lee; solo el dueño la cambia.
create policy config_staff_select on public.configuracion for select using (public.es_staff());
create policy config_dueno_update on public.configuracion for update using (public.tiene_rol('dueno'));

create policy tasas_staff_select on public.tasas_historial for select using (public.es_staff());

-- Métodos de pago y zonas: públicos para leer los activos; el dueño los gestiona.
create policy metodos_publico_select on public.metodos_pago for select using (activo or public.tiene_rol('dueno'));
create policy metodos_dueno_all on public.metodos_pago for all using (public.tiene_rol('dueno')) with check (public.tiene_rol('dueno'));
create policy zonas_publico_select on public.zonas_delivery for select using (activa or public.tiene_rol('dueno'));
create policy zonas_dueno_all on public.zonas_delivery for all using (public.tiene_rol('dueno')) with check (public.tiene_rol('dueno'));

-- Productos: staff lee, crea y edita; solo el dueño borra.
create policy productos_staff_select on public.productos for select using (public.es_staff());
create policy productos_staff_insert on public.productos for insert with check (public.es_staff());
create policy productos_staff_update on public.productos for update using (public.es_staff()) with check (public.es_staff());
create policy productos_dueno_delete on public.productos for delete using (public.tiene_rol('dueno'));

-- Decants: solo el dueño.
create policy decants_dueno_all on public.decants for all using (public.tiene_rol('dueno')) with check (public.tiene_rol('dueno'));
create policy decants_staff_select on public.decants for select using (public.es_staff());

-- Importaciones: staff.
create policy imp_staff_select on public.importaciones for select using (public.es_staff());
create policy imp_staff_insert on public.importaciones for insert with check (public.es_staff() and usuario_id = auth.uid());
create policy imp_propia_update on public.importaciones for update using (public.es_staff() and usuario_id = auth.uid());
create policy imprev_staff_all on public.importacion_revision for all using (public.es_staff()) with check (public.es_staff());

-- Pedidos: el dueño gestiona todo; un cliente registrado ve los suyos.
-- Nadie inserta directo: se crean solo con crear_pedido().
create policy pedidos_dueno_select on public.pedidos for select using (public.tiene_rol('dueno') or cliente_id = auth.uid());
create policy pedidos_dueno_update on public.pedidos for update using (public.tiene_rol('dueno')) with check (public.tiene_rol('dueno'));
create policy items_select on public.pedido_items for select using (
  exists (select 1 from public.pedidos p where p.id = pedido_id and (public.tiene_rol('dueno') or p.cliente_id = auth.uid())));

-- Favoritos: cada cliente los suyos.
create policy favoritos_propios on public.favoritos for all using (cliente_id = auth.uid()) with check (cliente_id = auth.uid());

-- ---------------------------------------------------------------------
-- Permisos de acceso
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant select on public.catalogo_publico, public.decants_publicos, public.configuracion_publica,
                public.metodos_pago, public.zonas_delivery to anon, authenticated;
grant select, insert, update, delete on public.productos, public.decants, public.importaciones,
                public.importacion_revision, public.metodos_pago, public.zonas_delivery,
                public.favoritos to authenticated;
grant select, update on public.perfiles, public.configuracion, public.pedidos to authenticated;
grant select on public.tasas_historial, public.pedido_items, public.ventas_para_sistema to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.crear_pedido(jsonb, public.moneda_pago, text, text, text, public.tipo_entrega, uuid, text)
  to anon, authenticated;
grant execute on function public.precio_bs(numeric), public.tiene_rol(public.rol_usuario[]), public.es_staff(),
  public.rol_actual(),
  public.normalizar_texto(text), public.normalizar_codigo(text), public.slugify(text)
  to anon, authenticated;
grant execute on function public.registrar_tasa(numeric, public.fuente_tasa), public.buscar_candidatos(text, int),
  public.guardar_mapeo_inventario(jsonb), public.leer_mapeo_inventario()
  to authenticated;
grant execute on function public.registrar_tasa(numeric, public.fuente_tasa), public.registrar_error_tasa(text)
  to service_role;

-- ---------------------------------------------------------------------
-- Fotos de productos (Supabase Storage): lectura pública, escritura solo staff.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('productos', 'productos', true) on conflict (id) do nothing;
    execute $p$ create policy fotos_staff_insert on storage.objects for insert to authenticated
                with check (bucket_id = 'productos' and public.es_staff()) $p$;
    execute $p$ create policy fotos_staff_delete on storage.objects for delete to authenticated
                using (bucket_id = 'productos' and public.es_staff()) $p$;
  end if;
end $$;
