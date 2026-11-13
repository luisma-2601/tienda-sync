// Sonidos de la tienda, sintetizados con Web Audio: no hay archivos que descargar y suenan igual en todos lados.
// Son cortos y suaves (como un toque de cristal) y solo responden a algo que hizo el cliente. Se pueden apagar
// con el botón de sonido del encabezado; la preferencia queda en este navegador.

export type Sonido = 'agregar' | 'quitar' | 'mas' | 'menos' | 'filtro' | 'abrir' | 'opcion' | 'pedido'

const LLAVE = 'sonidos'
/** Volumen general: bajo a propósito, que acompañe sin molestar. */
const VOLUMEN = 0.18

let contexto: AudioContext | null = null
const avisos = new Set<() => void>()

export function sonidosActivos() {
  try {
    return localStorage.getItem(LLAVE) !== 'no'
  } catch {
    return true
  }
}

export function cambiarSonidos(activos: boolean) {
  try {
    localStorage.setItem(LLAVE, activos ? 'si' : 'no')
  } catch {
    /* sin almacenamiento: vale solo para esta visita */
  }
  avisos.forEach((f) => f())
}

/** Para el botón del encabezado (useSyncExternalStore). */
export function suscribirSonidos(f: () => void) {
  avisos.add(f)
  const alGuardar = (e: StorageEvent) => { if (e.key === LLAVE) f() }
  window.addEventListener('storage', alGuardar)
  return () => { avisos.delete(f); window.removeEventListener('storage', alGuardar) }
}

/** Una nota con ataque rápido y cola suave. `hasta` hace que la nota se deslice a otra frecuencia. */
function nota(ctx: AudioContext, salida: AudioNode, frec: number, inicio: number, dur: number, vol: number, tipo: OscillatorType = 'sine', hasta?: number) {
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = tipo
  osc.frequency.setValueAtTime(frec, inicio)
  if (hasta) osc.frequency.exponentialRampToValueAtTime(hasta, inicio + dur)
  env.gain.setValueAtTime(0.0001, inicio)
  env.gain.exponentialRampToValueAtTime(vol, inicio + 0.008)
  env.gain.exponentialRampToValueAtTime(0.0001, inicio + dur)
  osc.connect(env).connect(salida)
  osc.start(inicio)
  osc.stop(inicio + dur + 0.02)
}

/** Nota de cristal: la fundamental y un armónico suave encima. */
function cristal(ctx: AudioContext, salida: AudioNode, frec: number, inicio: number, dur = 0.35, vol = 0.5) {
  nota(ctx, salida, frec, inicio, dur, vol)
  nota(ctx, salida, frec * 2.01, inicio, dur * 0.6, vol * 0.18)
}

const RECETAS: Record<Sonido, (ctx: AudioContext, salida: AudioNode, t: number) => void> = {
  // Dos notas que suben: algo entró al carrito.
  agregar: (ctx, s, t) => { cristal(ctx, s, 784, t, 0.22, 0.45); cristal(ctx, s, 1175, t + 0.09, 0.45, 0.5) },
  // Dos notas que bajan, más graves y suaves: algo salió.
  quitar: (ctx, s, t) => { cristal(ctx, s, 659, t, 0.2, 0.35); cristal(ctx, s, 440, t + 0.09, 0.35, 0.35) },
  mas: (ctx, s, t) => nota(ctx, s, 988, t, 0.08, 0.3, 'triangle'),
  menos: (ctx, s, t) => nota(ctx, s, 740, t, 0.08, 0.3, 'triangle'),
  // Un toque breve, como pasar una página.
  filtro: (ctx, s, t) => nota(ctx, s, 1320, t, 0.06, 0.22, 'triangle', 990),
  // Un deslizamiento corto hacia arriba: se abre la ficha.
  abrir: (ctx, s, t) => nota(ctx, s, 520, t, 0.16, 0.3, 'sine', 1040),
  opcion: (ctx, s, t) => nota(ctx, s, 880, t, 0.07, 0.25, 'triangle'),
  // Arpegio que sube: el pedido salió.
  pedido: (ctx, s, t) => { [523, 659, 784, 1047].forEach((f, i) => cristal(ctx, s, f, t + i * 0.08, i === 3 ? 0.6 : 0.25, 0.42)) },
}

/** Toca un sonido. Si están apagados o el navegador no tiene Web Audio, no hace nada. */
export function sonar(sonido: Sonido) {
  if (typeof window === 'undefined' || !sonidosActivos()) return
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    // Se crea con el primer toque del cliente (los navegadores no dejan sonar antes de un gesto).
    contexto ??= new Ctx()
    if (contexto.state === 'suspended') void contexto.resume()
    const salida = contexto.createGain()
    salida.gain.value = VOLUMEN
    salida.connect(contexto.destination)
    RECETAS[sonido](contexto, salida, contexto.currentTime + 0.01)
  } catch {
    /* sin sonido no pasa nada */
  }
}
