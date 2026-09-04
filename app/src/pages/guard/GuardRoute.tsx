import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase/client'
import { useAuthStore } from '../../lib/stores/auth'
import { Button } from '../../components/ui/Button'
import { IconChevronLeft, IconClock, IconLocation } from '../../components/ui/icons'
import { enqueueEvent } from '../../lib/offline/db'

// Cada cuánto se manda una posición al servidor mientras la pantalla de la
// ronda está abierta. No se manda en cada evento de watchPosition (el GPS
// puede disparar varias veces por segundo) — eso saturaría la base de datos
// sin ganar nada en precisión real para "ver por dónde va".
const LOCATION_PING_INTERVAL_MS = 30_000

interface SessionInfo {
  id: string
  status: string
  expected_points: number
  completed_points: number
  route_id: string
  route: { name: string } | null
}

interface PointInfo {
  id: string
  name: string
  sequence_order: number
  done: boolean
}

export function GuardRoute() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { profile } = useAuthStore()
  const navigate = useNavigate()
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [points, setPoints] = useState<PointInfo[]>([])
  const [lastScan, setLastScan] = useState<{ point_name: string; scanned_at: string } | null>(null)
  const [locationStatus, setLocationStatus] = useState<'active' | 'denied' | 'unsupported' | 'starting'>('starting')

  useEffect(() => {
    if (sessionId) void load(sessionId)
  }, [sessionId])

  // Comparte la ubicación en vivo mientras esta pantalla está abierta. En
  // iPhone (Safari/PWA) el sistema operativo corta el GPS en cuanto se
  // apaga la pantalla o se cambia de app — no hay forma de evitar eso desde
  // el código, es una restricción de Apple a las PWA. En Android normalmente
  // sí puede seguir en segundo plano. Por eso esto vive en un useEffect
  // ligado al ciclo de vida de la pantalla de la ronda, no a un "servicio"
  // aparte: technically no existe tal cosa en la web para iOS.
  useEffect(() => {
    const guardId = profile?.id
    const companyId = profile?.company_id
    if (!sessionId || !guardId || !companyId) return
    if (!navigator.geolocation) {
      setLocationStatus('unsupported')
      return
    }

    let lastSentAt = 0
    let cancelled = false

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (cancelled) return
        setLocationStatus('active')
        const now = Date.now()
        if (now - lastSentAt < LOCATION_PING_INTERVAL_MS) return
        lastSentAt = now
        void supabase.from('guard_locations').insert({
          company_id: companyId,
          guard_id: guardId,
          route_session_id: sessionId,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy_meters: pos.coords.accuracy,
        })
      },
      (err) => {
        if (cancelled) return
        setLocationStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unsupported')
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    )

    return () => {
      cancelled = true
      navigator.geolocation.clearWatch(watchId)
    }
  }, [sessionId, profile?.id, profile?.company_id])

  async function load(sid: string) {
    const { data: s } = await supabase
      .from('route_sessions')
      .select('id, status, expected_points, completed_points, route_id, routes(name)')
      .eq('id', sid)
      .single()

    if (!s) return

    setSession({
      id: s.id, status: s.status, expected_points: s.expected_points, completed_points: s.completed_points,
      route_id: s.route_id,
      route: Array.isArray(s.routes) ? s.routes[0] : s.routes,
    })

    const { data: p } = await supabase.from('route_points').select('id, name, sequence_order').eq('route_id', s.route_id).order('sequence_order')

    // Puntos ya registrados con éxito en ESTA sesión — ya no se exige orden,
    // así que "hecho" se calcula por escaneos reales, no por sequence_order.
    const { data: doneScans } = await supabase
      .from('checkpoint_scans')
      .select('route_point_id, scanned_at')
      .eq('route_session_id', sid)
      .eq('result', 'ok')
      .order('scanned_at', { ascending: false })

    const doneIds = new Set((doneScans ?? []).map((sc) => sc.route_point_id))
    setPoints((p ?? []).map((pt) => ({ ...pt, done: doneIds.has(pt.id) })))

    if (doneScans && doneScans.length > 0) {
      const last = doneScans[0]
      const point = (p ?? []).find((pt) => pt.id === last.route_point_id)
      setLastScan({ point_name: point?.name ?? '—', scanned_at: last.scanned_at })
    }
  }

  async function finishRoute() {
    if (!session || !profile) return
    if (session.completed_points < session.expected_points) {
      if (!confirm(`Vas a finalizar la ronda con ${session.completed_points} de ${session.expected_points} puntos. ¿Continuar?`)) return
    }
    if (navigator.onLine) {
      await supabase.rpc('finish_route_session', { p_route_session_id: session.id })
    } else {
      await enqueueEvent('finish_session', { route_session_id: session.id })
    }
    navigate('/guard')
  }

  if (!session) return <div className="flex min-h-screen items-center justify-center bg-ink-950 text-sm text-ink-400">Cargando ronda…</div>

  const pct = Math.round((session.completed_points / session.expected_points) * 100)
  const timeSince = lastScan ? Math.round((Date.now() - new Date(lastScan.scanned_at).getTime()) / 60000) : null

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-ink-950 px-5 pb-8 pt-8">
      <button onClick={() => navigate('/guard')} className="flex items-center gap-1 text-sm text-ink-400">
        <IconChevronLeft width={16} height={16} /> Inicio
      </button>

      <div className="mt-6">
        <p className="text-xs font-bold uppercase tracking-wide text-action-400">Ronda en curso</p>
        <h1 className="mt-1 text-2xl font-extrabold text-ink-50">{session.route?.name}</h1>
        {locationStatus === 'active' && (
          <p className="mt-1 flex items-center gap-1 text-xs text-ok-400">
            <IconLocation width={12} height={12} /> Compartiendo tu ubicación
          </p>
        )}
        {locationStatus === 'denied' && (
          <p className="mt-1 flex items-center gap-1 text-xs text-warn-400">
            <IconLocation width={12} height={12} /> Ubicación bloqueada — actívala en los permisos del navegador
          </p>
        )}
      </div>

      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-2xl font-bold text-ink-50">{session.completed_points} / {session.expected_points}</span>
          <span className="text-sm font-semibold text-ok-400">{pct}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-700">
          <div className="h-full rounded-full bg-ok-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {lastScan && (
        <div className="mt-5 flex items-center justify-between rounded-xl border border-ink-750 bg-ink-900 px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Último punto</p>
            <p className="text-sm font-semibold text-ink-100">{lastScan.point_name}</p>
          </div>
          <div className="flex items-center gap-1 font-mono text-sm text-action-400">
            <IconClock width={14} height={14} /> hace {timeSince} min
          </div>
        </div>
      )}

      <p className="mt-6 text-xs text-ink-500">Toca el punto que vas a escanear ahora — puedes hacerlos en cualquier orden.</p>

      <div className="mt-2 flex-1 space-y-2 overflow-y-auto">
        {points.map((p) => (
          <button
            key={p.id}
            disabled={p.done}
            onClick={() => navigate(`/guard/ronda/${session.id}/escanear`)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${p.done ? 'bg-ok-500/10' : 'bg-ink-900 active:bg-ink-800'}`}
          >
            <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${p.done ? 'bg-ok-500 text-ink-950' : 'bg-ink-700 text-ink-400'}`}>
              {p.done ? '✓' : p.sequence_order}
            </div>
            <span className={`text-sm ${p.done ? 'text-ink-300 line-through' : 'text-ink-100'}`}>{p.name}</span>
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-2">
        <Button size="lg" className="w-full" onClick={() => navigate(`/guard/ronda/${session.id}/escanear`)} disabled={session.completed_points >= session.expected_points}>
          Escanear punto
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => navigate('/guard/novedad')}>Registrar novedad</Button>
        <Button variant="ghost" className="w-full text-danger-400" onClick={finishRoute}>Finalizar ronda</Button>
      </div>
    </div>
  )
}
