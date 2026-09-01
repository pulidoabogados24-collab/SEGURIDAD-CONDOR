import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import { useAuthStore } from '../../lib/stores/auth'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { IconBuilding } from '../../components/ui/icons'

interface ClientRow {
  id: string
  name: string
  contact_name: string | null
  contact_phone: string | null
  is_active: boolean
  services: number
  points: number
  monthlyTotal: number
  sessions30: number
  completed30: number
}

/**
 * Clientes: quién contrata el servicio, cuánto vale su operación y cómo se
 * está cumpliendo. Es la vista que se lleva a una reunión con el cliente.
 */
export function AdminClients() {
  const companyId = useAuthStore((s) => s.profile?.company_id)
  const [rows, setRows] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (companyId) void load(companyId)
  }, [companyId])

  async function load(cid: string) {
    setLoading(true)
    const since = new Date(Date.now() - 30 * 864e5).toISOString()

    const [{ data: clients }, { data: services }, { data: points }, { data: sessions }] =
      await Promise.all([
        supabase.from('clients').select('*').eq('company_id', cid).order('name'),
        supabase.from('services').select('id, client_id').eq('company_id', cid),
        supabase.from('route_points').select('service_id, monthly_fee_cop').eq('company_id', cid).eq('is_active', true),
        supabase
          .from('route_sessions')
          .select('service_id, status')
          .eq('company_id', cid)
          .gte('scheduled_at', since),
      ])

    const serviceToClient = new Map((services ?? []).map((s) => [s.id, s.client_id]))

    const result: ClientRow[] = (clients ?? []).map((c) => {
      const own = (services ?? []).filter((s) => s.client_id === c.id).map((s) => s.id)
      const ownPoints = (points ?? []).filter((p) => own.includes(p.service_id))
      const ownSessions = (sessions ?? []).filter(
        (s) => s.service_id && serviceToClient.get(s.service_id) === c.id,
      )
      return {
        id: c.id,
        name: c.name,
        contact_name: c.contact_name,
        contact_phone: c.contact_phone,
        is_active: c.is_active,
        services: own.length,
        points: ownPoints.length,
        monthlyTotal: ownPoints.reduce((s, p) => s + (p.monthly_fee_cop ?? 0), 0),
        sessions30: ownSessions.length,
        completed30: ownSessions.filter((s) => s.status === 'completed').length,
      }
    })

    setRows(result)
    setLoading(false)
  }

  const totalCartera = rows.reduce((s, r) => s + r.monthlyTotal, 0)

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <h2 className="text-lg font-semibold text-ink-50">Clientes</h2>
      <p className="mt-1 text-sm text-ink-400">
        Establecimientos y conjuntos a los que se les presta el servicio de ronda.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Clientes" value={rows.length} />
        <Stat label="Puntos totales" value={rows.reduce((s, r) => s + r.points, 0)} />
        <Stat label="Rondas 30 días" value={rows.reduce((s, r) => s + r.sessions30, 0)} />
        <Stat label="Cartera mensual" value={formatCop(totalCartera)} />
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-ink-400">Cargando clientes…</p>
      ) : rows.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<IconBuilding width={32} height={32} />}
            title="Sin clientes registrados"
            description="Los clientes aparecerán aquí cuando se registren en el sistema."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {rows.map((c) => {
            const pct = c.sessions30 > 0 ? (c.completed30 / c.sessions30) * 100 : null
            return (
              <Card key={c.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-50">{c.name}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {c.contact_name ?? 'Sin contacto registrado'}
                      {c.contact_phone ? ` · ${c.contact_phone}` : ''}
                    </p>
                  </div>
                  <Badge tone={c.is_active ? 'ok' : 'idle'}>
                    {c.is_active ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Mini label="Servicios" value={c.services} />
                  <Mini label="Puntos de control" value={c.points} />
                  <Mini label="Valor mensual" value={formatCop(c.monthlyTotal)} />
                  <Mini
                    label="Cumplimiento 30 d"
                    value={pct === null ? 'Sin rondas' : `${pct.toFixed(0)}%`}
                    accent={pct !== null && pct >= 90}
                  />
                </div>

                {pct !== null && (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-800">
                    <div
                      className={pct >= 90 ? 'h-full bg-ok-500' : pct >= 70 ? 'h-full bg-warn-500' : 'h-full bg-danger-500'}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-1 font-mono text-lg font-bold text-ink-50">{value}</p>
    </Card>
  )
}

function Mini({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs text-ink-500">{label}</p>
      <p className={`mt-0.5 font-mono text-sm font-semibold ${accent ? 'text-ok-400' : 'text-ink-100'}`}>
        {value}
      </p>
    </div>
  )
}

function formatCop(value: number): string {
  return value.toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  })
}
