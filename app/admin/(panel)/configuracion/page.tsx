import { exigirDueno } from '@/lib/admin'
import { calcularPrecioBs, formatoBs } from '@/lib/precios'
import { Aviso } from '@/components/admin/Aviso'
import { BotonEnviar } from '@/components/admin/BotonEnviar'
import { BotonConfirmar } from '@/components/DialogoConfirmacion'
import { FormularioConservado } from '@/components/FormularioConservado'
import { cambiarRol, fijarTasa, guardarMetodo, guardarPrecios, guardarZona, volverTasaAutomatica } from './acciones'

const fecha = new Intl.DateTimeFormat('es-VE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Caracas' })
// La fecha valor es un día (AAAA-MM-DD) sin hora: se muestra tal cual, sin convertir zona horaria.
const dia = new Intl.DateTimeFormat('es-VE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const formatoDia = (d: string) => dia.format(new Date(`${d}T00:00:00Z`))
const ORIGENES: Record<string, string> = { bcv: 'BCV', dolarapi: 'DolarAPI (respaldo)', manual: 'Manual' }
const REDONDEOS = [
  { v: 0.01, t: 'Sin redondear (céntimos)' },
  { v: 1, t: 'Bs. enteros' },
  { v: 10, t: 'Decenas de Bs.' },
  { v: 100, t: 'Centenas de Bs.' },
]

export default async function Configuracion({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; s?: string; n?: string }> }) {
  const sp = await searchParams
  // Tras guardar, la sección guardada muestra el aviso y destella (la clave repite la animación en cada envío).
  const aviso = (seccion: string) => (sp.s === seccion ? <Aviso key={sp.n} ok={sp.ok} error={sp.error} /> : null)
  // Solo tras guardar bien cambia la clave (la sección se vuelve a montar con los datos nuevos).
  // Si hubo error, no: así no se borra lo que se había escrito.
  const clave = (id: string) => (sp.s === id && !sp.error ? `${id}-${sp.n}` : id)
  const seccion = (id: string, clase: string) => ({
    id,
    className: `${clase} scroll-mt-6 ${sp.s === id && !sp.error ? 'destello' : ''}`,
  })
  const { supabase, perfil } = await exigirDueno()
  const [{ data: cfg }, { data: metodos }, { data: zonas }, { data: usuarios }, { data: tasas }] = await Promise.all([
    supabase.from('configuracion').select('*').single(),
    supabase.from('metodos_pago').select('*').order('orden'),
    supabase.from('zonas_delivery').select('*').order('nombre'),
    supabase.from('perfiles').select('id, nombre, email, rol').neq('rol', 'cliente').order('rol'),
    supabase.from('tasas_historial').select('id, tasa, origen, fecha_valor, aplicada, creada_en').order('id', { ascending: false }).limit(8),
  ])
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date())
  const pendiente = cfg?.tasa_modo === 'auto' ? tasas?.find((t) => !t.aplicada && t.fecha_valor > hoy) : undefined
  const ejemplo = cfg ? calcularPrecioBs(100, { tasa_bcv: Number(cfg.tasa_bcv), recargo_bs_pct: Number(cfg.recargo_bs_pct), redondeo_bs: Number(cfg.redondeo_bs) }) : null

  return (
    <div className="max-w-4xl space-y-8">
      <h1 className="text-5xl">Configuración</h1>
      {!sp.s && <Aviso ok={sp.ok} error={sp.error} />}

      <section key={clave('tasa')} {...seccion('tasa', 'tarjeta space-y-5 p-6')}>
        <div>
          <h2 className="text-3xl">Tasa BCV</h2>
          <p className="text-sm text-humo">
            {cfg?.tasa_modo === 'manual'
              ? 'Fijada a mano: la consulta automática al BCV sigue guardando la tasa, pero no la aplica.'
              : 'Automática: se consulta al BCV cada 2 horas (si no responde, a DolarAPI).'}
          </p>
          <p className="text-sm text-humo">El BCV publica en la tarde la tasa del día hábil siguiente: se guarda al leerla y se aplica al llegar su fecha valor.</p>
        </div>
        {aviso('tasa')}
        <p className="font-display text-4xl tabular-nums">
          <span key={String(cfg?.tasa_bcv)} className="inline-block animate-cambio">{cfg?.tasa_bcv ? formatoBs(Number(cfg.tasa_bcv)) : 'Sin tasa'}</span>
          <span className="ml-3 font-sans text-sm text-humo">{cfg?.tasa_actualizada_en ? fecha.format(new Date(cfg.tasa_actualizada_en)) : ''}</span>
        </p>
        {pendiente && (
          <p className="text-sm">Próxima tasa: <span className="tabular-nums">{formatoBs(Number(pendiente.tasa))}</span>, se aplica desde el {formatoDia(pendiente.fecha_valor)}.</p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <FormularioConservado action={fijarTasa} className="flex items-end gap-2">
            <label><span className="etiqueta">Fijar tasa a mano</span><input name="tasa" inputMode="decimal" placeholder="Ej. 40,50" className="campo w-40" required /></label>
            <BotonEnviar className="boton-sec" pendiente="Fijando…">Fijar</BotonEnviar>
          </FormularioConservado>
          {cfg?.tasa_modo === 'manual' && (
            <form action={volverTasaAutomatica} className="animate-entrada"><BotonEnviar pendiente="Reactivando…">Volver a la tasa automática</BotonEnviar></form>
          )}
        </div>
        {tasas && tasas.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm">Últimas tasas registradas</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="tabla">
                <thead><tr><th>Leída</th><th>Tasa</th><th>Fecha valor</th><th>Origen</th><th>Aplicada</th></tr></thead>
                <tbody>
                  {tasas.map((t) => (
                    <tr key={t.id}><td>{fecha.format(new Date(t.creada_en))}</td><td className="tabular-nums">{formatoBs(Number(t.tasa))}</td>
                      <td>{formatoDia(t.fecha_valor)}</td><td>{ORIGENES[t.origen] ?? t.origen}</td>
                      <td>{t.aplicada ? 'Sí' : t.fecha_valor > hoy ? 'Pendiente' : 'No'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>

      <FormularioConservado action={guardarPrecios} key={clave('precios')} {...seccion('precios', 'tarjeta space-y-5 p-6')}>
        <h2 className="text-3xl">Precios y tienda</h2>
        {aviso('precios')}
        <div className="grid gap-4 sm:grid-cols-2">
          <label><span className="etiqueta">Recargo por pagar en bolívares (%)</span>
            <input name="recargo_bs_pct" defaultValue={Number(cfg?.recargo_bs_pct ?? 0)} inputMode="decimal" className="campo" /></label>
          <label><span className="etiqueta">Redondeo del precio en bolívares</span>
            <select name="redondeo_bs" defaultValue={Number(cfg?.redondeo_bs ?? 0.01)} className="campo">
              {REDONDEOS.map((r) => <option key={r.v} value={r.v}>{r.t}</option>)}
            </select></label>
          <label><span className="etiqueta">Mostrar «últimas unidades» con stock de hasta</span>
            <input name="umbral_ultimas" defaultValue={cfg?.umbral_ultimas ?? 3} inputMode="numeric" className="campo" /></label>
          <label><span className="etiqueta">WhatsApp que recibe los pedidos</span>
            <input name="whatsapp_numero" defaultValue={cfg?.whatsapp_numero ?? ''} placeholder="584121234567" className="campo" /></label>
        </div>
        {ejemplo !== null && <p className="text-sm text-humo">Con esta configuración, un perfume de $100 cuesta {formatoBs(ejemplo)} pagando en bolívares.</p>}
        <BotonEnviar>Guardar</BotonEnviar>
      </FormularioConservado>

      <section key={clave('metodos')} {...seccion('metodos', 'tarjeta space-y-4 p-6')}>
        <div>
          <h2 className="text-3xl">Métodos de pago</h2>
          <p className="text-sm text-humo">Los de «divisas» usan el precio en dólares; los de «bolívares», el precio con tasa y recargo.</p>
        </div>
        {aviso('metodos')}
        {(metodos ?? []).map((m) => (
          <FormularioConservado key={m.id} action={guardarMetodo} className="flex flex-wrap items-center gap-3 border-b border-linea pb-3">
            <input type="hidden" name="id" value={m.id} />
            <span className="w-36 font-medium">{m.nombre}</span>
            <select name="moneda" defaultValue={m.moneda} className="campo w-40"><option value="divisas">Divisas</option><option value="bolivares">Bolívares</option></select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="activo" defaultChecked={m.activo} /> Activo</label>
            <BotonEnviar className="text-sm underline" pendiente="Guardando…">Guardar</BotonEnviar>
          </FormularioConservado>
        ))}
      </section>

      <section key={clave('zonas')} {...seccion('zonas', 'tarjeta space-y-4 p-6')}>
        <h2 className="text-3xl">Zonas de delivery</h2>
        {aviso('zonas')}
        {[...(zonas ?? []), { id: '', nombre: '', costo_usd: '', activa: true }].map((z) => (
          <FormularioConservado key={z.id || 'nueva'} action={guardarZona} className="flex flex-wrap items-end gap-3 border-b border-linea pb-3">
            <input type="hidden" name="id" value={z.id} />
            <label><span className="etiqueta">{z.id ? 'Zona' : 'Nueva zona'}</span><input name="nombre" defaultValue={z.nombre} className="campo w-56" /></label>
            <label><span className="etiqueta">Costo (USD)</span><input name="costo_usd" defaultValue={z.costo_usd === '' ? '' : Number(z.costo_usd)} inputMode="decimal" className="campo w-28" /></label>
            <label className="flex items-center gap-2 pb-2.5 text-sm"><input type="checkbox" name="activa" defaultChecked={z.activa} /> Activa</label>
            <BotonEnviar className="boton-sec" pendiente={z.id ? 'Guardando…' : 'Agregando…'}>{z.id ? 'Guardar' : 'Agregar zona'}</BotonEnviar>
          </FormularioConservado>
        ))}
      </section>

      <section key={clave('equipo')} {...seccion('equipo', 'tarjeta space-y-4 p-6')}>
        <div>
          <h2 className="text-3xl">Equipo</h2>
          <p className="text-sm text-humo">
            Para sumar un empleado: crea su usuario en Supabase (Authentication, Add user) y, cuando aparezca aquí abajo como cliente, cámbialo a empleado.
            Los empleados pueden subir el reporte de inventario y editar productos, pero no ven los pedidos web ni cambian precios.
          </p>
        </div>
        {aviso('equipo')}
        <EquipoTabla usuarios={usuarios ?? []} miId={perfil.id} />
        <BuscarUsuario />
      </section>
    </div>
  )
}

function EquipoTabla({ usuarios, miId }: { usuarios: { id: string; nombre: string | null; email: string | null; rol: string }[]; miId: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="tabla">
        <thead><tr><th>Persona</th><th>Rol</th><th /></tr></thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id}>
              <td>{u.nombre ?? u.email}<div className="text-xs text-humo">{u.email}</div></td>
              <td>{u.rol === 'dueno' ? 'Dueño' : 'Empleado'}</td>
              <td>{u.id !== miId && u.rol === 'empleado' && (
                <form action={cambiarRol}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="rol" value="cliente" />
                  <BotonConfirmar className="text-sm text-alerta underline" pendiente="Quitando…" titulo="¿Quitar acceso al panel?" mensaje={`${u.nombre ?? u.email} ya no podrá entrar al panel.`} confirmar="Quitar acceso">Quitar acceso</BotonConfirmar></form>
              )}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

async function BuscarUsuario() {
  const { supabase } = await exigirDueno()
  const { data } = await supabase.from('perfiles').select('id, nombre, email').eq('rol', 'cliente').order('creado_en', { ascending: false }).limit(10)
  if (!data?.length) return null
  return (
    <details>
      <summary className="cursor-pointer text-sm">Dar acceso de empleado a una cuenta existente</summary>
      <ul className="mt-2 space-y-2">
        {data.map((u) => (
          <li key={u.id}>
            <form action={cambiarRol} className="flex items-center justify-between gap-3 text-sm">
              <span>{u.nombre ?? u.email}</span>
              <input type="hidden" name="id" value={u.id} /><input type="hidden" name="rol" value="empleado" />
              <BotonEnviar className="boton-sec" pendiente="Asignando…">Hacer empleado</BotonEnviar>
            </form>
          </li>
        ))}
      </ul>
    </details>
  )
}
