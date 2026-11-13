/** Mensaje tras guardar: el de éxito dibuja una palomita; el de error se sacude un poco. */
export function Aviso({ ok, error }: { ok?: string; error?: string }) {
  if (error) {
    return (
      <p role="alert" className="aviso-error flex items-center gap-2 rounded-lg bg-alerta/10 px-4 py-3 text-sm text-alerta">
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <path d="M12 7v6M12 17h.01" />
        </svg>
        {error}
      </p>
    )
  }
  if (!ok) return null
  return (
    <p role="status" className="flex items-center gap-2 rounded-lg bg-ok/10 px-4 py-3 text-sm text-ok">
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray="24" className="animate-trazo" />
      </svg>
      {ok}
    </p>
  )
}
