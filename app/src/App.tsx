import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './lib/stores/auth'
import { initAutoSync } from './lib/offline/sync'
import { ProtectedRoute } from './routes/ProtectedRoute'
import { LoginPage } from './pages/auth/LoginPage'

import { SuperAdminLayout } from './pages/superadmin/SuperAdminLayout'
import { SuperAdminDashboard } from './pages/superadmin/SuperAdminDashboard'
import { SuperAdminCompanies } from './pages/superadmin/SuperAdminCompanies'

import { AdminLayout } from './pages/admin/AdminLayout'
import { AdminDashboard } from './pages/admin/AdminDashboard'
import { AdminServices } from './pages/admin/AdminServices'
import { AdminServiceDetail } from './pages/admin/AdminServiceDetail'
import { AdminGuards } from './pages/admin/AdminGuards'
import { AdminUsers } from './pages/admin/AdminUsers'
import { AdminIncidents } from './pages/admin/AdminIncidents'
import { AdminReports } from './pages/admin/AdminReports'
import { AdminCheckpoints } from './pages/admin/AdminCheckpoints'
import { AdminClients } from './pages/admin/AdminClients'
import { AdminRounds } from './pages/admin/AdminRounds'
import { AdminLiveMap } from './pages/admin/AdminLiveMap'

import { SupervisorLayout } from './pages/supervisor/SupervisorLayout'
import { SupervisorOpsCenter } from './pages/supervisor/SupervisorOpsCenter'
import { SupervisorAlerts } from './pages/supervisor/SupervisorAlerts'
import { SupervisorIncidents } from './pages/supervisor/SupervisorIncidents'

import { GuardHome } from './pages/guard/GuardHome'
import { GuardRoute } from './pages/guard/GuardRoute'
import { GuardScan } from './pages/guard/GuardScan'
import { GuardIncidentForm } from './pages/guard/GuardIncidentForm'
import { GuardDailyLog } from './pages/guard/GuardDailyLog'

import { ClientPortal } from './pages/client/ClientPortal'

export default function App() {
  const init = useAuthStore((s) => s.init)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    return initAutoSync(() => {
      const { profile } = useAuthStore.getState()
      if (profile?.role === 'guard' && profile.company_id) {
        return { companyId: profile.company_id, userId: profile.id }
      }
      return null
    })
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route element={<ProtectedRoute allow={['super_admin']} />}>
          <Route path="/superadmin" element={<SuperAdminLayout />}>
            <Route index element={<SuperAdminDashboard />} />
            <Route path="empresas" element={<SuperAdminCompanies />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allow={['admin']} />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="mapa" element={<AdminLiveMap />} />
            <Route path="rondas" element={<AdminRounds />} />
            <Route path="puntos" element={<AdminCheckpoints />} />
            <Route path="clientes" element={<AdminClients />} />
            <Route path="servicios" element={<AdminServices />} />
            <Route path="servicios/:serviceId" element={<AdminServiceDetail />} />
            <Route path="vigilantes" element={<AdminGuards />} />
            <Route path="usuarios" element={<AdminUsers />} />
            <Route path="incidencias" element={<AdminIncidents />} />
            <Route path="reportes" element={<AdminReports />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allow={['supervisor']} />}>
          <Route path="/supervisor" element={<SupervisorLayout />}>
            <Route index element={<SupervisorOpsCenter />} />
            <Route path="mapa" element={<AdminLiveMap />} />
            <Route path="alertas" element={<SupervisorAlerts />} />
            <Route path="incidencias" element={<SupervisorIncidents />} />
            <Route path="puntos" element={<AdminCheckpoints />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allow={['guard']} />}>
          <Route path="/guard" element={<GuardHome />} />
          <Route path="/guard/ronda/:sessionId" element={<GuardRoute />} />
          <Route path="/guard/ronda/:sessionId/escanear" element={<GuardScan />} />
          <Route path="/guard/novedad" element={<GuardIncidentForm />} />
          <Route path="/guard/minuta" element={<GuardDailyLog />} />
        </Route>

        <Route element={<ProtectedRoute allow={['client']} />}>
          <Route path="/portal" element={<ClientPortal />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
