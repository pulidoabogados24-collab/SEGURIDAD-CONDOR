import type { ReactNode } from 'react'
import clsx from 'clsx'

type Tone = 'ok' | 'warn' | 'danger' | 'idle' | 'info' | 'action'

const toneClasses: Record<Tone, string> = {
  ok: 'bg-ok-500/15 text-ok-400 ring-1 ring-inset ring-ok-500/30',
  warn: 'bg-warn-500/15 text-warn-400 ring-1 ring-inset ring-warn-500/30',
  danger: 'bg-danger-500/15 text-danger-400 ring-1 ring-inset ring-danger-500/30',
  idle: 'bg-ink-700 text-ink-300 ring-1 ring-inset ring-ink-600',
  info: 'bg-info-500/15 text-info-500 ring-1 ring-inset ring-info-500/30',
  action: 'bg-action-500/15 text-action-400 ring-1 ring-inset ring-action-500/30',
}

export function Badge({ tone = 'idle', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  )
}
