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

export function AdminIncidents() {
  const companyId = useAuthStore((s) => s.profile?.company_id)
  const [incidents, setIncidents] = useState<IncidentRow[]>([])
  const [filter, setFilter] = useState<'all' | 'open'>('open')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (companyId) void load(companyId)
  }, [companyId, filter])

  async function load(cid: string) {
    setLoading(true)
    let query = supabase
      .from('incidents')
      .select('*, services(name), guards(user_profiles(full_name))')
      .eq('company_id', cid)
      .order('occurred_at', { ascending: false })
    if (filter === 'open') query = query.eq('status', 'open')
    const { data } = await query
    setIncidents((data as IncidentRow[]) ?? [])
    setLoading(false)
  }

  async function markReviewed(id: string) {
    await supabase.from('incidents').update({ status: 'reviewed', reviewed_at: new Date().toISOString() }).eq('id', id)
    if (companyId) void load(companyId)
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink-50">Incidencias</h1>
          <p className="mt-1 text-sm text-ink-400">Novedades registradas por los vigilantes.</p>
        </div>
        <div className="flex gap-2 rounded-lg bg-ink-800 p-1">
          <button onClick={() => setFilter('open')} className={`rounded-md px-3 py-1.5 text-xs font-medium ${filter === 'open' ? 'bg-action-500 text-ink-950' : 'text-ink-300'}`}>Abiertas</button>
          <button onClick={() => setFilter('all')} className={`rounded-md px-3 py-1.5 text-xs font-medium ${filter === 'all' ? 'bg-action-500 text-ink-950' : 'text-ink-300'}`}>Todas</button>
        </div>
      </div>

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-ink-400">Cargando…</p>
        ) : incidents.length === 0 ? (
          <EmptyState icon={<IconAlert width={32} height={32} />} title="Sin incidencias" description="No hay novedades registradas en este filtro." />
        ) : (
          <div className="space-y-3">
            {incidents.map((i) => (
              <Card key={i.id} className="flex items-start justify-between gap-4 p-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-ink-50">{INCIDENT_TYPE_LABELS[i.incident_type]}</p>
                    <Badge tone={priorityTone[i.priority]}>{PRIORITY_LABELS[i.priority]}</Badge>
                    {i.status !== 'open' && <Badge tone="ok">Revisada</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-ink-300">{i.description}</p>
                  <p className="mt-2 text-xs text-ink-500">
                    {serviceName(i)} · {guardName(i)} · {new Date(i.occurred_at).toLocaleString('es-CO')}
                  </p>
                </div>
                {i.status === 'open' && (
                  <button onClick={() => markReviewed(i.id)} className="flex-shrink-0 rounded-lg bg-ink-800 px-3 py-1.5 text-xs font-medium text-ink-200 ring-1 ring-inset ring-ink-600 hover:bg-ink-700">
                    Marcar revisada
                  </button>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
