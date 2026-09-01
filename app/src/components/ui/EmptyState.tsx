import type { ReactNode } from 'react'

// Estados vacíos y de error humanos, consistentes en toda la app.
// Nunca dejar una pantalla en blanco o con un stack trace visible.
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-ink-700 px-6 py-12 text-center">
      {icon && <div className="text-ink-500">{icon}</div>}
      <p className="text-sm font-medium text-ink-100">{title}</p>
      {description && <p className="max-w-sm text-sm text-ink-400">{description}</p>}
      {action}
    </div>
  )
}
