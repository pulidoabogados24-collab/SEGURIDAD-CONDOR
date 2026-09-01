import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import { useAuthStore } from '../../lib/stores/auth'
import { Card } from '../../components/ui/Card'
import type { ServiceRow } from '../../lib/types/domain'

interface ServiceCompliance {
  service: ServiceRow
  routesScheduled: number
  routesCompleted: number
  pointsExpected: number
  pointsCompleted: number
  incidents: number
}

function complianceTone(pct: number) {
  if (pct >= 95) return 'text-ok-400'
  if (pct >= 80) return 'text-warn-400'
  return 'text-danger-400'
}

export function AdminReports() {
  const companyId = useAuthStore((s) => s.profile?.company_id)
  const [rows, setRows] = useState<ServiceCompliance[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<'today' | 'month'>('month')

  useEffect(() => {
    if (companyId) void load(companyId)
  }, [companyId, range])

  async function load(cid: string) {
    setLoading(true)
    const since =
      range === 'today'
        ? new Date().toISOString().slice(0, 10)
        : new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

    const { data: services } = await supabase.from('services').select('*').eq('company_id', cid)
    const results: ServiceCompliance[] = []

    for (const service of services ?? []) {
      const { data: sessions } = await supabase
        .from('route_sessions')
        .select('status, expected_points, completed_points')
        .eq('service_id', service.id)
        .gte('scheduled_at', since)

      const { count: incidentCount } = await supabase
        .from('incidents')
        .select('id', { count: 'exact', head: true })
        .eq('service_id', service.id)
        .gte('occurred_at', since)

      const sess = sessions ?? []
      results.push({
        service,
        routesScheduled: sess.length,
        routesCompleted: sess.filter((s) => s.status === 'completed').length,
        pointsExpected: sess.reduce((sum, s) => sum + s.expected_points, 0),
        pointsCompleted: sess.reduce((sum, s) => sum + s.completed_points, 0),
        incidents: incidentCount ?? 0,
      })
    }

    setRows(results)
    setLoading(false)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink-50">Reportes</h1>
          <p className="mt-1 text-sm text-ink-400">Cumplimiento por servicio.</p>
        </div>
        <div className="flex gap-2 rounded-lg bg-ink-800 p-1">
          <button onClick={() => setRange('today')} className={`rounded-md px-3 py-1.5 text-xs font-medium ${range === 'today' ? 'bg-action-500 text-ink-950' : 'text-ink-300'}`}>Hoy</button>
          <button onClick={() => setRange('month')} className={`rounded-md px-3 py-1.5 text-xs font-medium ${range === 'month' ? 'bg-action-500 text-ink-950' : 'text-ink-300'}`}>Este mes</button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {loading ? (
          <p className="text-sm text-ink-400">Calculando…</p>
        ) : (
          rows.map((r) => {
            const routePct = r.routesScheduled > 0 ? (r.routesCompleted / r.routesScheduled) * 100 : 0
            const pointPct = r.pointsExpected > 0 ? (r.pointsCompleted / r.pointsExpected) * 100 : 0
            return (
              <Card key={r.service.id} className="p-5">
                <p className="text-sm font-semibold text-ink-50">{r.service.name}</p>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-ink-500">Rondas realizadas</p>
                    <p className="text-lg font-semibold text-ink-100">{r.routesCompleted} / {r.routesScheduled}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-500">Cumplimiento de rondas</p>
                    <p className={`text-lg font-semibold ${complianceTone(routePct)}`}>{routePct.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-500">Puntos verificados</p>
                    <p className="text-lg font-semibold text-ink-100">{r.pointsCompleted} / {r.pointsExpected}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-500">Novedades</p>
                    <p className="text-lg font-semibold text-ink-100">{r.incidents}</p>
                  </div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-700">
                  <div
                    className={`h-full rounded-full ${pointPct >= 95 ? 'bg-ok-500' : pointPct >= 80 ? 'bg-warn-500' : 'bg-danger-500'}`}
                    style={{ width: `${Math.min(pointPct, 100)}%` }}
                  />
                </div>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
