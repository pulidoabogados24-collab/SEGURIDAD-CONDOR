import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase/client'
import { useAuthStore } from '../../lib/stores/auth'
import { Card, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import {
  IconMap,
  IconQr,
  IconClock,
  IconAlert,
  IconCheck,
  IconLocation,
} from '../../components/ui/icons'
import { ALERT_TYPE_LABELS, SCAN_RESULT_LABELS } from '../../lib/types/domain'
import type { Alert, ScanResult } from '../../lib/types/domain'

interface Kpis {
  roundsToday: number
  roundsCompletedToday: number
  roundsCompletedYesterday: number
  scansToday: number
  scansYesterday: number
  minutesOnDutyToday: number
  incidentsToday: number
  incidentsYesterday: number
  complianceToday: number | null
  pointsTotal: number
  pointsScannedToday: number
}

interface ActivityRow {
  id: string
  guardName: string
  pointName: string
  serviceName: string
  scanned_at: string
  result: ScanResult
  distance: number | null
}

interface LiveRound {
  id: string
  guardName: string
  serviceName: string
  routeName: string
  completed: number
  expected: number
  status: string
}

/**
 * Panel de operación. Todo lo que muestra sale de la base de datos real y
 * se actualiza en vivo por Realtime: no hay una sola cifra fija en código.
 * Cuando no hay datos suficientes para una comparación, se dice — no se
 * inventa un porcentaje de variación.
 */
export function AdminDashboard() {
  const companyId = useAuthStore((s) => s.profile?.company_id)
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [activity, setActivity] = useState<ActivityRow[]>([])
  const [live, setLive] = useState<LiveRound[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])

  useEffect(() => {
    if (!companyId) return
    const cid = companyId
    void refresh(cid)

    const channel = supabase
      .channel('admin-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkpoint_scans', filter: `company_id=eq.${cid}` }, () => void refresh(cid))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'route_sessions', filter: `company_id=eq.${cid}` }, () => void refresh(cid))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts', filter: `company_id=eq.${cid}` }, () => void refresh(cid))
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [companyId])

  async function refresh(cid: string) {
    const startToday = startOfDay(0)
    const startYesterday = startOfDay(1)

    const [
      sessionsToday,
      sessionsYesterday,
      scansTodayRes,
      scansYesterdayRes,
      incidentsTodayRes,
      incidentsYesterdayRes,
      pointsRes,
      activityRes,
      liveRes,
      alertsRes,
    ] = await Promise.all([
      supabase.from('route_sessions').select('status, completed_points, expected_points, started_at, finished_at').eq('company_id', cid).gte('scheduled_at', startToday),
      supabase.from('route_sessions').select('status').eq('company_id', cid).gte('scheduled_at', startYesterday).lt('scheduled_at', startToday),
      supabase.from('checkpoint_scans').select('route_point_id').eq('company_id', cid).gte('scanned_at', startToday),
      supabase.from('checkpoint_scans').select('id', { count: 'exact', head: true }).eq('company_id', cid).gte('scanned_at', startYesterday).lt('scanned_at', startToday),
      supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('company_id', cid).gte('occurred_at', startToday),
      supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('company_id', cid).gte('occurred_at', startYesterday).lt('occurred_at', startToday),
      supabase.from('route_points').select('id', { count: 'exact', head: true }).eq('company_id', cid).eq('is_active', true),
      supabase.from('checkpoint_scans').select('id, scanned_at, result, distance_to_point_meters, route_points(name), guards(user_profiles(full_name))').eq('company_id', cid).order('scanned_at', { ascending: false }).limit(12),
      supabase.from('route_sessions').select('id, status, completed_points, expected_points, routes(name), services(name), guards(user_profiles(full_name))').eq('company_id', cid).eq('status', 'in_progress'),
      supabase.from('alerts').select('*').eq('company_id', cid).eq('status', 'open').order('created_at', { ascending: false }).limit(6),
    ])

    const today = sessionsToday.data ?? []
    const completedToday = today.filter((s) => s.status === 'completed').length
    const expected = today.reduce((s, r) => s + (r.expected_points ?? 0), 0)
    const done = today.reduce((s, r) => s + (r.completed_points ?? 0), 0)

    const minutes = today.reduce((acc, s) => {
      if (!s.started_at) return acc
      const end = s.finished_at ? new Date(s.finished_at).getTime() : Date.now()
      return acc + (end - new Date(s.started_at).getTime()) / 60000
    }, 0)

    setKpis({
      roundsToday: today.length,
      roundsCompletedToday: completedToday,
      roundsCompletedYesterday: (sessionsYesterday.data ?? []).filter((s) => s.status === 'completed').length,
      scansToday: (scansTodayRes.data ?? []).length,
      scansYesterday: scansYesterdayRes.count ?? 0,
      minutesOnDutyToday: Math.round(minutes),
      incidentsToday: incidentsTodayRes.count ?? 0,
      incidentsYesterday: incidentsYesterdayRes.count ?? 0,
      complianceToday: expected > 0 ? (done / expected) * 100 : null,
      pointsTotal: pointsRes.count ?? 0,
      pointsScannedToday: new Set((scansTodayRes.data ?? []).map((s) => s.route_point_id)).size,
    })

    setActivity(
      (activityRes.data ?? []).map((s) => {
        const p = Array.isArray(s.route_points) ? s.route_points[0] : s.route_points
        const g = Array.isArray(s.guards) ? s.guards[0] : s.guards
        const up = g?.user_profiles
        const prof = Array.isArray(up) ? up[0] : up
        return {
          id: s.id,
          guardName: prof?.full_name ?? '—',
          pointName: p?.name ?? '—',
          serviceName: '',
          scanned_at: s.scanned_at,
          result: s.result as ScanResult,
          distance: s.distance_to_point_meters,
        }
      }),
    )

    setLive(
      (liveRes.data ?? []).map((s) => {
        const route = Array.isArray(s.routes) ? s.routes[0] : s.routes
        const service = Array.isArray(s.services) ? s.services[0] : s.services
        const g = Array.isArray(s.guards) ? s.guards[0] : s.guards
        const up = g?.user_profiles
        const prof = Array.isArray(up) ? up[0] : up
        return {
          id: s.id,
          guardName: prof?.full_name ?? '—',
          serviceName: service?.name ?? '—',
          routeName: route?.name ?? '—',
          completed: s.completed_points,
          expected: s.expected_points,
          status: s.status,
        }
      }),
    )

    setAlerts((alertsRes.data ?? []) as Alert[])
  }

  if (!kpis) {
    return <p className="px-6 py-8 text-sm text-ink-400">Cargando panel…</p>
  }

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Indicadores */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={<IconMap width={18} height={18} />}
          tone="info"
          label="Rondas completadas"
          value={kpis.roundsCompletedToday}
          suffix={`de ${kpis.roundsToday} hoy`}
          delta={delta(kpis.roundsCompletedToday, kpis.roundsCompletedYesterday)}
        />
        <Kpi
          icon={<IconQr width={18} height={18} />}
          tone="ok"
          label="Puntos escaneados"
          value={kpis.scansToday}
          suffix={
            kpis.pointsTotal > 0
              ? `${kpis.pointsScannedToday} de ${kpis.pointsTotal} puntos`
              : `${kpis.pointsScannedToday} puntos distintos`
          }
          delta={delta(kpis.scansToday, kpis.scansYesterday)}
        />
        <Kpi
          icon={<IconClock width={18} height={18} />}
          tone="action"
          label="Tiempo en servicio"
          value={formatDuration(kpis.minutesOnDutyToday)}
          suffix="hoy"
        />
        <Kpi
          icon={<IconAlert width={18} height={18} />}
          tone="warn"
          label="Novedades"
          value={kpis.incidentsToday}
          suffix="hoy"
          delta={delta(kpis.incidentsToday, kpis.incidentsYesterday, true)}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Rondas en curso */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Rondas en curso"
            subtitle="Se actualiza solo cuando el vigilante escanea"
            action={
              <Link to="/admin/rondas" className="text-xs font-medium text-action-400 hover:underline">
                Ver todas
              </Link>
            }
          />
          {live.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<IconMap width={28} height={28} />}
                title="Ninguna ronda en curso"
                description="Cuando un vigilante inicie una ronda, su avance aparecerá aquí en tiempo real."
              />
            </div>
          ) : (
            <ul className="divide-y divide-ink-800">
              {live.map((r) => {
                const pct = r.expected > 0 ? (r.completed / r.expected) * 100 : 0
                return (
                  <li key={r.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink-50">{r.guardName}</p>
                        <p className="truncate text-xs text-ink-500">
                          {r.routeName} · {r.serviceName}
                        </p>
                      </div>
                      <span className="font-mono text-sm font-bold text-ink-100">
                        {r.completed}/{r.expected}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800">
                      <div className="h-full rounded-full bg-ok-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* Cumplimiento */}
        <Card>
          <CardHeader title="Cumplimiento de hoy" subtitle="Puntos verificados sobre esperados" />
          <div className="flex flex-col items-center gap-4 px-5 py-6">
            <ComplianceRing value={kpis.complianceToday} />
            <div className="w-full space-y-2 text-sm">
              <SummaryRow label="Rondas programadas" value={kpis.roundsToday} />
              <SummaryRow label="Rondas completadas" value={kpis.roundsCompletedToday} />
              <SummaryRow label="Escaneos registrados" value={kpis.scansToday} />
              <SummaryRow label="Novedades" value={kpis.incidentsToday} />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Actividad reciente */}
        <Card className="xl:col-span-2">
          <CardHeader title="Actividad reciente" subtitle="Últimos escaneos registrados" />
          {activity.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<IconQr width={28} height={28} />}
                title="Sin actividad todavía"
                description="Los escaneos aparecerán aquí en cuanto el vigilante marque el primer punto."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-ink-800 text-left text-xs text-ink-500">
                    <th className="px-5 py-2.5 font-medium">Vigilante</th>
                    <th className="px-5 py-2.5 font-medium">Punto</th>
                    <th className="px-5 py-2.5 font-medium">Hora</th>
                    <th className="px-5 py-2.5 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-800">
                  {activity.map((a) => (
                    <tr key={a.id}>
                      <td className="px-5 py-3 text-ink-100">{a.guardName}</td>
                      <td className="px-5 py-3 text-ink-300">
                        {a.pointName}
                        {a.distance != null && (
                          <span className="ml-2 inline-flex items-center gap-1 font-mono text-[11px] text-ink-500">
                            <IconLocation width={10} height={10} />
                            {a.distance.toFixed(0)} m
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-ink-300">
                        {new Date(a.scanned_at).toLocaleString('es-CO', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={a.result === 'ok' ? 'ok' : 'danger'}>
                          {a.result === 'ok' ? (
                            <>
                              <IconCheck width={12} height={12} /> Correcto
                            </>
                          ) : (
                            SCAN_RESULT_LABELS[a.result] ?? a.result
                          )}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Alertas */}
        <Card>
          <CardHeader
            title="Alertas abiertas"
            subtitle={alerts.length === 0 ? 'Todo en orden' : `${alerts.length} sin atender`}
          />
          {alerts.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<IconCheck width={28} height={28} />}
                title="Sin alertas abiertas"
                description="El motor de alertas revisa la operación cada 5 minutos."
              />
            </div>
          ) : (
            <ul className="divide-y divide-ink-800">
              {alerts.map((a) => (
                <li key={a.id} className="px-5 py-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-ink-100">
                      {ALERT_TYPE_LABELS[a.alert_type] ?? a.alert_type}
                    </p>
                    <Badge tone={a.severity === 'critical' || a.severity === 'high' ? 'danger' : 'warn'}>
                      {a.severity}
                    </Badge>
                  </div>
                  {a.message && <p className="mt-1 text-xs text-ink-400">{a.message}</p>}
                  <p className="mt-1 font-mono text-[11px] text-ink-600">
                    {new Date(a.created_at).toLocaleString('es-CO', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

/* ── piezas ─────────────────────────────────────────────────────────── */

function Kpi({
  icon,
  tone,
  label,
  value,
  suffix,
  delta: d,
}: {
  icon: React.ReactNode
  tone: 'ok' | 'warn' | 'danger' | 'info' | 'action'
  label: string
  value: string | number
  suffix?: string
  delta?: { pct: number; better: boolean } | null
}) {
  const toneBg: Record<string, string> = {
    ok: 'bg-ok-500/15 text-ok-400',
    warn: 'bg-warn-500/15 text-warn-400',
    danger: 'bg-danger-500/15 text-danger-400',
    info: 'bg-info-500/15 text-info-500',
    action: 'bg-action-500/15 text-action-400',
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneBg[tone]}`}>
          {icon}
        </div>
        {d && (
          <span
            className={`font-mono text-xs font-semibold ${d.better ? 'text-ok-400' : 'text-danger-400'}`}
          >
            {d.pct > 0 ? '↑' : d.pct < 0 ? '↓' : '='} {Math.abs(d.pct).toFixed(0)}%
          </span>
        )}
      </div>
      <p className="mt-3 font-mono text-2xl font-bold text-ink-50">{value}</p>
      <p className="mt-0.5 text-xs text-ink-400">{label}</p>
      {suffix && <p className="mt-0.5 text-[11px] text-ink-600">{suffix}</p>}
    </Card>
  )
}

function ComplianceRing({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <div className="flex h-36 w-36 flex-col items-center justify-center rounded-full border-4 border-dashed border-ink-700 text-center">
        <span className="text-xs text-ink-500">Sin rondas</span>
        <span className="text-xs text-ink-500">programadas hoy</span>
      </div>
    )
  }

  const r = 62
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  const stroke = pct >= 90 ? 'var(--color-ok-500, #22c55e)' : pct >= 70 ? '#eab308' : '#ef4444'

  return (
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 144 144" className="h-36 w-36 -rotate-90">
        <circle cx="72" cy="72" r={r} fill="none" stroke="currentColor" strokeWidth="12" className="text-ink-800" />
        <circle
          cx="72"
          cy="72"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-2xl font-bold text-ink-50">{pct.toFixed(0)}%</span>
        <span className="text-[11px] text-ink-500">cumplimiento</span>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-b border-ink-800 pb-1.5 last:border-0">
      <span className="text-xs text-ink-400">{label}</span>
      <span className="font-mono text-sm font-semibold text-ink-100">{value}</span>
    </div>
  )
}

/* ── utilidades ─────────────────────────────────────────────────────── */

function startOfDay(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/**
 * Variación frente a ayer. Devuelve null cuando ayer no hubo nada que
 * comparar: mostrar "↑ 100%" contra una base de cero es engañoso.
 */
function delta(today: number, yesterday: number, lowerIsBetter = false) {
  if (yesterday === 0) return null
  const pct = ((today - yesterday) / yesterday) * 100
  const better = lowerIsBetter ? pct <= 0 : pct >= 0
  return { pct, better }
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0h 00m'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}
