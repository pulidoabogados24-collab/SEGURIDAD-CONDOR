import { Outlet, useLocation } from 'react-router-dom'
import { AppShell, type NavItem } from '../../components/layout/AppShell'
import { IconHome, IconAlert, IconMap, IconQr } from '../../components/ui/icons'

const NAV: NavItem[] = [
  { to: '/supervisor', label: 'Centro de operaciones', icon: <IconHome width={18} height={18} /> },
  { to: '/supervisor/mapa', label: 'Mapa en vivo', icon: <IconMap width={18} height={18} /> },
  { to: '/supervisor/alertas', label: 'Alertas', icon: <IconAlert width={18} height={18} /> },
  { to: '/supervisor/incidencias', label: 'Novedades', icon: <IconMap width={18} height={18} /> },
  { to: '/supervisor/puntos', label: 'Puntos de control', icon: <IconQr width={18} height={18} /> },
]

const TITLES: Record<string, string> = {
  '/supervisor': 'Centro de operaciones',
  '/supervisor/mapa': 'Mapa en vivo',
  '/supervisor/alertas': 'Alertas',
  '/supervisor/incidencias': 'Novedades',
  '/supervisor/puntos': 'Puntos de control',
}

export function SupervisorLayout() {
  const { pathname } = useLocation()
  return (
    <AppShell nav={NAV} title={TITLES[pathname] ?? 'Centro de operaciones'}>
      <Outlet />
    </AppShell>
  )
}
