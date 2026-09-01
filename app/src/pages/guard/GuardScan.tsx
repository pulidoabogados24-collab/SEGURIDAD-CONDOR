import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BrowserQRCodeReader } from '@zxing/browser'
import { supabase } from '../../lib/supabase/client'
import { useAuthStore } from '../../lib/stores/auth'
import { Button } from '../../components/ui/Button'
import { IconChevronLeft, IconCheck, IconCamera } from '../../components/ui/icons'
import { enqueueEvent, savePhotoBlob } from '../../lib/offline/db'
import { runSync } from '../../lib/offline/sync'
import { SCAN_RESULT_LABELS } from '../../lib/types/domain'
import type { ScanResult } from '../../lib/types/domain'

type Phase = 'scanning' | 'processing' | 'result' | 'camera_error'

interface ScanOutcome {
  ok: boolean
  message: string
  pointName?: string
  time?: string
  result?: ScanResult
}

export function GuardScan() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { profile } = useAuthStore()
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserQRCodeReader | null>(null)
  const [phase, setPhase] = useState<Phase>('scanning')
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null)
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [coords, setCoords] = useState<GeolocationCoordinates | null>(null)

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setCoords(pos.coords),
      () => setCoords(null),
      { enableHighAccuracy: true, timeout: 8000 },
    )

    readerRef.current = new BrowserQRCodeReader()
    let stop: (() => void) | undefined

    readerRef.current
      .decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (result && phase === 'scanning') {
          void handleDetected(result.getText())
        }
      })
      .then((controls) => {
        stop = () => controls.stop()
      })
      .catch(() => setPhase('camera_error'))

    return () => stop?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleDetected(text: string) {
    if (phase !== 'scanning' || !sessionId || !profile) return
    setPhase('processing')

    const scannedAt = new Date().toISOString()
    const clientEventId = crypto.randomUUID()

    try {
      // Validar formato UUID básico antes de intentar procesar
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)
      if (!isUuid) {
        setOutcome({ ok: false, message: 'Este código QR no pertenece a ControlGuard.' })
        setPhase('result')
        return
      }

      if (navigator.onLine) {
        const { data, error } = await supabase.rpc('register_checkpoint_scan', {
          p_client_event_id: clientEventId,
          p_route_session_id: sessionId,
          p_qr_token: text,
          p_scanned_at: scannedAt,
          p_latitude: coords?.latitude ?? undefined,
          p_longitude: coords?.longitude ?? undefined,
          p_gps_accuracy: coords?.accuracy ?? undefined,
          p_was_offline: false,
        })
        if (error) throw error

        if (photo && data) {
          await savePhotoBlob(clientEventId, photo, { taken_at: scannedAt, latitude: coords?.latitude, longitude: coords?.longitude })
          if (profile.company_id) await runSync(profile.company_id, profile.id)
        }

        const { data: point } = await supabase.from('route_points').select('name').eq('id', data.route_point_id).single()

        setOutcome({
          ok: data.result === 'ok',
          message: data.result === 'ok' ? 'Punto verificado correctamente.' : SCAN_RESULT_LABELS[data.result as ScanResult],
          pointName: point?.name,
          time: new Date(data.scanned_at).toLocaleTimeString('es-CO'),
          result: data.result as ScanResult,
        })
      } else {
        await enqueueEvent('scan', {
          route_session_id: sessionId,
          qr_token: text,
          scanned_at: scannedAt,
          latitude: coords?.latitude,
          longitude: coords?.longitude,
          gps_accuracy: coords?.accuracy,
          was_offline: true,
        })
        if (photo) {
          await savePhotoBlob(clientEventId, photo, { taken_at: scannedAt, latitude: coords?.latitude, longitude: coords?.longitude })
        }
        setOutcome({
          ok: true,
          message: 'Guardado sin conexión. Se sincronizará automáticamente.',
          time: new Date(scannedAt).toLocaleTimeString('es-CO'),
        })
      }
    } catch (e) {
      setOutcome({ ok: false, message: e instanceof Error ? e.message : 'No se pudo registrar el punto. Intenta de nuevo.' })
    } finally {
      setPhase('result')
    }
  }

  function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setPhoto(file)
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-ink-950 px-5 pb-8 pt-8">
      <button onClick={() => navigate(`/guard/ronda/${sessionId}`)} className="flex items-center gap-1 text-sm text-ink-400">
        <IconChevronLeft width={16} height={16} /> Volver
      </button>

      {phase === 'scanning' && (
        <>
          <div className="relative mt-4 flex-1 overflow-hidden rounded-2xl border border-ink-700 bg-black">
            <video ref={videoRef} className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-7 rounded-xl border-2 border-action-400/70" />
            <p className="absolute bottom-4 left-0 right-0 text-center text-xs text-white/70">Apunta al código QR del punto</p>
          </div>
          <label className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-ink-600 bg-ink-800 px-4 py-3 text-sm font-medium text-ink-200">
            <IconCamera width={16} height={16} />
            {photo ? 'Foto adjunta ✓' : 'Adjuntar fotografía (opcional)'}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoCapture} />
          </label>
        </>
      )}

      {phase === 'camera_error' && (
        <div className="mt-8 flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-ink-100">No pudimos acceder a la cámara.</p>
          <p className="text-sm text-ink-400">Revisa los permisos de cámara de tu navegador e inténtalo de nuevo.</p>
          <Button onClick={() => window.location.reload()}>Reintentar</Button>
        </div>
      )}

      {phase === 'processing' && (
        <div className="mt-8 flex flex-1 flex-col items-center justify-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-action-400 border-t-transparent" />
          <p className="text-sm text-ink-400">Verificando punto…</p>
        </div>
      )}

      {phase === 'result' && outcome && (
        <div className="mt-8 flex flex-1 flex-col">
          <div className={`mx-auto flex h-18 w-18 items-center justify-center rounded-full ${outcome.ok ? 'bg-ok-500/15 ring-2 ring-ok-400' : 'bg-danger-500/15 ring-2 ring-danger-400'}`} style={{ width: 72, height: 72 }}>
            <IconCheck width={34} height={34} className={outcome.ok ? 'text-ok-400' : 'text-danger-400'} />
          </div>
          <p className="mt-4 text-center text-lg font-extrabold text-ink-50">
            {outcome.ok ? 'Punto verificado' : 'No se pudo verificar'}
          </p>
          <p className="mt-1 text-center text-sm text-ink-400">{outcome.pointName ?? outcome.message}</p>

          {outcome.pointName && (
            <div className="mt-6 space-y-2 border-t border-ink-800 pt-4">
              <Row k="Hora" v={outcome.time ?? '—'} />
              <Row k="Ubicación" v={coords ? 'Verificada' : 'No disponible'} ok={!!coords} />
              <Row k="Estado" v={outcome.ok ? '✓ Correcto' : outcome.message} ok={outcome.ok} />
            </div>
          )}

          <div className="mt-auto space-y-2 pt-6">
            <Button size="lg" className="w-full" onClick={() => navigate(`/guard/ronda/${sessionId}`)}>Continuar</Button>
            {!outcome.ok && (
              <Button variant="ghost" className="w-full" onClick={() => { setOutcome(null); setPhase('scanning') }}>
                Intentar de nuevo
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ k, v, ok }: { k: string; v: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-ink-800 py-2.5">
      <span className="text-xs text-ink-500">{k}</span>
      <span className={`font-mono text-sm font-semibold ${ok ? 'text-ok-400' : 'text-ink-100'}`}>{v}</span>
    </div>
  )
}
