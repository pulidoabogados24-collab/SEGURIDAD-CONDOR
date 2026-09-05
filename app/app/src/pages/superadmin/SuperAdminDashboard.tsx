import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import { Card } from '../../components/ui/Card'

interface Metrics {
  companies: number
  activeCompanies: number
  guards: number
  servicesActive: number
  routesToday: number
  mrr: number
}

export function SuperAdminDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void loadMetrics()
  }, [])

  async function loadMetrics() {
    setLoading(true)
    const [companies, guards, services, sessions, subs] = await Promise.all([
      supabase.from('companies').select('id, is_active', { count: 'exact' }),
      supabase.from('guards').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('services').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase
        .from('route_sessions')
        .select('id', { count: 'exact', head: true })
        .gte('scheduled_at', new Date().toISOString().slice(0, 10)),
      supabase.from('subscriptions').select('plan_id, status, plans(price_cop_month)').eq('status', 'active'),
    ])

    const activeCompanies = companies.data?.filter((c) => c.is_active).length ?? 0
    const mrr = (subs.data ?? []).reduce((sum: number, s: { plans: { price_cop_month: number } | { price_cop_month: number }[] | null }) => {
      const plan = Array.isArray(s.plans) ? s.plans[0] : s.plans
      return sum + (plan?.price_cop_month ?? 0)
    }, 0)

    setMetrics({
      companies: companies.count ?? 0,
      activeCompanies,
      guards: guards.count ?? 0,
      servicesActive: services.count ?? 0,
      routesToday: sessions.count ?? 0,
      mrr,
    })
    setLoading(false)
  }

  return (
    <div className="p-8">
      <h1 className="text-lg font-semibold text-ink-50">Panel SaaS</h1>
      <p className="mt-1 text-sm text-ink-400">Métricas globales de la plataforma Seguridad Cóndor.</p>

      {loading ? (
        <div className="mt-8 text-sm text-ink-400">Cargando métricas…</div>
      ) : metrics ? (
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard label="Empresas activas" value={metrics.activeCompanies} total={metrics.companies} />
          <MetricCard label="Vigilantes activos" value={metrics.guards} />
          <MetricCard label="Servicios activos" value={metrics.servicesActive} />
          <MetricCard label="Rondas programadas hoy" value={metrics.routesToday} />
          <MetricCard
            label="MRR estimado"
            value={new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
              metrics.mrr,
            )}
          />
        </div>
      ) : null}
    </div>
  )
}

function MetricCard({ label, value, total }: { label: string; value: number | string; total?: number }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-ink-50">
        {value}
        {total !== undefined && <span className="text-base font-normal text-ink-500"> / {total}</span>}
      </p>
    </Card>
  )
}
