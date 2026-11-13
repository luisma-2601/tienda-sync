import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Se fijan al compilar: Vercel compila con cada push. El panel muestra "Última actualización a las…".
  env: {
    TIENDA_ACTUALIZADO_EN: new Date().toISOString(),
    TIENDA_VERSION: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7),
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
  experimental: {
    serverActions: { bodySizeLimit: '8mb' }, // reportes XLSX del sistema administrativo
  },
}

export default nextConfig
