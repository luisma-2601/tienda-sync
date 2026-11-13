import { marca } from '@/marca.config'
/**
 * Logo de la marca (marca.logo en marca.config.ts) que cae, se mece y suelta bocanadas (estilos en globals.css).
 * Sin `continuo` (carrito vacío) se mece un par de veces y se detiene. Con `continuo` sigue meciéndose y soltando
 * bocanadas, y va más grande: es la pantalla de carga, donde es lo único en pantalla.
 */
export function Frasco({ continuo = false }: { continuo?: boolean }) {
  const bocanadas = [
    { left: '46%', delay: '1.1s', deriva: '-14px', tam: 'h-4 w-4' },
    { left: '52%', delay: '1.5s', deriva: '10px', tam: 'h-3 w-3' },
    { left: '49%', delay: '1.9s', deriva: '-4px', tam: 'h-5 w-5' },
  ]
  return (
    <div className={`relative mx-auto ${continuo ? 'frasco-continuo h-72 w-56 sm:h-96 sm:w-72' : 'h-52 w-40'}`} aria-hidden="true">
      {bocanadas.map((b) => (
        <span
          key={b.delay}
          className={`bocanada absolute top-0 rounded-full bg-dorado/30 ${b.tam}`}
          style={{ left: b.left, animationDelay: b.delay, ['--deriva' as string]: b.deriva }}
        />
      ))}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={marca.logo}
        alt=""
        width={295}
        height={412}
        fetchPriority={continuo ? 'high' : undefined}
        className={`frasco-vacio absolute inset-x-0 bottom-0 mx-auto w-auto drop-shadow-[0_14px_24px_rgb(0_0_0/0.3)] ${continuo ? 'h-60 sm:h-80' : 'h-40'}`}
      />
    </div>
  )
}
