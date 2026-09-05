import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { supabase } from '../../lib/supabase/client'
import { useAuthStore } from '../../lib/stores/auth'
import { ROLE_LABELS } from '../../lib/types/domain'
import { IconAlert, IconLogout } from '../ui/icons'

export interface NavItem {
  to: string
  label: string
  icon: ReactNode
}

/**
 * Estructura de la aplicación de escritorio.
 *
 * Responsive de verdad, no "se ve apretado en el móvil": en pantallas
 * pequeñas la barra lateral se convierte en un cajón que se abre desde la
 * cabecera, se cierra al navegar y se cierra con Escape. Un supervisor
 * revisando la operación desde el celular en la calle es un caso real, no
 * un extra.
 */
export function AppShell({
  nav,
  title,
  children,
}: {
  nav: NavItem[]
  title?: string
  children: ReactNode
}) {
  const { profile, signOut } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [openAlerts, setOpenAlerts] = useState(0)

  // Cerrar el cajón al cambiar de sección.
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  // Contador de alertas abiertas, en vivo.
  useEffect(() => {
    const companyId = profile?.company_id
    if (!companyId) return

    async function count(cid: string) {
      const { count: n } = await supabase
        .from('alerts')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', cid)
        .eq('status', 'open')
      setOpenAlerts(n ?? 0)
    }

    void count(companyId)
    const channel = supabase
      .channel('shell-alerts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'alerts', filter: `company_id=eq.${companyId}` },
        () => void count(companyId),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [profile?.company_id])

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const today = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const sidebar = (
    <>
      <div className="flex items-center gap-2.5 border-b border-ink-800 px-5 py-4">
        <img src="/logo-condor.png" alt="Seguridad Cóndor" className="h-9 w-9 flex-shrink-0 rounded-lg object-cover" />
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-semibold uppercase tracking-wide text-ink-50">Seguridad Cóndor</p>
          <p className="truncate text-[11px] text-ink-500">Control operativo</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-action-500/15 text-action-400'
                  : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100',
              )
            }
            end={item.to.split('/').length <= 2}
          >
            {item.icon}
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-ink-800 px-4 py-3">
        <p className="truncate text-xs font-medium text-ink-100">{profile?.full_name}</p>
        <p className="text-xs text-ink-500">{profile && ROLE_LABELS[profile.role]}</p>
        <button
          onClick={handleSignOut}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-ink-400 transition-colors hover:text-danger-400"
        >
          <IconLogout width={14} height={14} />
          Cerrar sesión
        </button>
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen bg-ink-950">
      {/* Barra lateral fija en escritorio */}
      <aside className="hidden w-60 flex-shrink-0 flex-col border-r border-ink-800 bg-ink-900 lg:flex">
        {sidebar}
      </aside>

      {/* Cajón en móvil */}
      <div
        className={clsx(
          'fixed inset-0 z-40 lg:hidden',
          menuOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!menuOpen}
      >
        <div
          onClick={() => setMenuOpen(false)}
          className={clsx(
            'absolute inset-0 bg-black/60 transition-opacity',
            menuOpen ? 'opacity-100' : 'opacity-0',
          )}
        />
        <aside
          className={clsx(
            'absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-ink-800 bg-ink-900 transition-transform duration-200',
            menuOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {sidebar}
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Cabecera */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-800 bg-ink-950/95 px-4 py-3 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={menuOpen}
            className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-ink-300 hover:bg-ink-800 hover:text-ink-100 lg:hidden"
          >
            <span className="relative block h-3.5 w-5">
              <span className="absolute left-0 top-0 h-0.5 w-5 bg-current" />
              <span className="absolute left-0 top-1/2 h-0.5 w-5 -translate-y-1/2 bg-current" />
              <span className="absolute bottom-0 left-0 h-0.5 w-5 bg-current" />
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-ink-50 sm:text-lg">
              {title ?? 'Panel'}
            </h1>
            <p className="hidden truncate text-xs capitalize text-ink-500 sm:block">{today}</p>
          </div>

          <NavLink
            to={profile?.role === 'supervisor' ? '/supervisor/alertas' : '/admin/alertas'}
            aria-label={`Alertas abiertas: ${openAlerts}`}
            className="relative inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-ink-300 transition-colors hover:bg-ink-800 hover:text-ink-100"
          >
            <IconAlert width={18} height={18} />
            {openAlerts > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 font-mono text-[10px] font-bold text-white">
                {openAlerts > 99 ? '99+' : openAlerts}
              </span>
            )}
          </NavLink>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
