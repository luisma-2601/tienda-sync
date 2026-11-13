'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal, useFormStatus } from 'react-dom'

type Textos = {
  titulo: string
  mensaje?: React.ReactNode
  /** Texto del botón que confirma. */
  confirmar?: string
  cancelar?: string
}

/**
 * Modal para confirmar una acción importante. Usa <dialog> nativo: atrapa el foco,
 * se cierra con Escape o tocando fuera y queda por encima de todo (aunque esté dentro de un menú).
 */
export function DialogoConfirmacion({
  abierto,
  titulo,
  mensaje,
  confirmar = 'Confirmar',
  cancelar = 'Cancelar',
  onConfirmar,
  onCerrar,
}: Textos & { abierto: boolean; onConfirmar: () => void; onCerrar: () => void }) {
  const dialogo = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dialogo.current
    if (abierto && d && !d.open) d.showModal()
  }, [abierto])

  if (!abierto) return null
  return createPortal(
    <dialog
      ref={dialogo}
      className="dialogo"
      aria-labelledby="dialogo-titulo"
      onCancel={(e) => { e.preventDefault(); onCerrar() }}
      // Un clic en el fondo cae sobre el propio <dialog>, no sobre su contenido.
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar() }}
    >
      <div className="p-6">
        <h2 id="dialogo-titulo" className="text-3xl">{titulo}</h2>
        {mensaje && <p className="mt-2 text-humo">{mensaje}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="boton-sec" onClick={onCerrar} autoFocus>{cancelar}</button>
          <button type="button" className="boton bg-alerta" onClick={() => { onCerrar(); onConfirmar() }}>{confirmar}</button>
        </div>
      </div>
    </dialog>,
    document.body,
  )
}

/**
 * Botón de envío de un <form action> que pide confirmación antes de enviarlo.
 * Conserva el name/value del botón, así que sirve en formularios con varias acciones.
 */
export function BotonConfirmar({
  children,
  className = 'boton',
  pendiente,
  name,
  value,
  formAction,
  ...textos
}: Textos & {
  children: React.ReactNode
  className?: string
  /** Si se indica, el botón muestra este texto con un indicador mientras se envía. */
  pendiente?: string
  name?: string
  value?: string
  /** Acción propia del botón (en lugar de la del formulario), como un `formAction` normal. */
  formAction?: (form: FormData) => void | Promise<void>
} & Pick<React.ComponentProps<'button'>, 'aria-label' | 'title'>) {
  const [abierto, setAbierto] = useState(false)
  const boton = useRef<HTMLButtonElement>(null)
  const { pending } = useFormStatus()
  const { titulo, mensaje, confirmar, cancelar, ...atributos } = textos

  return (
    <>
      <button
        ref={boton}
        name={name}
        value={value}
        formAction={formAction}
        className={`${className} ${pending ? 'cursor-wait' : ''}`}
        disabled={pending}
        aria-busy={pending}
        onClick={(e) => { e.preventDefault(); setAbierto(true) }}
        {...atributos}
      >
        {pending && pendiente ? (
          <span className="inline-flex animate-cambio items-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            {pendiente}
          </span>
        ) : (
          children
        )}
      </button>
      <DialogoConfirmacion
        abierto={abierto}
        titulo={titulo}
        mensaje={mensaje}
        confirmar={confirmar}
        cancelar={cancelar}
        onCerrar={() => setAbierto(false)}
        onConfirmar={() => boton.current?.form?.requestSubmit(boton.current)}
      />
    </>
  )
}
