import { EnlacePanel } from '@/components/admin/Carga'
import { exigirStaff } from '@/lib/admin'
import { formatoUsd } from '@/lib/precios'
import type { FilaInventario } from '@/lib/inventario/importador'
import { resolverRevision } from './acciones'

export default async function Revision() {
  const { supabase } = await exigirStaff()
  const { data } = await supabase
    .from('importacion_revision')
    .select('id, fila, similitud, candidato:productos(id, nombre, marca, codigo_sistema, stock, precio_usd)')
    .eq('estado', 'pendiente')
    .order('id')
    .limit(100)

  type Fila = { id: string; fila: FilaInventario; similitud: number | null; candidato: { id: string; nombre: string; marca: string | null; codigo_sistema: string | null; stock: number; precio_usd: number } | null }
  const pendientes = (data ?? []) as unknown as Fila[]

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-5xl">Por revisar</h1>
        <p className="mt-2 max-w-2xl text-humo">
          Filas del reporte de inventario que se parecen a un producto de la web, pero no lo suficiente para vincularlas solas.
          Al vincular, el producto guarda el código del sistema y la próxima vez se empareja automáticamente.
        </p>
      </div>

      {pendientes.length === 0 ? (
        <div className="tarjeta p-8 text-center">
          <p className="font-display text-3xl">No hay nada por revisar.</p>
          <EnlacePanel href="/admin/importar" className="boton-sec mt-4">Subir otro reporte</EnlacePanel>
        </div>
      ) : (
        <ul className="space-y-4">
          {pendientes.map((r) => (
            <li key={r.id} className="tarjeta grid gap-4 p-5 md:grid-cols-[1fr_1fr_auto]">
              <div>
                <p className="text-xs text-humo">En el reporte · fila {r.fila.fila}</p>
                <p className="font-display text-2xl">{r.fila.nombre}</p>
                <p className="text-sm text-humo">
                  Código {r.fila.codigo ?? 'sin código'} · stock {r.fila.stock}{r.fila.precio_usd !== null ? ` · ${formatoUsd(r.fila.precio_usd)}` : ''}
                </p>
              </div>
              <div>
                <p className="text-xs text-humo">En la web{r.similitud !== null ? ` · parecido ${Math.round(Number(r.similitud) * 100)} %` : ''}</p>
                {r.candidato ? (
                  <>
                    <p className="font-display text-2xl">{r.candidato.nombre}</p>
                    <p className="text-sm text-humo">
                      {r.candidato.marca ?? 'Sin marca'} · código {r.candidato.codigo_sistema ?? 'sin código'} · stock {r.candidato.stock}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-humo">Sin candidato claro: hay varios productos con ese nombre.</p>
                )}
              </div>
              <form action={resolverRevision} className="flex flex-wrap items-start gap-2 md:flex-col">
                <input type="hidden" name="id" value={r.id} />
                {r.candidato && <button name="decision" value="vinculado" className="boton">Es el mismo</button>}
                <button name="decision" value="nuevo" className="boton-sec">Es otro: crear nuevo</button>
                <button name="decision" value="descartado" className="text-sm text-humo underline-offset-4 hover:underline">Ignorar</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
