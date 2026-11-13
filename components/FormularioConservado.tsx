'use client'

import type { ComponentProps } from 'react'

/**
 * Formulario con acción de servidor que NO se vacía al terminar el envío.
 * Desde React 19, un <form action={…}> se reinicia solo al acabar la acción (con form.reset()),
 * aunque haya terminado en error: se borraba lo que la persona había escrito. Aquí se cancela
 * ese reinicio. Donde, tras guardar con éxito, haya que mostrar los datos nuevos, el formulario
 * recibe una `key` que solo cambia en ese caso y se vuelve a montar.
 */
export function FormularioConservado(props: ComponentProps<'form'>) {
  return <form {...props} onReset={(e) => e.preventDefault()} />
}
