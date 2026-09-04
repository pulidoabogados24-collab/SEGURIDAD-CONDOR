import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import { useAuthStore } from '../../lib/stores/auth'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { IconMap, IconClock, IconLocation } from '../../components/ui/icons'
import { SCAN_RESULT_LABELS } from '../../lib/types/domain'
import type { ScanResult } from '../../lib/types/domain'

interface SessionRow {
  id: string
  status: string
  scheduled_at: string
  started_at: string | null
  finished_at: string | null
  expected_points: number
  completed_points: number
  compliance_pct: number | null
  routeName: string
  guardName: string
}

interface ScanRow {
  id: string
  scanned_at: string
  result: ScanResult
  sequence_expected: number | null
  latitude: number | null
  longitude: number | null
  distance: number | null
  pointName: string
  guardName: string
}

const STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'danger' | 'idle' | 'info' }> = {
  completed: { label: 'Completada', tone: 'ok' },
  in_progress: { label: 'En curso', tone: 'info' },
  scheduled: { label: 'Programada', tone: 'idle' },
  missed: { label: 'No realizada', tone: 'danger' },
  incomplete: { label: 'Incompleta', tone: 'warn' },
}

/**
 * Rondas: el historial de lo que realmente ocurrió.
 *
 * Al abrir una ronda se ve punto por punto quién escaneó, a qué hora, con
 * qué resultado y a qué distancia del punto esperado. Eso es la evidencia
 * que se le entrega al cliente cuando pregunta si el vigilante pasó.
 */
