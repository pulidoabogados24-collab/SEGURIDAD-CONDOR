import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase/client'
import { useAuthStore } from '../../lib/stores/auth'
import { Button } from '../../components/ui/Button'
import { IconChevronLeft, IconCamera } from '../../components/ui/icons'
import { enqueueEvent, savePhotoBlob } from '../../lib/offline/db'
import { runSync } from '../../lib/offline/sync'
import { INCIDENT_TYPE_LABELS, PRIORITY_LABELS } from '../../lib/types/domain'
import type { IncidentType, IncidentPriority } from '../../lib/types/domain'

export function GuardIncidentForm() {
  const { profile } = useAuthStore()
  const navigate = useNavigate()
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [type, setType] = useState<IncidentType>('other')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<IncidentPriority>('low')
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!profile) return
    supabase.from('guards').select('default_service_id').eq('id', profile.id).single().then(({ data }) => {
      setServiceId(data?.default_service_id ?? null)
    })
  }, [profile])

  async function submit() {
    if (!profile || !serviceId || !description.trim()) return
    setSaving(true)
    const occurredAt = new Date().toISOString()
    const clientEventId = crypto.randomUUID()

    const coordsHolder: { value: GeolocationCoordinates | null } = { value: null }
    await new Promise<void>((resolve) => {
      navigator.geolocation?.getCurrentPosition((p) => { coordsHolder.value = p.coords; resolve() }, () => resolve(), { timeout: 5000 })
    })
    const coords = coordsHolder.value

    try {
      if (navigator.onLine) {
        const { data, error } = await supabase.rpc('create_incident', {
          p_client_event_id: clientEventId,
          p_service_id: serviceId,
          p_route_session_id: undefined,
          p_route_point_id: undefined,
          p_incident_type: type,
          p_description: description,
          p_priority: priority,
          p_latitude: coords?.latitude ?? undefined,
          p_longitude: coords?.longitude ?? undefined,
          p_occurred_at: occurredAt,
          p_was_offline: false,
        })
        if (error) throw error
        if (photo && data && profile.company_id) {
          await savePhotoBlob(clientEventId, photo, { taken_at: occurredAt })
          await runSync(profile.company_id, profile.id)
        }
      } else {
        await enqueueEvent('incident', {
          service_id: serviceId, incident_type: type, description, priority,
          latitude: coords?.latitude, longitude: coords?.longitude, occurred_at: occurredAt, was_offline: true,
        })
        if (photo) await savePhotoBlob(clientEventId, photo, { taken_at: occurredAt })
      }
      setSaved(true)
    } catch {
      alert('No se pudo guardar la novedad. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 bg-ink-950 px-5 text-center">
        <p className="text-lg font-bold text-ink-50">Novedad guardada</p>
        <p className="text-sm text-ink-400">{navigator.onLine ? 'Registrada correctamente.' : 'Se sincronizará cuando recuperes conexión.'}</p>
        <Button className="mt-4" onClick={() => navigate('/guard')}>Volver al inicio</Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-ink-950 px-5 pb-8 pt-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-ink-400">
        <IconChevronLeft width={16} height={16} /> Volver
      </button>
      <h1 className="mt-4 text-lg font-bold text-ink-50">Registrar novedad</h1>

      <div className="mt-5">
        <label className="text-xs font-semibold text-ink-500">Tipo de novedad</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(INCIDENT_TYPE_LABELS) as IncidentType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${type === t ? 'bg-action-400 text-ink-950' : 'bg-ink-800 text-ink-300 ring-1 ring-inset ring-ink-600'}`}
            >
              {INCIDENT_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <label className="text-xs font-semibold text-ink-500">Descripción</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Describe lo observado…"
          className="mt-2 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm text-ink-50 outline-none focus:border-action-400"
        />
      </div>

      <div className="mt-5">
        <label className="text-xs font-semibold text-ink-500">Prioridad</label>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {(Object.keys(PRIORITY_LABELS) as IncidentPriority[]).map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={`rounded-lg py-2 text-xs font-bold ${
                priority === p
                  ? p === 'critical' ? 'bg-danger-500/20 text-danger-400 ring-1 ring-danger-400'
                  : p === 'high' ? 'bg-warn-500/20 text-warn-400 ring-1 ring-warn-400'
                  : 'bg-action-400 text-ink-950'
                  : 'bg-ink-800 text-ink-400 ring-1 ring-ink-600'
              }`}
            >
              {PRIORITY_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <label className="text-xs font-semibold text-ink-500">Evidencia fotográfica</label>
        <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-xl border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm text-ink-400">
          <IconCamera width={16} height={16} />
          {photo ? 'Foto adjunta ✓' : 'Tomar fotografía'}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        </label>
      </div>

      <Button size="lg" className="mt-8 w-full" onClick={submit} loading={saving} disabled={!description.trim() || !serviceId}>
        Guardar novedad
      </Button>
    </div>
  )
}
