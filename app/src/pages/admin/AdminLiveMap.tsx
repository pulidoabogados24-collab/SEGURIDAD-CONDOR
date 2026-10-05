import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Popup, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../../lib/supabase/client'
import { useAuthStore } from '../../lib/stores/auth'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { IconMap } from '../../components/ui/icons'

interface Fix {
  lat: number
  lng: number
  at: number
  accuracy: number | null
}

interface LiveGuard {
  sessionId: string
  guardId: string
  guardName: string
  routeName: string
  expected: number
  completed: number
  startedAt: string | null
  fixes: Fix[]
}

interface MapPoint {
  id: string
  name: string
  lat: number
  lng: number
}

type Freshness = 'live' | 'delayed' | 'lost' | 'waiting'

// Villavicencio, Meta — donde opera la empresa.
const VILLAVICENCIO: [number, number] = [4.142, -73.626]
const TRAIL_LOOKBACK_MS = 2 * 60 * 60 * 1000
const MAX_FIXES_PER_GUARD = 400
const FALLBACK_POLL_MS = 60_000
const TICK_MS = 15_000
const DELAYED_AFTER_MS = 2 * 60_000
const LOST_AFTER_MS = 5 * 60_000

function freshnessOf(g: LiveGuard, now: number): Freshness {
  const last = g.fixes[g.fixes.length - 1]
  if (!last) return 'waiting'
  const age = now - last.at
  if (age <= DELAYED_AFTER_MS) return 'live'
  if (age <= LOST_AFTER_MS) return 'delayed'
  return 'lost'
}

const COLORS: Record<Freshness, string> = {
  live: '#22c55e',
  delayed: '#f59e0b',
  lost: '#ef4444',
  waiting: '#64748b',
}

function guardIcon(name: string, f: Freshness, selected: boolean) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  const size = selected ? 42 : 34
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${COLORS[f]};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;color:#0b0d10;font:700 ${selected ? 14 : 12}px system-ui,sans-serif">${initials}</div>`,
  })
}

function FlyTo({ target }: { target: { lat: number; lng: number; nonce: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 16), { duration: 0.8 })
  }, [target, map])
  return null
}

/** Encuadra el mapa una sola vez cuando llegan los primeros datos. */
function AutoFit({ coords }: { coords: [number, number][] }) {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (done.current || coords.length === 0) return
    done.current = true
    if (coords.length === 1) map.setView(coords[0], 16)
    else map.fitBounds(L.latLngBounds(coords), { padding: [40, 40], maxZoom: 17 })
  }, [coords, map])
  return null
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return 'ahora'
  const m = Math.round(s / 60)
  if (m < 60) return `hace ${m} min`
  return `hace ${Math.floor(m / 60)} h ${m % 60} min`
}

/**
 * Mapa en vivo: dónde está cada vigilante ahora mismo.
 *
 * Se actualiza al instante: cada posición que el vigilante envía (desde que
 * inicia la ronda) llega por Realtime sin recargar. Como respaldo, si algún
 * aviso se pierde, se vuelve a consultar cada minuto.
 *
 * Los puntos de control con ubicación aparecen como círculos: verde si algún
 * vigilante ya lo escaneó en su ronda actual, gris si aún falta.
 *
 * Límite real de iPhone: la ubicación solo se actualiza con la app abierta y
 * la pantalla encendida (restricción de Apple a las PWA). En Android suele
 * seguir con la pantalla apagada. Por eso hay estados «Sin señal».
 */
