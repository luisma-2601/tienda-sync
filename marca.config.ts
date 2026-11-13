/**
 * Datos de la marca. Es el único archivo que hay que editar para adaptar la tienda a un negocio nuevo
 * (además de los colores en app/globals.css y las imágenes en public/). Ver "Adaptar a un negocio" en el README.
 */
export const marca = {
  /** Nombre completo: título del sitio, pie de página, textos alternativos. */
  nombre: 'Mi Perfumería',
  /** Nombre corto: logo de texto del encabezado y saludo del mensaje de WhatsApp. */
  nombreCorto: 'Mi Perfumería',
  /** Nombre de la app instalable del panel (aparece en "Compartir" de Android y en el inicio del iPhone). */
  nombrePanel: 'Panel Tienda',
  /**
   * Sistema administrativo del que sale el inventario (Fina, Valery, Saint, Profit, A2, un Excel propio…).
   * Se usa en los textos del panel, por ejemplo "Elige el reporte de inventario de {sistema}".
   */
  sistema: 'tu sistema administrativo',
  /** Rubro y ciudad, debajo del logo en la portada. */
  rubroCiudad: 'Perfumería · Caracas',
  /** Dirección física (portada y pie de página). Dejar '' si no hay tienda física. */
  direccion: 'Av. Principal, Local 1',
  /** Línea de entrega del pie de página. */
  entrega: 'Retiro en tienda o delivery en zonas cercanas.',
  /** Línea de pagos del pie de página. Los métodos reales se configuran en el panel. */
  pagos: 'Precios a tasa BCV. Pagos en divisas o bolívares.',
  /** Descripción para buscadores y vistas previas al compartir el link. */
  descripcion: 'Perfumes originales y decants. Paga en divisas o bolívares, retira en tienda o pide delivery.',
  /** Titular y texto de la portada. */
  titular: 'Tu próximo perfume te está esperando.',
  textoPortada:
    '¡Nuestro catálogo está en constante actualización! Si buscas alguna fragancia que no encuentres, contáctanos por WhatsApp.',
  /** Logo (PNG con fondo transparente, aprox. 3:4) en public/. Se usa en portada, carrito vacío y pantalla de carga. */
  logo: '/logo.png',
  /** Cómo se presenta el negocio ante la IA que redacta las fichas de producto. */
  contextoIA: 'una perfumería que vende por redes sociales y WhatsApp',
  /** Colores de la barra del navegador y del panel instalado (deben coincidir con app/globals.css). */
  colorFondo: '#f4f2ee',
  colorFondoOscuro: '#14110d',
  colorPrincipal: '#1e2a33',
} as const
