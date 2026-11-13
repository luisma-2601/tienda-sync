import { MarcadorCarga } from '@/components/PantallaCarga'

// Envuelve los layouts de la tienda y del panel (ambos leen la sesión antes de pintar): se activa al abrir
// el sitio y al pasar de la tienda al panel, pero no al navegar dentro de cada uno.
// Lo que se ve es la capa de PantallaCarga (layout raíz), que además dura al menos un segundo.
export default function Cargando() {
  return (
    <div className="min-h-screen">
      <MarcadorCarga />
    </div>
  )
}
