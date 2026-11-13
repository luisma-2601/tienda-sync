-- =====================================================================
-- Tienda Sync · 0003 · La web ya no lleva control de ventas
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de 0002 (se puede repetir).
--
-- El dueño registra todas sus ventas en el sistema administrativo, que es la única fuente de
-- verdad para ventas, stock y precios. La web solo guarda los pedidos que
-- llegan por WhatsApp (crear_pedido sigue igual) para consultarlos.
--
--   * El stock ya no cambia al actualizar un pedido: solo al importar el
--     reporte del sistema administrativo.
--   * Se elimina la vista de ventas para exportar al sistema administrativo.
--   * Las columnas de pedidos (estado, pagado_en, exportado_sistema_en, ...)
--     se conservan sin uso para no perder datos. entregado_en se reutiliza
--     como checklist opcional de entrega en el panel.
--   * Las políticas RLS no cambian: solo el dueño lee y actualiza pedidos.
-- =====================================================================

begin;

-- Descontaba stock al pagar y lo devolvía al cancelar.
drop trigger if exists trg_pedidos_estado on public.pedidos;
drop function if exists public.pedidos_cambio_estado();

-- Exportación de ventas para la importación en lote del sistema administrativo.
drop view if exists public.ventas_para_sistema;

-- "Pedidos web" lista y resume por mes de creación.
create index if not exists pedidos_creado_idx on public.pedidos (creado_en desc);

commit;

-- Que la API (PostgREST) deje de ofrecer la vista eliminada.
notify pgrst, 'reload schema';
