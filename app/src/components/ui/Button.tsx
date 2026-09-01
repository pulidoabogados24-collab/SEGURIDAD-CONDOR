import type { ButtonHTMLAttributes } from 'react'
import clsx from 'clsx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variants: Record<Variant, string> = {
  primary: 'bg-action-500 text-ink-950 hover:bg-action-400 active:bg-action-600 disabled:bg-ink-700 disabled:text-ink-400',
  secondary: 'bg-ink-800 text-ink-50 ring-1 ring-inset ring-ink-600 hover:bg-ink-700 disabled:text-ink-500',
  ghost: 'bg-transparent text-ink-200 hover:bg-ink-800 disabled:text-ink-500',
  danger: 'bg-danger-500 text-white hover:bg-danger-400 disabled:bg-ink-700 disabled:text-ink-400',
}

const sizes: Record<Size, string> = {
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-4 text-base',
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950',
        'disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      )}
      {children}
    </button>
  )
}
