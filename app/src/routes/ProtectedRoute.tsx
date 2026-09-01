import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../lib/stores/auth'
import type { AppRole } from '../lib/types/domain'

// Guarda de ruta por rol. Esto es UX, no seguridad real: la seguridad real
// vive en las políticas RLS de Postgres. Aquí solo evitamos que un usuario
// vea pantallas que no le corresponden y lo redirigimos a donde sí puede
// trabajar.
export function ProtectedRoute({ allow }: { allow: AppRole[] }) {
  const { loading, userId, profile } = useAuthStore()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-ink-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-action-400 border-t-transparent" />
      </div>
    )
  }

  if (!userId) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!profile) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-ink-950 px-6 text-center">
        <p className="text-ink-100">Tu sesión expiró o tu perfil no está configurado.</p>
        <p className="text-sm text-ink-400">Contacta al administrador de tu empresa.</p>
      </div>
    )
  }

  if (!profile.is_active) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-ink-950 px-6 text-center">
        <p className="text-ink-100">Tu cuenta está inactiva.</p>
        <p className="text-sm text-ink-400">Contacta al administrador de tu empresa.</p>
      </div>
    )
  }

  if (!allow.includes(profile.role)) {
    return <Navigate to={homeForRole(profile.role)} replace />
  }

  return <Outlet />
}

export function homeForRole(role: AppRole): string {
  switch (role) {
    case 'super_admin':
      return '/superadmin'
    case 'admin':
      return '/admin'
    case 'supervisor':
      return '/supervisor'
    case 'guard':
      return '/guard'
    case 'client':
      return '/portal'
    default:
      return '/login'
  }
}
