import { exigirStaff } from '@/lib/admin'
import type { ErrorFila } from '@/lib/inventario/importador'
import { AvisoInstalar } from './AvisoInstalar'
import { Importador, type Inicial } from './Importador'
import { marca } from '@/marca.config'

// /admin/compartir (botón "Compartir" del celular) vuelve aquí con el resultado:
//   ?listo=<importación>  ·  ?al-dia=1  ·  ?pendiente=<reporte por revisar>  ·  ?error=<mensaje>
type Busqueda = { listo?: string; 'al-dia'?: string; pendiente?: string; error?: string }

export default async function PaginaImportar({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const sp = await searchParams
  const { supabase } = await exigirStaff()

  let inicial: Inicial | undefined
  if (sp.error) inicial = { tipo: 'error', error: sp.error }
  else if (sp['al-dia']) inicial = { tipo: 'al-dia' }
  else if (sp.listo) {
    const { data: imp } = await supabase.from('importaciones').select('actualizados, nuevos, ocultados, por_revisar, errores').eq('id', sp.listo).maybeSingle()
    if (imp) {
      inicial = {
        tipo: 'listo',
        conteos: { actualizados: imp.actualizados, nuevos: imp.nuevos, porRevisar: imp.por_revisar, ocultados: imp.ocultados, errores: (imp.errores ?? []) as ErrorFila[] },
      }
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-5xl">Actualizar inventario</h1>
        <p className="mt-2 max-w-2xl text-humo">
          Elige el reporte de inventario que descargaste de {marca.sistema}. Si todo está en orden se aplica solo; si algo necesita una mirada, te lo mostramos antes.
          Lo ideal: al abrir, a mediodía y al cerrar.
        </p>
      </div>
      {/* La clave reinicia la pantalla si llega otro resultado por "Compartir". */}
      <Importador key={JSON.stringify(sp)} inicial={inicial} pendiente={sp.pendiente} />
      <AvisoInstalar />
    </div>
  )
}
