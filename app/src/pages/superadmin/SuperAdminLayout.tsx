import { Outlet } from 'react-router-dom'
import { AppShell } from '../../components/layout/AppShell'
import { IconHome, IconBuilding } from '../../components/ui/icons'

export function SuperAdminLayout() {
  return (
    <AppShell
      nav={[
        { to: '/superadmin', label: 'Panel SaaS', icon: <IconHome /> },
        { to: '/superadmin/empresas', label: 'Empresas', icon: <IconBuilding /> },
      ]}
    >
      <Outlet />
    </AppShell>
  )
}
