import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import { useAuthStore } from '../../lib/stores/auth'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { IconLogout, IconBuilding } from '../../components/ui/icons'
import type { ServiceRow } from '../../lib/types/domain'

interface ServiceCompliance {
  service: ServiceRow
  routesScheduled: number
  routesCompleted: number
  compliance: number
  incidents: number
  points: number
}

export function ClientPortal() {
  const { profile, signOut } = useAuthStore()
  const [rows, setRows] = useState<ServiceCompliance[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile) void load()
  }, [profile])

  async function load() {
    setLoading(true)
    const { data: clientLinks } = await supabase.from('client_users').select('client_id').eq('user_id', profile!.id)
    const clientIds = (clientLinks ?? []).map((c) => c.client_id)
    if (clientIds.length === 0) {
      setLoading(false)
      return
    }
    const { data: services } = await supabase.from('services').select('*').in('client_id', clientIds)
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

    const results: ServiceCompliance[] = []
    for (const service of services ?? []) {
      const { data: sessions } = await supabase
        .from('route_sessions')
        .select('status, expected_points, completed_points')
        .eq('service_id', service.id)
        .gte('scheduled_at', monthStart)
      const { count: incidents } = await supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('service_id', service.id).gte('occurred_at', monthStart)

      const sess = sessions ?? []
      const completed = sess.filter((s) => s.status === 'completed').length
      results.push({
        service,
        routesScheduled: sess.length,
        routesCompleted: completed,
        compliance: sess.length > 0 ? (completed / sess.length) * 100 : 0,
        incidents: incidents ?? 0,
        points: sess.reduce((sum, s) => sum + s.completed_points, 0),
      })
    }
    setRows(results)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-ink-950 px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-ink-50">Portal del Cliente</h1>
            <p className="mt-1 text-sm text-ink-400">{profile?.full_name}</p>
          </div>
          <Button variant="ghost" onClick={signOut}><IconLogout width={16} height={16} /> Salir</Button>
        </div>

        <div className="mt-8 space-y-4">
          {loading ? (
            <p className="text-sm text-ink-400">Cargando…</p>
          ) : rows.length === 0 ? (
            <EmptyState icon={<IconBuilding width={32} height={32} />} title="Sin servicios asociados" />
          ) : (
            rows.map((r) => (
              <Card key={r.service.id} className="p-6">
                <p className="text-base font-semibold text-ink-50">{r.service.name}</p>
                <p className="text-xs text-ink-500">Mes en curso</p>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat label="Rondas programadas" value={r.routesScheduled} />
                  <Stat label="Rondas realizadas" value={r.routesCompleted} />
                  <Stat label="Cumplimiento" value={`${r.compliance.toFixed(1)}%`} accent />
                  <Stat label="Novedades" value={r.incidents} />
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs text-ink-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${accent ? 'text-action-400' : 'text-ink-100'}`}>{value}</p>
    </div>
  )
}
