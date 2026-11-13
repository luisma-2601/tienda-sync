-- =====================================================================
-- Tienda Sync · 0006 · Importación rápida del reporte del sistema administrativo
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de 0005 (se puede repetir).
--
--   * importaciones.archivo_sha256: huella del archivo importado. Si se sube
--     el mismo reporte que la última vez, no se vuelve a procesar.
--   * Bucket privado "reportes": cuando un reporte llega con "Compartir" desde
--     el celular y necesita revisión, se guarda aquí hasta que alguien lo
--     confirme en /admin/importar. Cada usuario solo ve su propia carpeta.
-- =====================================================================

begin;

alter table public.importaciones add column if not exists archivo_sha256 text;
create index if not exists importaciones_creada_idx on public.importaciones (creada_en desc);

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('reportes', 'reportes', false, 8 * 1024 * 1024)
    on conflict (id) do nothing;

    execute 'drop policy if exists reportes_staff_select on storage.objects';
    execute 'drop policy if exists reportes_staff_insert on storage.objects';
    execute 'drop policy if exists reportes_staff_delete on storage.objects';
    execute $p$ create policy reportes_staff_select on storage.objects for select to authenticated
                using (bucket_id = 'reportes' and public.es_staff() and (storage.foldername(name))[1] = auth.uid()::text) $p$;
    execute $p$ create policy reportes_staff_insert on storage.objects for insert to authenticated
                with check (bucket_id = 'reportes' and public.es_staff() and (storage.foldername(name))[1] = auth.uid()::text) $p$;
    execute $p$ create policy reportes_staff_delete on storage.objects for delete to authenticated
                using (bucket_id = 'reportes' and public.es_staff() and (storage.foldername(name))[1] = auth.uid()::text) $p$;
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
