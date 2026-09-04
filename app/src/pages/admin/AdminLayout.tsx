import { Outlet, useLocation } from 'react-router-dom'
import { AppShell, type NavItem } from '../../components/layout/AppShell'
import {
  IconHome,
  IconMap,
  IconQr,
  IconBuilding,
  IconUsers,
  IconAlert,
  IconReport,
  IconShield,
} from '../../components/ui/icons'

const NAV: NavItem[] = [
  { to: '/admin', label: 'Panel', icon: <IconHome width={18} height={18} /> },
  { to: '/admin/mapa', label: 'Mapa en vivo', icon: <IconMap width={18} height={18} /> },
  { to: '/admin/rondas', label: 'Rondas', icon: <IconMap width={18} height={18} /> },
  { to: '/admin/puntos', label: 'Puntos de control', icon: <IconQr width={18} height={18} /> },
  { to: '/admin/clientes', label: 'Clientes', icon: <IconBuilding width={18} height={18} /> },
  { to: '/admin/servicios', label: 'Servicios', icon: <IconShield width={18} height={18} /> },
  { to: '/admin/vigilantes', label: 'Vigilantes', icon: <IconUsers width={18} height={18} /> },
  { to: '/admin/incidencias', label: 'Novedades', icon: <IconAlert width={18} height={18} /> },
  { to: '/admin/reportes', label: 'Reportes', icon: <IconReport width={18} height={18} /> },
  { to: '/admin/usuarios', label: 'Usuarios', icon: <IconUsers width={18} height={18} /> },
]

/** Título de la cabecera según la sección activa. */
const TITLES: Record<string, string> = {
  '/admin': 'Panel de operación',
  '/admin/mapa': 'Mapa en vivo',
  '/admin/rondas': 'Rondas',
  '/admin/puntos': 'Puntos de control',
  '/admin/clientes': 'Clientes',
  '/admin/servicios': 'Servicios',
  '/admin/vigilantes': 'Vigilantes',
  '/admin/incidencias': 'Novedades',
  '/admin/reportes': 'Reportes',
  '/admin/usuarios': 'Usuarios',
}

export function AdminLayout() {
  const { pathname } = useLocation()
  const title =
    TITLES[pathname] ??
    (pathname.startsWith('/admin/servicios/') ? 'Detalle del servicio' : 'Panel de operación')

  return (
    <AppShell nav={NAV} title={title}>
      <Outlet />
    </AppShell>
  )
}
