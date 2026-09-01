import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase/client'
import { useAuthStore } from '../../lib/stores/auth'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { IconClock, IconWifiOff, IconClipboard, IconLogout } from '../../components/ui/icons'
import { onSyncStateChange, runSync, type SyncState } from '../../lib/offline/sync'
import { countPending } from '../../lib/offline/db'

interface TodaySession {
  id: string
  scheduled_at: string
  status: string
  expected_points: number
  completed_points: number
  route: { name: string; scheduled_time: string } | null
  service: { name: string } | null
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export function GuardHome() {
  const { profile, signOut } = useAuthStore()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<TodaySession[]>([])
  const [loading, setLoading] = useState(true)
  const [sync, setSync] = useState<SyncState>({ syncing: false, pending: 0 })
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    if (!profile) return
    void load()

    const unsub = onSyncStateChange(setSync)
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    void countPending().then((n) => setSync((s) => ({ ...s, pending: n })))

    return () => {
      unsub()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [profile])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('route_sessions')
      .select('id, scheduled_at, status, expected_points, completed_points, routes(name, scheduled_time), services(name)')
      .eq('guard_id', profile!.id)
      .gte('scheduled_at', new Date().toISOString().slice(0, 10))
      .lt('scheduled_at', new Date(Date.now() + 86400000).toISOString().slice(0, 10))
      .order('scheduled_at')

    setSessions(
      (data ?? []).map((s) => ({
        id: s.id,
        scheduled_at: s.scheduled_at,
        status: s.status,
        expected_points: s.expected_points,
        completed_points: s.completed_points,
        route: Array.isArray(s.routes) ? s.routes[0] : s.routes,
        service: Array.isArray(s.services) ? s.services[0] : s.services,
      })),
    )
    setLoading(false)
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const active = sessions.find((s) => s.status === 'in_progress')
  const nextScheduled = sessions.find((s) => s.status === 'scheduled')

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-ink-950 px-5 pb-8 pt-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-ink-400">
            {greeting()}, <span className="font-semibold text-ink-100">{profile?.full_name.split(' ')[0]}</span>
          </p>
        </div>
        <button onClick={handleSignOut} className="text-ink-500 hover:text-danger-400">
          <IconLogout width={20} height={20} />
        </button>
      </div>

      {!online && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-action-500/10 px-3 py-2 text-xs font-medium text-action-400">
          <IconWifiOff width={14} height={14} />
          Sin conexión — tus registros se guardan y se sincronizan al recuperarla
        </div>
      )}
      {sync.pending > 0 && (
        <button
          onClick={() => profile?.company_id && runSync(profile.company_id, profile.id)}
          className="mt-2 flex items-center justify-between rounded-lg bg-ink-800 px-3 py-2 text-xs font-medium text-ink-300"
        >
          <span>{sync.syncing ? 'Sincronizando…' : `${sync.pending} evento(s) pendientes de sincronizar`}</span>
          {!sync.syncing && <span className="text-action-400">Reintentar</span>}
        </button>
      )}

      <div className="mt-8 flex-1">
        {loading ? (
          <p className="text-sm text-ink-400">Cargando tu turno…</p>
        ) : active ? (
          <div
            className="rounded-2xl border border-ink-600 bg-gradient-to-br from-ink-800 to-ink-900 p-5"
            onClick={() => navigate(`/guard/ronda/${active.id}`)}
          >
            <p className="text-xs font-bold uppercase tracking-wide text-action-400">Ronda en curso</p>
            <p className="mt-1.5 text-xl font-extrabold text-ink-50">{active.route?.name}</p>
            <p className="mt-1 text-sm text-ink-400">{active.service?.name}</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink-700">
              <div className="h-full rounded-full bg-ok-500" style={{ width: `${(active.completed_points / active.expected_points) * 100}%` }} />
            </div>
            <p className="mt-2 text-xs text-ink-400">{active.completed_points} / {active.expected_points} puntos</p>
            <Button className="mt-4 w-full" size="lg" onClick={() => navigate(`/guard/ronda/${active.id}`)}>
              Continuar ronda
            </Button>
          </div>
        ) : nextScheduled ? (
          <>
            <div className="rounded-2xl border border-ink-700 bg-ink-900 p-5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Servicio</p>
              <p className="mt-1 text-lg font-bold text-ink-50">{nextScheduled.service?.name}</p>
              <div className="mt-3 flex items-center gap-1.5 font-mono text-sm text-ink-300">
                <IconClock width={14} height={14} />
                {nextScheduled.route?.scheduled_time?.slice(0, 5)}
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-ink-600 bg-ink-900 p-5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-action-400">Próxima ronda</p>
              <p className="mt-1.5 text-xl font-extrabold text-ink-50">{nextScheduled.route?.name}</p>
              <p className="mt-1 text-sm text-ink-400">{nextScheduled.expected_points} puntos</p>
              <Button className="mt-5 w-full" size="lg" onClick={() => navigate(`/guard/ronda/${nextScheduled.id}`)}>
                Iniciar ronda
              </Button>
            </div>
          </>
        ) : (
          <EmptyState icon={<IconClipboard width={32} height={32} />} title="Sin rondas programadas" description="No tienes rondas asignadas para hoy. Contacta a tu supervisor si crees que esto es un error." />
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={() => navigate('/guard/novedad')}>Registrar novedad</Button>
        <Button variant="secondary" onClick={() => navigate('/guard/minuta')}>Minuta digital</Button>
      </div>
    </div>
  )
}
