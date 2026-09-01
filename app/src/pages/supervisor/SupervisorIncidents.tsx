import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import { useAuthStore } from '../../lib/stores/auth'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { IconAlert } from '../../components/ui/icons'
import { INCIDENT_TYPE_LABELS, PRIORITY_LABELS } from '../../lib/types/domain'
import type { Incident, IncidentPriority } from '../../lib/types/domain'

interface IncidentRow extends Incident {
  services: { name: string } | { name: string }[] | null
  guards: { user_profiles: { full_name: string } | { full_name: string }[] | null } | { user_profiles: { full_name: string } | { full_name: string }[] | null }[] | null
}

const priorityTone: Record<IncidentPriority, 'idle' | 'info' | 'warn' | 'danger'> = {
  low: 'idle', medium: 'info', high: 'warn', critical: 'danger',
}

export function SupervisorIncidents() {
  const companyId = useAuthStore((s) => s.profile?.company_id)
  const [incidents, setIncidents] = useState<IncidentRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!companyId) return
    void load(companyId)
    const channel = supabase
      .channel('supervisor-incidents')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents', filter: `company_id=eq.${companyId}` }, () => load(companyId))
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [companyId])

  async function load(cid: string) {
    const { data } = await supabase
      .from('incidents')
      .select('*, services(name), guards(user_profiles(full_name))')
      .eq('company_id', cid)
      .order('occurred_at', { ascending: false })
    setIncidents((data as IncidentRow[]) ?? [])
    setLoading(false)
  }

  async function validate(id: string) {
    const { data: userData } = await supabase.auth.getUser()
    await supabase.from('incidents').update({ status: 'reviewed', reviewed_by: userData.user?.id, reviewed_at: new Date().toISOString() }).eq('id', id)
  }

  function serviceName(i: IncidentRow) {
    return Array.isArray(i.services) ? i.services[0]?.name : i.services?.name
  }
  function guardName(i: IncidentRow) {
    const g = Array.isArray(i.guards) ? i.guards[0] : i.guards
    const up = g?.user_profiles
    const p = Array.isArray(up) ? up[0] : up
    return p?.full_name ?? '—'
  }

  return (
    <div className="p-8">
      <h1 className="text-lg font-semibold text-ink-50">Incidencias</h1>
      <p className="mt-1 text-sm text-ink-400">Valida las novedades reportadas por los vigilantes.</p>

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-ink-400">Cargando…</p>
        ) : incidents.length === 0 ? (
          <EmptyState icon={<IconAlert width={32} height={32} />} title="Sin novedades" />
        ) : (
          <div className="space-y-3">
            {incidents.map((i) => (
              <Card key={i.id} className="flex items-start justify-between gap-4 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-ink-50">{INCIDENT_TYPE_LABELS[i.incident_type]}</p>
                    <Badge tone={priorityTone[i.priority]}>{PRIORITY_LABELS[i.priority]}</Badge>
                    {i.status === 'reviewed' && <Badge tone="ok">Validada</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-ink-300">{i.description}</p>
                  <p className="mt-2 text-xs text-ink-500">{serviceName(i)} · {guardName(i)} · {new Date(i.occurred_at).toLocaleString('es-CO')}</p>
                </div>
                {i.status === 'open' && (
                  <button onClick={() => validate(i.id)} className="flex-shrink-0 rounded-lg bg-action-500 px-3 py-1.5 text-xs font-medium text-ink-950 hover:bg-action-400">Validar</button>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
