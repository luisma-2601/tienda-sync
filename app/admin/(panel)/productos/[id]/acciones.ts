'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import sharp from 'sharp'
import { exigirDueno, exigirStaff } from '@/lib/admin'
import { cambiosPorFicha, generarFicha } from '@/lib/ia'
import { TEMPORADAS } from '@/lib/tipos'
import { parsearNumero } from '@/lib/normalizar'

const BUCKET = 'productos'
const refrescar = (id: string) => {
  revalidatePath(`/admin/productos/${id}`)
  revalidatePath('/', 'layout')
}
const lista = (t: FormDataEntryValue | null) => String(t ?? '').split(',').map((x) => x.trim()).filter(Boolean)

export async function guardarProducto(form: FormData) {
  const { supabase } = await exigirStaff()
  const id = String(form.get('id'))
  const descripcion = String(form.get('descripcion') ?? '').trim()
  const genero = String(form.get('genero') ?? '')
  const momento = String(form.get('momento') ?? '')
  const texto = (campo: string) => String(form.get(campo) ?? '').trim() || null
  // La pirámide manda: si tiene notas, `notas` es su unión; si no, se usan las notas sueltas.
  const piramide = { notas_salida: lista(form.get('notas_salida')), notas_corazon: lista(form.get('notas_corazon')), notas_fondo: lista(form.get('notas_fondo')) }
  const union = [...new Set([...piramide.notas_salida, ...piramide.notas_corazon, ...piramide.notas_fondo])]
  // "Aprobar ficha" guarda lo editado y la deja aprobada; "Guardar" respeta la casilla.
  const aprobar = form.get('accion') === 'aprobar' || form.get('aprobar') === 'on'
  const { error } = await supabase
    .from('productos')
    .update({
      nombre: String(form.get('nombre') ?? '').trim(),
      marca: String(form.get('marca') ?? '').trim() || null,
      codigo_sistema: String(form.get('codigo_sistema') ?? '').trim() || null,
      presentacion_ml: parsearNumero(form.get('presentacion_ml')),
      genero: ['hombre', 'mujer', 'unisex'].includes(genero) ? genero : null,
      ocasion: form.getAll('ocasion').map(String),
      notas: union.length ? union : lista(form.get('notas')),
      ...piramide,
      marca_sugerida: texto('marca_sugerida'),
      nombre_sugerido: texto('nombre_sugerido'),
      familia_olfativa: texto('familia_olfativa'),
      momento: ['dia', 'noche', 'ambos'].includes(momento) ? momento : null,
      temporadas: form.getAll('temporadas').map(String).filter((t) => t in TEMPORADAS),
      descripcion: descripcion || null,
      descripcion_estado: !descripcion ? 'sin' : aprobar ? 'aprobada' : 'borrador',
      estado: String(form.get('estado')),
    })
    .eq('id', id)
  if (error) redirect(`/admin/productos/${id}?error=${encodeURIComponent(error.message.includes('productos_codigo_norm_uq') ? 'Ese código del sistema ya lo tiene otro producto.' : 'No se pudo guardar.')}`)
  refrescar(id)
  redirect(`/admin/productos/${id}?ok=1&n=${Date.now()}`)
}

export async function generarDescripcion(form: FormData) {
  const { supabase } = await exigirStaff()
  const id = String(form.get('id'))
  const { data: p } = await supabase.from('productos').select('nombre, marca, presentacion_ml, fotos, origen_foto, genero, ocasion, notas').eq('id', id).single()
  if (!p) return
  let aviso = 'ia'
  try {
    const f = await generarFicha({
      nombre: p.nombre,
      marca: p.marca,
      ml: p.presentacion_ml ? Number(p.presentacion_ml) : null,
      origenFoto: p.origen_foto,
      foto: p.fotos?.[0] ?? null,
    })
    // Regenerar reemplaza la ficha completa y la deja en borrador; género y ocasiones ya puestos se respetan.
    const { error } = await supabase.from('productos').update(cambiosPorFicha(p, f)).eq('id', id)
    if (error) throw new Error('No se pudo guardar la ficha.')
    if (!f.seguro) aviso = 'ia-dudosa'
  } catch (e) {
    redirect(`/admin/productos/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : 'Error de la IA')}`)
  }
  refrescar(id)
  redirect(`/admin/productos/${id}?${aviso}=1&n=${Date.now()}`)
}

