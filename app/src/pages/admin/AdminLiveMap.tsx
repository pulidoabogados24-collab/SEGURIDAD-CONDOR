import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../../lib/supabase/client'
import { useAuthStore } from '../../lib/stores/auth'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { IconMap } from '../../components/ui/icons'

interface LiveGuard {
  guardId: string
  guardName: string
  routeName: string
  sessionId: string
  points: { lat: number; lng: number; recorded_at: string }[]
}

const REFRESH_MS = 20_000

// Ícono por defecto de Leaflet: los assets no se resuelven bien con Vite si
// no se apunta explícitamente a los PNG servidos por el paquete.
const guardIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

/**
 * Mapa en vivo: por dónde va cada vigilante ahora mismo.
 *
 * Se arma a partir de guard_locations — el navegador del vigilante manda su
 * posición cada ~30s mientras tiene la ronda abierta en pantalla (ver
 * GuardRoute.tsx). Solo se muestran rondas en curso (status='in_progress')
 * de las últimas horas; no es un mapa histórico.
 *
 * Aviso real, no un defecto de esta pantalla: en iPhone la posición solo se
 * actualiza mientras el vigilante tiene la app abierta y la pantalla
 * encendida — es una restricción de Apple a las PWA, no de este código. En
 * Android normalmente sigue actualizando con la pantalla apagada.
 */
export function AdminLiveMap() {
  const companyId = useAuthStore((s) => s.profile?.company_id)
  const [guardsLive, setGuardsLive] = useState<LiveGuard[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!companyId) return
    void load(companyId)
    timerRef.current = setInterval(() => void load(companyId), REFRESH_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [companyId])

  async function load(cid: string) {
    const { data: sessions } = await supabase
      .from('route_sessions')
      .select('id, routes(name), guards(id, user_profiles(full_name))')
      .eq('company_id', cid)
      .eq('status', 'in_progress')

    const activeSessions = (sessions ?? []).map((s) => {
      const route = Array.isArray(s.routes) ? s.routes[0] : s.routes
      const g = Array.isArray(s.guards) ? s.guards[0] : s.guards
      const up = g && Array.isArray(g.user_profiles) ? g.user_profiles[0] : g?.user_profiles
      return {
        sessionId: s.id,
        guardId: g?.id ?? '',
        guardName: up?.full_name ?? 'Vigilante',
        routeName: route?.name ?? 'Ronda',
      }
    })

    if (activeSessions.length === 0) {
      setGuardsLive([])
      setLoading(false)
      return
    }

    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const { data: locations } = await supabase
      .from('guard_locations')
      .select('route_session_id, latitude, longitude, recorded_at')
      .in('route_session_id', activeSessions.map((s) => s.sessionId))
      .gte('recorded_at', since)
      .order('recorded_at', { ascending: true })

    const bySession = new Map<string, { lat: number; lng: number; recorded_at: string }[]>()
    for (const loc of locations ?? []) {
      if (!loc.route_session_id) continue
      const arr = bySession.get(loc.route_session_id) ?? []
      arr.push({ lat: loc.latitude, lng: loc.longitude, recorded_at: loc.recorded_at })
      bySession.set(loc.route_session_id, arr)
    }

    setGuardsLive(
      activeSessions
        .map((s) => ({ ...s, points: bySession.get(s.sessionId) ?? [] }))
        .filter((s) => s.points.length > 0),
    )
    setLoading(false)
  }

  // Centro de Villavicencio, Meta — donde opera la empresa. El mapa se
  // ancla aquí SIEMPRE que no haya ningún vigilante activo con ubicación
  // reciente, en vez de no mostrar ningún mapa (antes, sin nadie en
  // ronda, esta pantalla no renderizaba el <MapContainer> en absoluto y
  // solo mostraba un aviso de texto — parecía "el mapa no carga" cuando en
  // realidad es que no había nada que dibujar todavía).
  const VILLAVICENCIO: [number, number] = [4.142, -73.626]

  const center = useMemo<[number, number]>(() => {
    const withPoints = guardsLive.find((g) => g.points.length > 0)
    const last = withPoints?.points[withPoints.points.length - 1]
    return last ? [last.lat, last.lng] : VILLAVICENCIO
  }, [guardsLive])

  const zoom = guardsLive.length > 0 ? 15 : 13

  const withoutLocation = useMemo(() => guardsLive.filter((g) => g.points.length === 0).length, [guardsLive])

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink-50">Mapa en vivo</h2>
          <p className="mt-1 text-sm text-ink-400">
            Ubicación de los vigilantes con una ronda en curso ahora mismo. Se actualiza cada {REFRESH_MS / 1000}s.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-1 flex-col gap-4 lg:flex-row">
        <Card className="relative flex-1 overflow-hidden">
          {loading && (
            <div className="absolute inset-x-0 top-0 z-[1000] bg-ink-950/80 px-3 py-1.5 text-center text-xs text-ink-300">
              Cargando…
            </div>
          )}
          <MapContainer
            key={guardsLive.length === 0 ? 'idle' : 'live'}
            center={center}
            zoom={zoom}
            style={{ height: '100%', width: '100%', minHeight: 400 }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {guardsLive.map((g) => {
              const last = g.points[g.points.length - 1]
              return (
                <div key={g.sessionId}>
                  <Polyline positions={g.points.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#f59e0b', weight: 3 }} />
                  <Marker position={[last.lat, last.lng]} icon={guardIcon}>
                    <Popup>
                      <strong>{g.guardName}</strong>
                      <br />
                      {g.routeName}
                      <br />
                      Última posición: {new Date(last.recorded_at).toLocaleTimeString('es-CO')}
                    </Popup>
                  </Marker>
                </div>
              )
            })}
          </MapContainer>
        </Card>

        <Card className="w-full shrink-0 overflow-y-auto lg:w-72">
          {!loading && guardsLive.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<IconMap width={28} height={28} />}
                title="Sin vigilantes en ronda ahora"
                description="Cuando un vigilante inicie una ronda y comparta su ubicación, aparecerá aquí en tiempo real. Mientras tanto, el mapa queda centrado en Villavicencio."
              />
            </div>
          ) : (
            <>
              <div className="border-b border-ink-800 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  En ronda ({guardsLive.length})
                </p>
              </div>
              <div className="divide-y divide-ink-800">
                {guardsLive.map((g) => {
                  const last = g.points[g.points.length - 1]
                  const minutesAgo = Math.round((Date.now() - new Date(last.recorded_at).getTime()) / 60000)
                  return (
                    <button
                      key={g.sessionId}
                      onClick={() => setSelected(g.sessionId)}
                      className={`w-full px-4 py-3 text-left ${selected === g.sessionId ? 'bg-ink-800' : ''}`}
                    >
                      <p className="text-sm font-semibold text-ink-50">{g.guardName}</p>
                      <p className="text-xs text-ink-500">{g.routeName}</p>
                      <p className="mt-1 text-xs text-ink-400">
                        {minutesAgo <= 1 ? 'Actualizado ahora' : `Hace ${minutesAgo} min`}
                      </p>
                    </button>
                  )
                })}
              </div>
              {withoutLocation > 0 && (
                <p className="border-t border-ink-800 px-4 py-3 text-xs text-ink-500">
                  {withoutLocation} vigilante(s) en ronda sin ubicación reciente (pantalla apagada o sin permiso de GPS).
                </p>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
