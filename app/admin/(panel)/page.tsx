import { EnlacePanel } from '@/components/admin/Carga'
import { exigirStaff } from '@/lib/admin'
import { formatoBs } from '@/lib/precios'
import { mesActual, rangoMes } from '@/lib/pedidos-web'

const fecha = new Intl.DateTimeFormat('es-VE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Caracas' })

export default async function Resumen({ searchParams }: { searchParams: Promise<{ 'sin-permiso'?: string }> }) {
  const sp = await searchParams
  const { supabase, perfil } = await exigirStaff()
  const esDueno = perfil.rol === 'dueno'
  const mes = rangoMes(mesActual())

  const [{ data: cfg }, publicados, borradores, porRevisar, { data: importaciones }, pedidosMes] = await Promise.all([
    supabase.from('configuracion').select('tasa_bcv, tasa_modo, tasa_actualizada_en, tasa_ultimo_error, recargo_bs_pct').single(),
    supabase.from('productos').select('id', { count: 'exact', head: true }).eq('estado', 'publicado'),
    supabase.from('productos').select('id', { count: 'exact', head: true }).eq('estado', 'borrador'),
    supabase.from('importacion_revision').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    supabase.from('importaciones').select('creada_en, filas, actualizados, nuevos, ocultados, por_revisar').order('creada_en', { ascending: false }).limit(5),
    esDueno
      ? supabase.from('pedidos').select('id', { count: 'exact', head: true }).gte('creado_en', mes.desde).lt('creado_en', mes.hasta)
      : Promise.resolve({ count: null }),
  ])

  const horasDesdeTasa = cfg?.tasa_actualizada_en ? (Date.now() - new Date(cfg.tasa_actualizada_en).getTime()) / 36e5 : Infinity
  const tasaVieja = horasDesdeTasa > 26
  const ultimaImp = importaciones?.[0]
  const horasDesdeImp = ultimaImp ? (Date.now() - new Date(ultimaImp.creada_en).getTime()) / 36e5 : Infinity

  return (
    <div className="max-w-5xl space-y-8">
      <h1 className="text-5xl">Resumen</h1>

      {/* La acción más frecuente del día: subir el reporte del sistema administrativo (al abrir, a mediodía y al cerrar). */}
      <EnlacePanel
        href="/admin/importar"
        className="group flex items-center gap-4 rounded-2xl bg-tinta p-5 text-vidrio shadow-[0_18px_36px_-20px_rgb(0_0_0/0.5)] transition-[scale,opacity] duration-300 ease-elegante hover:opacity-95 active:scale-[0.98] sm:p-6"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-vidrio/10 text-dorado-claro">
          <svg className="h-7 w-7 transition-transform duration-500 ease-elegante group-hover:-translate-y-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
          </svg>
        </span>
        <span>
          <span className="block font-display text-3xl">Actualizar inventario</span>
          <span className="block text-sm opacity-75">
            {ultimaImp ? `Último reporte de inventario: ${fecha.format(new Date(ultimaImp.creada_en))}` : 'Todavía no se ha subido ningún reporte de inventario'}
            {ultimaImp && horasDesdeImp > 8 ? ' · conviene subir uno nuevo' : ''}
          </span>
        </span>
      </EnlacePanel>
      {sp['sin-permiso'] && <p className="rounded-lg bg-alerta/10 px-4 py-3 text-sm text-alerta">Esa sección es solo para el dueño.</p>}

      {(cfg?.tasa_ultimo_error || tasaVieja) && (
        <div role="alert" className="rounded-xl border border-alerta/30 bg-alerta/10 p-4 text-sm">
          <p className="font-semibold text-alerta">La tasa BCV no se actualizó.</p>
          <p className="mt-1">
            {cfg?.tasa_ultimo_error ? `Último error: ${cfg.tasa_ultimo_error}. ` : ''}
            Los precios en bolívares usan la última tasa guardada.{' '}
            {esDueno ? <EnlacePanel className="underline" href="/admin/configuracion">Fijar la tasa a mano</EnlacePanel> : 'Avísale al dueño.'}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Dato titulo="Tasa BCV" valor={cfg?.tasa_bcv ? formatoBs(Number(cfg.tasa_bcv)) : '—'}
          nota={`${cfg?.tasa_modo === 'manual' ? 'Fijada a mano' : 'Automática'}${cfg?.tasa_actualizada_en ? ` · ${fecha.format(new Date(cfg.tasa_actualizada_en))}` : ''}`} />
        <Dato titulo="Recargo en bolívares" valor={`${Number(cfg?.recargo_bs_pct ?? 0)} %`} nota="Se aplica a toda la tienda" />
        <Dato titulo="Productos publicados" valor={String(publicados.count ?? 0)} nota={`${borradores.count ?? 0} en borrador`} href="/admin/productos" />
        {esDueno ? (
          <Dato titulo="Pedidos web este mes" valor={String(pedidosMes.count ?? 0)} nota="Enviados por WhatsApp desde la tienda" href="/admin/pedidos" />
        ) : (
          <Dato titulo="Por revisar" valor={String(porRevisar.count ?? 0)} nota="Filas dudosas del reporte" href="/admin/importar/revision" />
        )}
      </div>

      <section className="tarjeta p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-3xl">Sincronización del inventario</h2>
            <p className="text-sm text-humo">
              {ultimaImp ? `Último reporte: ${fecha.format(new Date(ultimaImp.creada_en))}` : 'Todavía no se ha subido ningún reporte.'}
              {ultimaImp && horasDesdeImp > 8 ? ' · Conviene subir uno nuevo.' : ''}
            </p>
          </div>
          <div className="flex gap-2">
            {(porRevisar.count ?? 0) > 0 && <EnlacePanel href="/admin/importar/revision" className="boton-sec">Revisar {porRevisar.count}</EnlacePanel>}
            <EnlacePanel href="/admin/importar" className="boton-sec">Subir reporte</EnlacePanel>
          </div>
        </div>
        {importaciones && importaciones.length > 0 && (
          <>
            {/* Teléfono: seis columnas no caben en el cuadro; cada reporte va en su fila con las cifras debajo. */}
            <ul className="mt-5 divide-y divide-linea border-t border-linea text-sm sm:hidden">
              {importaciones.map((i) => (
                <li key={i.creada_en} className="py-3">
                  <p className="font-medium">{fecha.format(new Date(i.creada_en))}</p>
                  <dl className="mt-1.5 grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
                    {([['Filas', i.filas], ['Actualizados', i.actualizados], ['Nuevos', i.nuevos], ['Ocultados', i.ocultados], ['Por revisar', i.por_revisar]] as const).map(([t, v]) => (
                      <div key={t}>
                        <dt className="text-humo">{t}</dt>
                        <dd className={`tabular-nums ${t === 'Por revisar' && Number(v) > 0 ? 'font-semibold text-dorado' : ''}`}>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
            {/* Desde tablet, la tabla; si aun así no cabe, se desplaza dentro del cuadro en vez de salirse. */}
            <div className="mt-5 hidden overflow-x-auto sm:block">
              <table className="tabla">
                <thead><tr><th>Fecha</th><th>Filas</th><th>Actualizados</th><th>Nuevos</th><th>Ocultados</th><th>Por revisar</th></tr></thead>
                <tbody>
                  {importaciones.map((i) => (
                    <tr key={i.creada_en}>
                      <td className="whitespace-nowrap">{fecha.format(new Date(i.creada_en))}</td>
                      <td className="tabular-nums">{i.filas}</td><td className="tabular-nums">{i.actualizados}</td>
                      <td className="tabular-nums">{i.nuevos}</td><td className="tabular-nums">{i.ocultados}</td><td className="tabular-nums">{i.por_revisar}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function Dato({ titulo, valor, nota, href }: { titulo: string; valor: string; nota: string; href?: string }) {
  const cuerpo = (
    <div className="tarjeta h-full p-5">
      <p className="text-sm text-humo">{titulo}</p>
      <p className="mt-1 font-display text-3xl tabular-nums">{valor}</p>
      <p className="mt-1 text-xs text-humo">{nota}</p>
    </div>
  )
  return href ? <EnlacePanel href={href} className="block rounded-2xl hover:opacity-90">{cuerpo}</EnlacePanel> : cuerpo
}
