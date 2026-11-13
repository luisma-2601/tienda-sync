'use client'

/**
 * Alterna entre claro y oscuro. El ícono visible lo decide el CSS, así no hay desajuste al hidratar.
 * `redondo` es el botón de la tienda; `menu` es un ítem con texto para el menú del admin.
 */
export function BotonTema({ variante = 'redondo' }: { variante?: 'redondo' | 'menu' }) {
  function alternar() {
    const raiz = document.documentElement
    const actual = raiz.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    const nuevo = actual === 'dark' ? 'light' : 'dark'
    const aplicar = () => { raiz.dataset.theme = nuevo }
    // Fundido entre ambos temas donde el navegador lo soporta (y sin animación si se pidió menos movimiento).
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(aplicar)
    else aplicar()
    try { localStorage.setItem('tema', nuevo) } catch {}
  }

  const menu = variante === 'menu'
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={menu ? undefined : 'Cambiar entre modo claro y oscuro'}
      title={menu ? undefined : 'Cambiar tema'}
      className={menu
        ? 'flex shrink-0 items-center gap-2 whitespace-nowrap lg:w-full rounded-lg px-3 py-2 text-left text-sm text-humo hover:bg-niebla'
        : 'boton-sec h-10 w-10 px-0'}
    >
      <span className="icono-luna">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
        {menu && 'Modo oscuro'}
      </span>
      <span className="icono-sol">
        <svg className="h-5 w-5 text-dorado" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
        {menu && 'Modo claro'}
      </span>
    </button>
  )
}
