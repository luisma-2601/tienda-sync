import type { MetadataRoute } from 'next'
import { marca } from '@/marca.config'

// El panel como app instalable (PWA). En Android aparece en "Compartir": desde el sistema administrativo se comparte
// el reporte .xlsx con el panel y llega a /admin/compartir, que actualiza el inventario.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/admin',
    name: marca.nombrePanel,
    short_name: marca.nombrePanel,
    description: `Panel de ${marca.nombre}: inventario sincronizado, productos y pedidos web.`,
    start_url: '/admin',
    scope: '/admin',
    display: 'standalone',
    background_color: marca.colorFondo,
    theme_color: marca.colorPrincipal,
    lang: 'es',
    icons: [
      { src: '/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    share_target: {
      action: '/admin/compartir',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        files: [{ name: 'archivo', accept: ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] }],
      },
    },
  }
}
