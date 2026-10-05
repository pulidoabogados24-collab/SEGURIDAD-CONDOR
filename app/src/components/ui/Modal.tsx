import { useEffect, useRef, type ReactNode } from 'react'
import { IconX } from './icons'
import { Button } from './Button'

/**
 * Ventana modal accesible: se cierra con Escape o tocando el fondo, bloquea el
 * scroll de la página mientras está abierta y devuelve el foco al cerrar. En
 * celular ocupa todo el ancho y se ancla abajo (hoja inferior), que es donde
 * alcanza el pulgar.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-ink-700 bg-ink-900 shadow-2xl outline-none sm:rounded-2xl ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'
        }`}
      >
        <div className="flex items-center justify-between border-b border-ink-800 px-5 py-4">
          <h2 className="text-base font-semibold text-ink-50">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-800 hover:text-ink-50"
          >
            <IconX width={18} height={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-ink-800 px-5 py-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/** Confirmación de una acción con consecuencias. El texto dice QUÉ pasa. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  title: string
  message: ReactNode
  confirmLabel: string
  danger?: boolean
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-ink-200">{message}</div>
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-400">
          {error}
        </p>
      )}
    </Modal>
  )
}
