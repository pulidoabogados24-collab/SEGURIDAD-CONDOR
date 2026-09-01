import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import { useAuthStore } from '../../lib/stores/auth'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { IconAlert } from '../../components/ui/icons'
import { ALERT_TYPE_LABELS } from '../../lib/types/domain'
import type { Alert } from '../../lib/types/domain'

export function SupervisorAlerts() {
  const companyId = useAuthStore((s) => s.profile?.company_id)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!companyId) return
    void load(companyId)
    const channel = supabase
      .channel('supervisor-alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts', filter: `company_id=eq.${companyId}` }, () => load(companyId))
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [companyId])

  async function load(cid: string) {
    const { data } = await supabase.from('alerts').select('*').eq('company_id', cid).order('created_at', { ascending: false })
    setAlerts(data ?? [])
    setLoading(false)
  }

  async function acknowledge(id: string) {
    const { data: userData } = await supabase.auth.getUser()
    await supabase.from('alerts').update({ status: 'acknowledged', acknowledged_by: userData.user?.id, acknowledged_at: new Date().toISOString() }).eq('id', id)
  }

  async function resolve(id: string) {
    await supabase.from('alerts').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id)
  }

  return (
    <div className="p-8">
      <h1 className="text-lg font-semibold text-ink-50">Alertas</h1>
      <p className="mt-1 text-sm text-ink-400">Alertas automáticas del motor de cumplimiento.</p>

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-ink-400">Cargando…</p>
        ) : alerts.length === 0 ? (
          <EmptyState icon={<IconAlert width={32} height={32} />} title="Sin alertas" description="No se han generado alertas todavía." />
        ) : (
          <div className="space-y-3">
            {alerts.map((a) => (
              <Card key={a.id} className="flex items-start justify-between gap-4 p-4">
                <div className="flex items-start gap-3">
                  <span className={`status-dot mt-1.5 ${a.severity === 'critical' ? 'status-dot--danger' : a.severity === 'high' ? 'status-dot--warn' : 'status-dot--idle'}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-ink-50">{ALERT_TYPE_LABELS[a.alert_type]}</p>
                      <Badge tone={a.status === 'open' ? 'danger' : a.status === 'acknowledged' ? 'warn' : 'ok'}>{a.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-ink-300">{a.message}</p>
                    <p className="mt-1 text-xs text-ink-500">{new Date(a.created_at).toLocaleString('es-CO')}</p>
                  </div>
                </div>
                {a.status === 'open' && (
                  <div className="flex flex-shrink-0 gap-2">
                    <button onClick={() => acknowledge(a.id)} className="rounded-lg bg-ink-800 px-3 py-1.5 text-xs font-medium text-ink-200 ring-1 ring-inset ring-ink-600 hover:bg-ink-700">Reconocer</button>
                    <button onClick={() => resolve(a.id)} className="rounded-lg bg-action-500 px-3 py-1.5 text-xs font-medium text-ink-950 hover:bg-action-400">Resolver</button>
                  </div>
                )}
                {a.status === 'acknowledged' && (
                  <button onClick={() => resolve(a.id)} className="flex-shrink-0 rounded-lg bg-action-500 px-3 py-1.5 text-xs font-medium text-ink-950 hover:bg-action-400">Resolver</button>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