export function AdminRounds() {
  const companyId = useAuthStore((s) => s.profile?.company_id)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [scans, setScans] = useState<Record<string, ScanRow[]>>({})

  useEffect(() => {
    if (companyId) void load(companyId)
  }, [companyId])

  async function load(cid: string) {
    setLoading(true)
    const { data } = await supabase
      .from('route_sessions')
      .select(
        'id, status, scheduled_at, started_at, finished_at, expected_points, completed_points, compliance_pct, routes(name), guards(user_profiles(full_name))',
      )
      .eq('company_id', cid)
      .order('scheduled_at', { ascending: false })
      .limit(100)

    setSessions(
      (data ?? []).map((s) => {
        const route = Array.isArray(s.routes) ? s.routes[0] : s.routes
        const g = Array.isArray(s.guards) ? s.guards[0] : s.guards
        const up = g?.user_profiles
        const prof = Array.isArray(up) ? up[0] : up
        return {
          id: s.id,
          status: s.status,
          scheduled_at: s.scheduled_at,
          started_at: s.started_at,
          finished_at: s.finished_at,
          expected_points: s.expected_points,
          completed_points: s.completed_points,
          compliance_pct: s.compliance_pct,
          routeName: route?.name ?? '—',
          guardName: prof?.full_name ?? 'Sin asignar',
        }
      }),
    )
    setLoading(false)
  }

  async function toggle(sessionId: string) {
    if (expanded === sessionId) {
      setExpanded(null)
      return
    }
    setExpanded(sessionId)
    if (scans[sessionId]) return

    const { data } = await supabase
      .from('checkpoint_scans')
      .select(
        'id, scanned_at, result, sequence_expected, latitude, longitude, distance_to_point_meters, route_points(name), guards(user_profiles(full_name))',
      )
      .eq('route_session_id', sessionId)
      .order('scanned_at')

    setScans((prev) => ({
      ...prev,
      [sessionId]: (data ?? []).map((s) => {
        const p = Array.isArray(s.route_points) ? s.route_points[0] : s.route_points
        const g = Array.isArray(s.guards) ? s.guards[0] : s.guards
        const up = g?.user_profiles
        const prof = Array.isArray(up) ? up[0] : up
        return {
          id: s.id,
          scanned_at: s.scanned_at,
          result: s.result as ScanResult,
          sequence_expected: s.sequence_expected,
          latitude: s.latitude,
          longitude: s.longitude,
          distance: s.distance_to_point_meters,
          pointName: p?.name ?? 'Punto desconocido',
          guardName: prof?.full_name ?? '—',
        }
      }),
    }))
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <h2 className="text-lg font-semibold text-ink-50">Rondas</h2>
      <p className="mt-1 text-sm text-ink-400">
        Historial de rondas. Abre una para ver punto por punto quién escaneó y a qué hora.
      </p>

      {loading ? (
        <p className="mt-8 text-sm text-ink-400">Cargando rondas…</p>
      ) : sessions.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<IconMap width={32} height={32} />}
            title="Todavía no hay rondas"
            description="Cuando se programe y ejecute la primera ronda, aparecerá aquí con todo su detalle."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {sessions.map((s) => {
            const st = STATUS[s.status] ?? { label: s.status, tone: 'idle' as const }
            const pct =
              s.compliance_pct ??
              (s.expected_points > 0 ? (s.completed_points / s.expected_points) * 100 : 0)
            const isOpen = expanded === s.id

            return (
              <Card key={s.id}>
                <button
                  onClick={() => void toggle(s.id)}
                  aria-expanded={isOpen}
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-4 text-left sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-ink-50">{s.routeName}</p>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-ink-500">
                      {s.guardName}
                    </p>
                  </div>

                  <div className="flex items-center gap-5">
                    <div className="text-right">
                      <p className="font-mono text-sm font-bold text-ink-50">
                        {s.completed_points}/{s.expected_points}
                      </p>
                      <p className="text-[11px] text-ink-500">puntos</p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-mono text-sm font-bold ${
                          pct >= 90 ? 'text-ok-400' : pct >= 70 ? 'text-warn-400' : 'text-danger-400'
                        }`}
                      >
                        {pct.toFixed(0)}%
                      </p>
                      <p className="text-[11px] text-ink-500">
                        {new Date(s.scheduled_at).toLocaleDateString('es-CO', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </p>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-ink-800 px-4 py-4 sm:px-5">
                    <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <Meta label="Programada" value={fmtTime(s.scheduled_at)} />
                      <Meta label="Inicio" value={s.started_at ? fmtTime(s.started_at) : '—'} />
                      <Meta label="Fin" value={s.finished_at ? fmtTime(s.finished_at) : '—'} />
                      <Meta
                        label="Duración"
                        value={
                          s.started_at && s.finished_at
                            ? `${Math.round(
                                (new Date(s.finished_at).getTime() -
                                  new Date(s.started_at).getTime()) /
                                  60000,
                              )} min`
                            : '—'
                        }
                      />
                    </div>

                    {!scans[s.id] ? (
                      <p className="text-sm text-ink-400">Cargando escaneos…</p>
                    ) : scans[s.id].length === 0 ? (
                      <p className="text-sm text-ink-400">
                        Esta ronda no registró ningún escaneo.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {scans[s.id].map((sc) => (
                          <li
                            key={sc.id}
                            className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-ink-950 px-3 py-2.5"
                          >
                            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-ink-800 font-mono text-[11px] font-bold text-action-400">
                              {sc.sequence_expected ?? '?'}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm text-ink-100">
                              {sc.pointName}
                            </span>
                            <span className="inline-flex items-center gap-1 font-mono text-xs text-ink-300">
                              <IconClock width={12} height={12} />
                              {new Date(sc.scanned_at).toLocaleTimeString('es-CO', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            <span className="text-xs text-ink-500">{sc.guardName}</span>
                            {sc.latitude != null && (
                              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-500">
                                <IconLocation width={11} height={11} />
                                {sc.distance != null ? `${sc.distance.toFixed(0)} m` : 'GPS'}
                              </span>
                            )}
                            <Badge tone={sc.result === 'ok' ? 'ok' : 'danger'}>
                              {SCAN_RESULT_LABELS[sc.result] ?? sc.result}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
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

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-0.5 font-mono text-sm text-ink-100">{value}</p>
    </div>
  )
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