export function AdminLiveMap() {
  const companyId = useAuthStore((s) => s.profile?.company_id)
  const [guards, setGuards] = useState<LiveGuard[]>([])
  const [points, setPoints] = useState<MapPoint[]>([])
  const [scannedPointIds, setScannedPointIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [fly, setFly] = useState<{ lat: number; lng: number; nonce: number } | null>(null)
  const [now, setNow] = useState(Date.now())
  const [realtimeOk, setRealtimeOk] = useState(false)
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const knownSessions = useRef<Set<string>>(new Set())

  const load = useCallback(async (cid: string) => {
    const [{ data: sessions }, { data: pts }] = await Promise.all([
      supabase
        .from('route_sessions')
        .select('id, started_at, expected_points, completed_points, routes(name), guards(id, user_profiles(full_name))')
        .eq('company_id', cid)
        .eq('status', 'in_progress'),
      supabase
        .from('route_points')
        .select('id, name, latitude, longitude')
        .eq('company_id', cid)
        .eq('is_active', true)
        .not('latitude', 'is', null),
    ])

    setPoints(
      (pts ?? [])
        .filter((p) => p.latitude != null && p.longitude != null)
        .map((p) => ({ id: p.id, name: p.name, lat: p.latitude as number, lng: p.longitude as number })),
    )

    const active = (sessions ?? []).map((s) => {
      const route = Array.isArray(s.routes) ? s.routes[0] : s.routes
      const g = Array.isArray(s.guards) ? s.guards[0] : s.guards
      const up = g && Array.isArray(g.user_profiles) ? g.user_profiles[0] : g?.user_profiles
      return {
        sessionId: s.id,
        guardId: g?.id ?? '',
        guardName: up?.full_name ?? 'Vigilante',
        routeName: route?.name ?? 'Ronda',
        expected: s.expected_points,
        completed: s.completed_points,
        startedAt: s.started_at,
      }
    })
    knownSessions.current = new Set(active.map((a) => a.sessionId))

    if (active.length === 0) {
      setGuards([])
      setScannedPointIds(new Set())
      setLoading(false)
      return
    }

    const ids = active.map((a) => a.sessionId)
    const since = new Date(Date.now() - TRAIL_LOOKBACK_MS).toISOString()
    const [{ data: locs }, { data: scans }] = await Promise.all([
      supabase
        .from('guard_locations')
        .select('route_session_id, latitude, longitude, accuracy_meters, recorded_at')
        .in('route_session_id', ids)
        .gte('recorded_at', since)
        .order('recorded_at', { ascending: true })
        .limit(5000),
      supabase.from('checkpoint_scans').select('route_point_id').in('route_session_id', ids).eq('result', 'ok'),
    ])

    const bySession = new Map<string, Fix[]>()
    for (const l of locs ?? []) {
      if (!l.route_session_id) continue
      const arr = bySession.get(l.route_session_id) ?? []
      arr.push({ lat: l.latitude, lng: l.longitude, at: new Date(l.recorded_at).getTime(), accuracy: l.accuracy_meters })
      bySession.set(l.route_session_id, arr)
    }

    setGuards(active.map((a) => ({ ...a, fixes: (bySession.get(a.sessionId) ?? []).slice(-MAX_FIXES_PER_GUARD) })))
    setScannedPointIds(new Set((scans ?? []).map((s) => s.route_point_id).filter((x): x is string => !!x)))
    setLoading(false)
  }, [])

  // Recarga agrupada: varios avisos seguidos provocan una sola consulta.
  const scheduleReload = useCallback(
    (cid: string) => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current)
      reloadTimer.current = setTimeout(() => void load(cid), 600)
    },
    [load],
  )

  useEffect(() => {
    if (!companyId) return
    void load(companyId)

    const poll = setInterval(() => void load(companyId), FALLBACK_POLL_MS)
    const tick = setInterval(() => setNow(Date.now()), TICK_MS)

    const channel = supabase
      .channel(`live-map-${companyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'guard_locations', filter: `company_id=eq.${companyId}` },
        (payload) => {
          const l = payload.new as {
            route_session_id: string | null
            latitude: number
            longitude: number
            accuracy_meters: number | null
            recorded_at: string
          }
          if (!l.route_session_id || !knownSessions.current.has(l.route_session_id)) {
            scheduleReload(companyId) // ronda nueva que aún no conocemos
            return
          }
          const fix: Fix = { lat: l.latitude, lng: l.longitude, at: new Date(l.recorded_at).getTime(), accuracy: l.accuracy_meters }
          setGuards((prev) =>
            prev.map((g) => (g.sessionId === l.route_session_id ? { ...g, fixes: [...g.fixes, fix].slice(-MAX_FIXES_PER_GUARD) } : g)),
          )
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'route_sessions', filter: `company_id=eq.${companyId}` }, () =>
        scheduleReload(companyId),
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'checkpoint_scans', filter: `company_id=eq.${companyId}` }, () =>
        scheduleReload(companyId),
      )
      .subscribe((status) => setRealtimeOk(status === 'SUBSCRIBED'))

    return () => {
      clearInterval(poll)
      clearInterval(tick)
      if (reloadTimer.current) clearTimeout(reloadTimer.current)
      void supabase.removeChannel(channel)
    }
  }, [companyId, load, scheduleReload])

  const withFix = guards.filter((g) => g.fixes.length > 0)

  const initialCenter = useMemo<[number, number]>(() => {
    const last = withFix[0]?.fixes[withFix[0].fixes.length - 1]
    return last ? [last.lat, last.lng] : VILLAVICENCIO
    // Solo el centro inicial; después el mapa lo mueve el usuario o «fly».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fitCoords = useMemo<[number, number][]>(() => {
    const c: [number, number][] = withFix.map((g) => {
      const l = g.fixes[g.fixes.length - 1]
      return [l.lat, l.lng]
    })
    // Sin vigilantes con posición todavía, se encuadran los puntos de control.
    return c.length > 0 ? c : points.map((p) => [p.lat, p.lng] as [number, number])
  }, [withFix, points])

  function focusGuard(g: LiveGuard) {
    setSelected(g.sessionId)
    const last = g.fixes[g.fixes.length - 1]
    if (last) setFly({ lat: last.lat, lng: last.lng, nonce: Date.now() })
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col px-4 py-6 sm:px-6 lg:h-[calc(100vh-4rem)] lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink-50">Mapa en vivo</h2>
          <p className="mt-1 text-sm text-ink-400">
            Dónde está cada vigilante con una ronda en curso. La ubicación se comparte desde que inicia la ronda.
          </p>
        </div>
        <span className={`inline-flex items-center gap-2 text-xs ${realtimeOk ? 'text-ok-400' : 'text-ink-500'}`}>
          <span className={`h-2 w-2 rounded-full ${realtimeOk ? 'animate-pulse bg-ok-400' : 'bg-ink-600'}`} />
          {realtimeOk ? 'Tiempo real activo' : 'Conectando…'}
        </span>
      </div>

      <div className="mt-4 flex flex-1 flex-col gap-4 lg:min-h-0 lg:flex-row">
        <Card className="relative h-[55vh] min-h-[320px] overflow-hidden lg:h-auto lg:flex-1">
          {loading && (
            <div className="absolute inset-x-0 top-0 z-[1000] bg-ink-950/80 px-3 py-1.5 text-center text-xs text-ink-300">Cargando…</div>
          )}
          <MapContainer center={initialCenter} zoom={withFix.length > 0 ? 15 : 13} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FlyTo target={fly} />
            <AutoFit coords={fitCoords} />

            {points.map((p) => {
              const done = scannedPointIds.has(p.id)
              return (
                <CircleMarker
                  key={p.id}
                  center={[p.lat, p.lng]}
                  radius={6}
                  pathOptions={{ color: '#fff', weight: 1.5, fillColor: done ? '#22c55e' : '#94a3b8', fillOpacity: 0.9 }}
                >
                  <Popup>
                    <strong>{p.name}</strong>
                    <br />
                    {done ? 'Ya escaneado en una ronda en curso' : 'Pendiente'}
                  </Popup>
                </CircleMarker>
              )
            })}

            {withFix.map((g) => {
              const last = g.fixes[g.fixes.length - 1]
              const f = freshnessOf(g, now)
              return (
                <div key={g.sessionId}>
                  <Polyline positions={g.fixes.map((p) => [p.lat, p.lng])} pathOptions={{ color: COLORS[f], weight: 3, opacity: 0.7 }} />
                  <Marker
                    position={[last.lat, last.lng]}
                    icon={guardIcon(g.guardName, f, selected === g.sessionId)}
                    eventHandlers={{ click: () => setSelected(g.sessionId) }}
                  >
                    <Popup>
                      <strong>{g.guardName}</strong>
                      <br />
                      {g.routeName} · {g.completed}/{g.expected} puntos
                      <br />
                      Última posición: {ago(now - last.at)}
                    </Popup>
                  </Marker>
                </div>
              )
            })}
          </MapContainer>
        </Card>

        <Card className="w-full shrink-0 overflow-y-auto lg:w-80">
          {!loading && guards.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<IconMap width={28} height={28} />}
                title="Sin vigilantes en ronda ahora"
                description="Cuando un vigilante inicie su ronda aparecerá aquí en tiempo real, con su recorrido y los puntos que va escaneando."
              />
            </div>
          ) : (
            <>
              <div className="border-b border-ink-800 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">En ronda ({guards.length})</p>
              </div>
              <div className="divide-y divide-ink-800">
                {guards.map((g) => {
                  const last = g.fixes[g.fixes.length - 1]
                  const f = freshnessOf(g, now)
                  return (
                    <button
                      key={g.sessionId}
                      onClick={() => focusGuard(g)}
                      className={`w-full px-4 py-3 text-left ${selected === g.sessionId ? 'bg-ink-800' : 'hover:bg-ink-800/60'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-ink-50">{g.guardName}</p>
                        <Badge tone={f === 'live' ? 'ok' : f === 'delayed' ? 'warn' : f === 'lost' ? 'danger' : 'idle'}>
                          {f === 'live' ? 'En vivo' : f === 'delayed' ? 'Retraso' : f === 'lost' ? 'Sin señal' : 'Esperando'}
                        </Badge>
                      </div>
                      <p className="text-xs text-ink-500">
                        {g.routeName} · {g.completed}/{g.expected} puntos
                      </p>
                      <p className="mt-1 text-xs text-ink-400">
                        {last
                          ? `Última posición ${ago(now - last.at)}${last.accuracy ? ` · ±${Math.round(last.accuracy)} m` : ''}`
                          : 'Esperando la primera ubicación del celular…'}
                      </p>
                      {f === 'lost' && (
                        <p className="mt-1 text-[11px] text-ink-500">
                          Pantalla apagada, sin datos o sin permiso de GPS. Llámalo para confirmar.
                        </p>
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
