import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import { useAuthStore } from '../../lib/stores/auth'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { IconUsers } from '../../components/ui/icons'

interface LiveRow {
  session_id: string
  guard_name: string
  service_name: string
  status: string
  completed: number
  expected: number
  scheduled_at: string
  started_at: string | null
}

export function SupervisorOpsCenter() {
  const companyId = useAuthStore((s) => s.profile?.company_id)
  const [rows, setRows] = useState<LiveRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!companyId) return
    void load(companyId)
    const channel = supabase
      .channel('supervisor-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'route_sessions', filter: `company_id=eq.${companyId}` }, () => load(companyId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkpoint_scans', filter: `company_id=eq.${companyId}` }, () => load(companyId))
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [companyId])

  async function load(cid: string) {
    const { data } = await supabase
      .from('route_sessions')
      .select('id, status, completed_points, expected_points, scheduled_at, started_at, guards(user_profiles(full_name)), services(name)')
      .eq('company_id', cid)
      .gte('scheduled_at', new Date().toISOString().slice(0, 10))
      .order('scheduled_at')

    setRows(
      (data ?? []).map((r) => {
        const g = Array.isArray(r.guards) ? r.guards[0] : r.guards
        const p = g && Array.isArray(g.user_profiles) ? g.user_profiles[0] : g?.user_profiles
        const s = Array.isArray(r.services) ? r.services[0] : r.services
        return {
          session_id: r.id,
          guard_name: p?.full_name ?? 'Vigilante',
          service_name: s?.name ?? 'Servicio',
          status: r.status,
          completed: r.completed_points,
          expected: r.expected_points,
          scheduled_at: r.scheduled_at,
          started_at: r.started_at,
        }
      }),
    )
    setLoading(false)
  }

  function statusInfo(status: string) {
    switch (status) {
      case 'in_progress': return { dot: 'ok status-dot--live', label: 'En ronda', tone: 'ok' as const }
      case 'completed': return { dot: 'ok', label: 'Completada', tone: 'ok' as const }
      case 'incomplete': return { dot: 'danger', label: 'Incompleta', tone: 'danger' as const }
      case 'scheduled': return { dot: 'idle', label: 'Programada', tone: 'idle' as const }
      default: return { dot: 'idle', label: status, tone: 'idle' as const }
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-lg font-semibold text-ink-50">Centro de Operaciones</h1>
      <p className="mt-1 text-sm text-ink-400">Rondas de hoy en los servicios que supervisas.</p>

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-ink-400">Cargando…</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={<IconUsers width={32} height={32} />} title="Sin rondas programadas hoy" />
        ) : (
          <Card>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink-800 text-xs uppercase tracking-wide text-ink-500">
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium">Vigilante</th>
                  <th className="px-5 py-3 font-medium">Servicio</th>
                  <th className="px-5 py-3 font-medium">Progreso</th>
                  <th className="px-5 py-3 font-medium">Programada</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const info = statusInfo(r.status)
                  return (
                    <tr key={r.session_id} className="border-b border-ink-800 last:border-0">
                      <td className="px-5 py-3">
                        <span className={`status-dot status-dot--${info.dot}`} />
                      </td>
                      <td className="px-5 py-3 font-medium text-ink-50">{r.guard_name}</td>
                      <td className="px-5 py-3 text-ink-300">{r.service_name}</td>
                      <td className="px-5 py-3">
                        <Badge tone={info.tone}>{info.label} · {r.completed}/{r.expected}</Badge>
                      </td>
                      <td className="px-5 py-3 text-ink-400">{new Date(r.scheduled_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  )
}
