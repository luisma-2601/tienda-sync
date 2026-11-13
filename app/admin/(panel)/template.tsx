import { ViewTransition } from 'react'

// El template se vuelve a montar al cambiar de pestaña (no al guardar: los parámetros de búsqueda no lo remontan),
// así que aquí se anima la página que sale y la que entra. La dirección la pone MenuPanel con transitionTypes:
// hacia abajo en el menú el contenido sube; hacia arriba, baja. Estilos en app/globals.css.
export default function TemplatePanel({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      enter={{ 'pestana-adelante': 'pestana-adelante', 'pestana-atras': 'pestana-atras', default: 'panel-suave' }}
      exit={{ 'pestana-adelante': 'pestana-adelante', 'pestana-atras': 'pestana-atras', default: 'panel-suave' }}
      default="none"
    >
      <div>{children}</div>
    </ViewTransition>
  )
}
