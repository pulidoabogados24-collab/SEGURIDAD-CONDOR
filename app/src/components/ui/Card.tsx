import type { HTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx('rounded-xl border border-ink-700 bg-ink-900', className)}
      {...rest}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-ink-800 px-5 py-4">
      <div>
        <h3 className="text-sm font-semibold text-ink-50">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
