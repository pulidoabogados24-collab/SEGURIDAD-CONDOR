import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../lib/stores/auth'
import { Button } from '../../components/ui/Button'
import { homeForRole } from '../../routes/ProtectedRoute'

export function LoginPage() {
  const { signIn, userId, profile } = useAuthStore()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (userId && profile) {
    const target = (location.state as { from?: Location })?.from?.pathname || homeForRole(profile.role)
    return <Navigate to={target} replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const result = await signIn(email, password)
    setLoading(false)
    if (result.error) setError(result.error)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-action-500 text-lg font-bold text-ink-950">
            CG
          </div>
          <h1 className="text-xl font-semibold text-ink-50">ControlGuard</h1>
          <p className="mt-1 text-sm text-ink-400">Centro de operaciones de seguridad</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-ink-700 bg-ink-900 p-6">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-ink-300">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-ink-50 outline-none focus:border-action-400 focus:ring-1 focus:ring-action-400"
              placeholder="tu@empresa.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-ink-300">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-ink-50 outline-none focus:border-action-400 focus:ring-1 focus:ring-action-400"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-400" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Iniciar sesión
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-ink-500">
          Condor Security — contraseña <span className="font-mono">Condor2026!</span>
          <br />
          admin@condorsecurity.co · supervisor@condorsecurity.co ·
          vigilante@condorsecurity.co
        </p>
      </div>
    </div>
  )
}
