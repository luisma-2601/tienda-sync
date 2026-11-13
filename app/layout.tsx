import type { Metadata, Viewport } from 'next'
import './globals.css'
import { PantallaCarga } from '@/components/PantallaCarga'
import { marca } from '@/marca.config'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: { default: marca.nombre, template: `%s · ${marca.nombre}` },
  description: marca.descripcion,
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: marca.colorFondo },
    { media: '(prefers-color-scheme: dark)', color: marca.colorFondoOscuro },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Aplica el tema elegido antes de pintar, para evitar el parpadeo. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("tema");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Castoro+Titling&family=Old+Standard+TT:wght@400;700&family=Hanken+Grotesk:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <PantallaCarga />
        {/* Sin JavaScript nada quitaría la capa de carga: que no tape la página. */}
        <noscript><style>{'.pantalla-carga{display:none}'}</style></noscript>
        {children}
      </body>
    </html>
  )
}