export async function subirFoto(form: FormData) {
  const { supabase } = await exigirStaff()
  const id = String(form.get('id'))
  const archivo = form.get('foto')
  if (!(archivo instanceof File) || archivo.size === 0) return
  if (!/^image\/(jpeg|png|webp)$/.test(archivo.type) || archivo.size > 7 * 1024 * 1024) {
    redirect(`/admin/productos/${id}?error=${encodeURIComponent('La foto debe ser JPG, PNG o WebP de hasta 7 MB.')}`)
  }
  // Una foto de celular pesa 3-5 MB: se reduce a 1200 px en WebP (≈100 KB) para que el catálogo
  // cargue rápido con datos móviles y no se agote la transferencia de Supabase.
  let foto: Buffer
  try {
    foto = await sharp(Buffer.from(await archivo.arrayBuffer()))
      .rotate() // respeta la orientación de la cámara
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer()
  } catch {
    redirect(`/admin/productos/${id}?error=${encodeURIComponent('No se pudo leer la foto. Prueba con otra.')}`)
  }
  const ruta = `${id}/${Date.now()}.webp`
  // El nombre nunca se repite, así que el navegador y la CDN pueden guardarla un año.
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, foto, { contentType: 'image/webp', cacheControl: '31536000' })
  if (error) redirect(`/admin/productos/${id}?error=${encodeURIComponent('No se pudo subir la foto.')}`)
  const url = supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl
  const { data: p } = await supabase.from('productos').select('fotos').eq('id', id).single()
  await supabase.from('productos').update({ fotos: [...(p?.fotos ?? []), url] }).eq('id', id)
  refrescar(id)
}

export async function quitarFoto(form: FormData) {
  const { supabase } = await exigirStaff()
  const id = String(form.get('id'))
  const url = String(form.get('url'))
  const { data: p } = await supabase.from('productos').select('fotos').eq('id', id).single()
  await supabase.from('productos').update({ fotos: (p?.fotos ?? []).filter((f: string) => f !== url) }).eq('id', id)
  const marcador = `/object/public/${BUCKET}/`
  if (url.includes(marcador)) await supabase.storage.from(BUCKET).remove([url.split(marcador)[1]])
  refrescar(id)
}

export async function principalFoto(form: FormData) {
  const { supabase } = await exigirStaff()
  const id = String(form.get('id'))
  const url = String(form.get('url'))
  const { data: p } = await supabase.from('productos').select('fotos').eq('id', id).single()
  await supabase.from('productos').update({ fotos: [url, ...(p?.fotos ?? []).filter((f: string) => f !== url)] }).eq('id', id)
  refrescar(id)
}

// Decants: solo el dueño.
export async function agregarDecant(form: FormData) {
  const { supabase } = await exigirDueno()
  const id = String(form.get('id'))
  const ml = parsearNumero(form.get('ml'))
  const precio = parsearNumero(form.get('precio_usd'))
  if (!ml || ml <= 0 || precio === null || precio < 0) redirect(`/admin/productos/${id}?error=${encodeURIComponent('Escribe los ml y el precio del decant.')}`)
  const { error } = await supabase.from('decants').insert({ producto_id: id, ml, precio_usd: precio })
  if (error) redirect(`/admin/productos/${id}?error=${encodeURIComponent('Ya existe un decant de ese tamaño.')}`)
  refrescar(id)
}

export async function cambiarDecant(form: FormData) {
  const { supabase } = await exigirDueno()
  const id = String(form.get('id'))
  const decant = String(form.get('decant'))
  if (form.get('accion') === 'borrar') await supabase.from('decants').delete().eq('id', decant)
  else await supabase.from('decants').update({ disponible: form.get('accion') === 'activar' }).eq('id', decant)
  refrescar(id)
}
