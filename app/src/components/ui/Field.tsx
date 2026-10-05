import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

const base =
  'w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-ink-50 outline-none placeholder:text-ink-500 focus:border-action-400 focus:ring-1 focus:ring-action-400 disabled:opacity-60'

export function Field({
  label,
  hint,
  className,
  ...rest
}: { label: string; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="mb-1.5 block text-xs font-medium text-ink-300">{label}</span>
      <input className={base} {...rest} />
      {hint && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
    </label>
  )
}

export function SelectField({
  label,
  hint,
  children,
  className,
  ...rest
}: { label: string; hint?: ReactNode; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="mb-1.5 block text-xs font-medium text-ink-300">{label}</span>
      <select className={base} {...rest}>
        {children}
      </select>
      {hint && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
    </label>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-400">
      {message}
    </p>
  )
}
