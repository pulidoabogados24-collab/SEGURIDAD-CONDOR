import { useEffect } from 'react'
import { supabase } from '../../lib/supabase/client'
import { useAuthStore } from '../../lib/stores/auth'
import { useLiveLocation } from '../../lib/stores/liveLocation'

// Cada cuánto se reenvía la última posición conocida aunque el vigilante esté
// quieto (el GPS del navegador no avisa cuando no hay movimiento). Con esto el
// mapa del supervisor sabe que el vigilante sigue conectado.
const HEARTBEAT_MS = 15_000
// Si la última posición tiene más de esto, no se reenvía: sería un dato viejo
// presentado como actual.
const MAX_FIX_AGE_MS = 5 * 60_000
// Respaldo por si se pierde un aviso en tiempo real.
const SESSION_POLL_MS = 30_000

/**
 * Comparte la ubicación del vigilante en vivo mientras tenga una ronda en curso.
 *
 * Vive montado en toda la app (no en una pantalla), así que:
 *  - empieza apenas la ronda pasa a «en curso», sin importar en qué pantalla
 *    esté el vigilante;
 *  - no se corta al navegar entre Ronda, Escanear y Novedad;
 *  - se detiene solo cuando la ronda termina.
 *
 * Limitación de iPhone: Safari/PWA corta el GPS al apagar la pantalla o salir
 * de la app. Para reducirlo se pide mantener la pantalla encendida (Wake Lock),
 * pero el sistema puede ignorarlo. En Android suele seguir en segundo plano.
 */
export function LiveLocationSharer() {
  const profile = useAuthStore((s) => s.profile)
  const guardId = profile?.role === 'guard' && profile.is_active ? profile.id : null
  const companyId = profile?.company_id ?? null

  useEffect(() => {
    if (!guardId || !companyId) return
    const store = useLiveLocation.getState()
    let disposed = false

    let sessionId: string | null = null
    let watchId: number | null = null
    let heartbeat: ReturnType<typeof setInterval> | null = null
    let wakeLock: { release: () => Promise<void> } | null = null
    let lastFix: { lat: number; lng: number; acc: number | null; at: number } | null = null

    async function send() {
      if (!sessionId || !lastFix || !navigator.onLine) return
      if (Date.now() - lastFix.at > MAX_FIX_AGE_MS) return
      const fix = lastFix
      const { error } = await supabase.from('guard_locations').insert({
        company_id: companyId!,
        guard_id: guardId!,
        route_session_id: sessionId,
        latitude: fix.lat,
        longitude: fix.lng,
        accuracy_meters: fix.acc,
      })
      if (!error && !disposed) store.set({ lastSentAt: Date.now(), accuracy: fix.acc })
    }

    async function acquireWakeLock() {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
        if (nav.wakeLock && document.visibilityState === 'visible') {
          wakeLock = await nav.wakeLock.request('screen')
        }
      } catch {
        /* sin permiso o no soportado: se sigue sin mantener la pantalla */
      }
    }

    function startSharing(id: string) {
      sessionId = id
      store.set({ sessionId: id, status: 'starting' })
      if (!navigator.geolocation) {
        store.set({ status: 'unsupported' })
        return
      }
      lastFix = null
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const first = lastFix === null
          lastFix = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, at: Date.now() }
          store.set({ status: 'active', accuracy: pos.coords.accuracy })
          if (first) void send() // la primera posición sale de inmediato
        },
        (err) => {
          store.set({ status: err.code === err.PERMISSION_DENIED ? 'denied' : 'unsupported' })
        },
        { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
      )
      heartbeat = setInterval(() => void send(), HEARTBEAT_MS)
      void acquireWakeLock()
    }

    function stopSharing() {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      if (heartbeat) clearInterval(heartbeat)
      watchId = null
      heartbeat = null
      lastFix = null
      sessionId = null
      void wakeLock?.release().catch(() => undefined)
      wakeLock = null
      store.set({ status: 'idle', sessionId: null, accuracy: null })
    }

    async function refresh() {
      const { data } = await supabase
        .from('route_sessions')
        .select('id')
        .eq('guard_id', guardId!)
        .eq('status', 'in_progress')
        .order('started_at', { ascending: false })
        .limit(1)
      if (disposed) return
      const current = data?.[0]?.id ?? null
      if (current === sessionId) return
      if (sessionId) stopSharing()
      if (current) startSharing(current)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && sessionId) {
        if (!wakeLock) void acquireWakeLock()
        void send()
      }
    }
    const onChanged = () => void refresh()

    void refresh()
    const poll = setInterval(() => void refresh(), SESSION_POLL_MS)
    window.addEventListener('cg:session-changed', onChanged)
    window.addEventListener('online', onChanged)
    document.addEventListener('visibilitychange', onVisibility)

    const channel = supabase
      .channel(`guard-session-${guardId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'route_sessions', filter: `guard_id=eq.${guardId}` },
        () => void refresh(),
      )
      .subscribe()

    return () => {
      disposed = true
      clearInterval(poll)
      window.removeEventListener('cg:session-changed', onChanged)
      window.removeEventListener('online', onChanged)
      document.removeEventListener('visibilitychange', onVisibility)
      void supabase.removeChannel(channel)
      stopSharing()
    }
  }, [guardId, companyId])

  return null
}
