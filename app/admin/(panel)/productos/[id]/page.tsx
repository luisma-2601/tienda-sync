import Link from 'next/link'
import { EnlacePanel } from '@/components/admin/Carga'
import { notFound } from 'next/navigation'
import { FormularioConservado } from '@/components/FormularioConservado'
import { BotonConfirmar } from '@/components/DialogoConfirmacion'
import { exigirStaff } from '@/lib/admin'
import { formatoUsd } from '@/lib/precios'
import { GENEROS, MOMENTOS, OCASIONES, TEMPORADAS, type Producto } from '@/lib/tipos'
import { agregarDecant, cambiarDecant, generarDescripcion, guardarProducto, principalFoto, quitarFoto, subirFoto } from './acciones'
import { marca } from '@/marca.config'

type SP = { ok?: string; error?: string; ia?: string; 'ia-dudosa'?: string; n?: string }

export default async function EditarProducto({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params
  const sp = await searchParams
  const { supabase, perfil } = await exigirStaff()
  const esDueno = perfil.rol === 'dueno'
  const { data } = await supabase.from('productos').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  const p = data as Producto
  const { data: decants } = await supabase.from('decants').select('id, ml, precio_usd, disponible').eq('producto_id', id).order('ml')

  return (
    <div className="max-w-5xl space-y-6">
      <EnlacePanel href="/admin/productos" className="text-sm text-humo hover:underline">Volver a productos</EnlacePanel>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-humo">{p.marca}</p>
          <h1 className="text-5xl">{p.nombre}</h1>
          {p.nombre_sugerido && (
            <p className="mt-1 text-sm text-humo">
              En la tienda (con la ficha aprobada): <span className="text-dorado">{[p.marca_sugerida, p.nombre_sugerido].filter(Boolean).join(' ')}</span>
            </p>
          )}
        </div>
        {p.estado === 'publicado' && <Link href={`/p/${p.slug}`} className="boton-sec" target="_blank">Ver en la tienda</Link>}
      </div>

      {sp.ok && <Aviso tono="ok">Cambios guardados.</Aviso>}
      {sp.ia && <Aviso tono="ok">Ficha generada con confianza alta. Revísala y toca “Aprobar ficha” para publicarla.</Aviso>}
      {sp['ia-dudosa'] && <Aviso tono="dorado">La IA no reconoce este perfume con seguridad: dejó las notas vacías y una descripción general. Revisa el nombre sugerido y completa la ficha a mano.</Aviso>}
      {sp.error && <Aviso tono="alerta">{sp.error}</Aviso>}

      <section className="tarjeta grid gap-4 p-6 sm:grid-cols-3">
        <div><p className="text-sm text-humo">Stock (del sistema)</p><p className="font-display text-3xl tabular-nums">{p.stock}</p></div>
        <div><p className="text-sm text-humo">Precio (del sistema)</p><p className="font-display text-3xl tabular-nums">{formatoUsd(Number(p.precio_usd))}</p></div>
        <p className="text-sm text-humo sm:self-center">Stock y precio se actualizan al subir el reporte de inventario. Para cambiarlos, cámbialos en {marca.sistema}.</p>
      </section>

      <section className="tarjeta space-y-4 p-6">
        <h2 className="text-3xl">Fotos</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {p.fotos.map((url, i) => (
            <div key={url} className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="aspect-square w-full rounded-xl bg-foto object-contain p-1" />
              <div className="flex gap-2 text-xs">
                {i > 0 && (
                  <form action={principalFoto}><input type="hidden" name="id" value={id} /><input type="hidden" name="url" value={url} /><button className="underline">Principal</button></form>
                )}
                <form action={quitarFoto}><input type="hidden" name="id" value={id} /><input type="hidden" name="url" value={url} /><BotonConfirmar className="text-alerta underline" titulo="¿Quitar esta foto?" mensaje="La foto dejará de mostrarse en la tienda." confirmar="Quitar foto">Quitar</BotonConfirmar></form>
              </div>
            </div>
          ))}
        </div>
        <form action={subirFoto} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="id" value={id} />
          <input type="file" name="foto" accept="image/jpeg,image/png,image/webp" className="text-sm" required />
          <button className="boton-sec">Subir foto</button>
        </form>
      </section>

      {/* `n` cambia solo tras guardar o generar con IA: la ficha se vuelve a montar con lo guardado. */}
      <FormularioConservado key={sp.n ?? 'ficha'} action={guardarProducto} className="tarjeta space-y-5 p-6">
        <input type="hidden" name="id" value={id} />
        <h2 className="text-3xl">Ficha</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo nombre="nombre" etiqueta="Nombre" valor={p.nombre} requerido />
          <Campo nombre="marca" etiqueta="Marca" valor={p.marca ?? ''} />
          <Campo nombre="presentacion_ml" etiqueta="Presentación (ml)" valor={p.presentacion_ml?.toString() ?? ''} />
          <Campo nombre="codigo_sistema" etiqueta="Código en el sistema" valor={p.codigo_sistema ?? ''} ayuda="Debe coincidir con el del reporte para que se actualice solo." />
          <label>
            <span className="etiqueta">Para</span>
            <select name="genero" defaultValue={p.genero ?? ''} className="campo">
              <option value="">Sin definir</option>
              {Object.entries(GENEROS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </label>
          <label>
            <span className="etiqueta">Estado en la tienda</span>
            <select name="estado" defaultValue={p.estado} className="campo">
              <option value="publicado">Publicado</option>
              <option value="borrador">Borrador (no se ve)</option>
              <option value="oculto">Oculto</option>
            </select>
          </label>
        </div>
        {/* Ficha completa: lo que la tienda muestra cuando está aprobada. */}
        <div className="space-y-4 rounded-xl border border-linea p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-2xl">Ficha para la tienda</h3>
            {p.ia_confianza && (
              <p className="text-xs text-humo">
                Generada con IA{p.ia_generada_en ? ` el ${new Date(p.ia_generada_en).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' })}` : ''} ·{' '}
                <span className={`rounded-full px-2 py-0.5 font-medium ${{ alta: 'bg-ok/10 text-ok', media: 'bg-dorado-claro text-dorado', baja: 'bg-alerta text-vidrio' }[p.ia_confianza]}`}>confianza {p.ia_confianza}</span>
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo nombre="marca_sugerida" etiqueta="Marca (como se muestra)" valor={p.marca_sugerida ?? ''} />
            <Campo nombre="nombre_sugerido" etiqueta="Nombre (como se muestra)" valor={p.nombre_sugerido ?? ''} ayuda="Con la ficha aprobada, la tienda muestra esto. El nombre del sistema administrativo no cambia." />
            <label>
              <span className="etiqueta">Momento</span>
              <select name="momento" defaultValue={p.momento ?? ''} className="campo">
                <option value="">Sin definir</option>
                {Object.entries(MOMENTOS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </label>
            <Campo nombre="familia_olfativa" etiqueta="Familia olfativa" valor={p.familia_olfativa ?? ''} />
          </div>
          <fieldset>
            <legend className="etiqueta">Temporadas</legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(TEMPORADAS).map(([v, t]) => (
                <label key={v} className="flex items-center gap-1.5 rounded-full border border-linea px-3 py-1 text-sm has-[:checked]:border-tinta has-[:checked]:bg-tinta has-[:checked]:text-vidrio">
                  <input type="checkbox" name="temporadas" value={v} defaultChecked={p.temporadas?.includes(v)} className="sr-only" />
                  {t}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo nombre="notas_salida" etiqueta="Notas de salida" valor={(p.notas_salida ?? []).join(', ')} />
            <Campo nombre="notas_corazon" etiqueta="Notas de corazón" valor={(p.notas_corazon ?? []).join(', ')} />
            <Campo nombre="notas_fondo" etiqueta="Notas de fondo" valor={(p.notas_fondo ?? []).join(', ')} />
          </div>
          <p className="text-xs text-humo">Separa las notas con comas. Si no conoces el perfume con certeza, déjalas vacías.</p>
        </div>
        <fieldset>
          <legend className="etiqueta">Ideal para</legend>
          <div className="flex flex-wrap gap-2">
            {OCASIONES.map((o) => (
              <label key={o} className="flex items-center gap-1.5 rounded-full border border-linea px-3 py-1 text-sm has-[:checked]:border-tinta has-[:checked]:bg-tinta has-[:checked]:text-vidrio">
                <input type="checkbox" name="ocasion" value={o} defaultChecked={p.ocasion.includes(o)} className="sr-only" />
                {o}
              </label>
            ))}
          </div>
        </fieldset>
        <Campo nombre="notas" etiqueta="Notas sueltas (solo si no hay pirámide)" valor={p.notas.join(', ')} ayuda="Si llenas la pirámide de arriba, estas se reemplazan por sus notas." />
        <label className="block">
          <span className="etiqueta">Descripción</span>
          <textarea name="descripcion" defaultValue={p.descripcion ?? ''} rows={4} className="campo text-base" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="aprobar" defaultChecked={p.descripcion_estado === 'aprobada'} />
          Descripción revisada y aprobada (solo así se muestra en la tienda)
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="boton">Guardar cambios</button>
          {p.descripcion_estado !== 'aprobada' && (
            <button name="accion" value="aprobar" className="boton-sec border-ok/40 text-ok">Aprobar ficha</button>
          )}
          {p.descripcion_estado === 'sin' ? (
            <button formAction={generarDescripcion} className="boton-sec">Completar con IA</button>
          ) : (
            <BotonConfirmar formAction={generarDescripcion} className="boton-sec" pendiente="Generando…" titulo="¿Regenerar la ficha con IA?"
              mensaje="La IA reemplazará la descripción, el nombre sugerido, las notas y el resto de la ficha, y quedará en borrador para revisarla. Lo que hayas cambiado a mano en esos campos se perderá."
              confirmar="Regenerar">
              Regenerar con IA
            </BotonConfirmar>
          )}
        </div>
      </FormularioConservado>

      {esDueno && (
        <section className="tarjeta space-y-4 p-6">
          <div>
            <h2 className="text-3xl">Decants</h2>
            <p className="text-sm text-humo">No existen en el sistema administrativo: se manejan solo aquí. No llevan stock, solo disponible o agotado.</p>
          </div>
          {(decants ?? []).length > 0 && (
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead><tr><th>Tamaño</th><th>Precio</th><th>Estado</th><th /></tr></thead>
                <tbody>
                  {decants!.map((d) => (
                    <tr key={d.id}>
                      <td>{Number(d.ml)} ml</td>
                      <td className="tabular-nums">{formatoUsd(Number(d.precio_usd))}</td>
                      <td>{d.disponible ? 'Disponible' : 'Agotado'}</td>
                      <td>
                        <form action={cambiarDecant} className="flex gap-3 text-sm">
                          <input type="hidden" name="id" value={id} /><input type="hidden" name="decant" value={d.id} />
                          <button name="accion" value={d.disponible ? 'agotar' : 'activar'} className="underline">{d.disponible ? 'Marcar agotado' : 'Marcar disponible'}</button>
                          <BotonConfirmar name="accion" value="borrar" className="text-alerta underline" titulo="¿Eliminar este decant?" mensaje={`El decant de ${Number(d.ml)} ml se eliminará y dejará de mostrarse en la tienda.`} confirmar="Eliminar">Eliminar</BotonConfirmar>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* Al agregar uno, cambia la cantidad de decants y el formulario vuelve a quedar vacío. */}
          <FormularioConservado key={`decant-${(decants ?? []).length}`} action={agregarDecant} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={id} />
            <label><span className="etiqueta">Tamaño (ml)</span><input name="ml" inputMode="decimal" className="campo w-28" required /></label>
            <label><span className="etiqueta">Precio (USD)</span><input name="precio_usd" inputMode="decimal" className="campo w-32" required /></label>
            <button className="boton-sec">Agregar decant</button>
          </FormularioConservado>
        </section>
      )}
    </div>
  )
}

function Campo({ nombre, etiqueta, valor, ayuda, requerido }: { nombre: string; etiqueta: string; valor: string; ayuda?: string; requerido?: boolean }) {
  return (
    <label className="block">
      <span className="etiqueta">{etiqueta}</span>
      <input name={nombre} defaultValue={valor} className="campo" required={requerido} />
      {ayuda && <span className="mt-1 block text-xs text-humo">{ayuda}</span>}
    </label>
  )
}

function Aviso({ tono, children }: { tono: 'ok' | 'dorado' | 'alerta'; children: React.ReactNode }) {
  const color = { ok: 'bg-ok/10 text-ok', dorado: 'bg-dorado-claro text-tinta', alerta: 'bg-alerta/10 text-alerta' }[tono]
  return <p role="status" className={`rounded-lg px-4 py-3 text-sm ${color}`}>{children}</p>
}
