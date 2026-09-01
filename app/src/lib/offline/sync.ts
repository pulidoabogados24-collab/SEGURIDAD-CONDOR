// ============================================================================
// Motor de sincronización: drena la cola de IndexedDB hacia Supabase.
//
// Reglas:
//  - Se ejecuta automáticamente al recuperar conexión (evento 'online') y
//    cada vez que se encola un nuevo evento mientras hay red.
//  - Nunca pierde datos: un evento solo se marca 'synced' después de una
//    respuesta exitosa del servidor. Si falla, queda 'failed' con contador
//    de intentos y se reintenta en el siguiente ciclo (no se descarta).
//  - Los eventos se envían en orden de creación (FIFO) para respetar la
//    secuencia esperada de puntos de control.
//  - Las fotos se suben a Storage DESPUÉS de confirmar el evento padre,
//    referenciando su id real (scan/incident) ya persistido.
// ============================================================================
import { supabase } from '../supabase/client'
import {
  getPendingEvents,
  getPhotosForEvent,
  markEventStatus,
  type QueuedEvent,
} from './db'

export type SyncListener = (state: SyncState) => void

export interface SyncState {
  syncing: boolean
  pending: number
  lastError?: string
  lastSyncedAt?: string
}

let listeners: SyncListener[] = []
let currentState: SyncState = { syncing: false, pending: 0 }
let syncInFlight = false

function emit() {
  listeners.forEach((l) => l(currentState))
}

export function onSyncStateChange(listener: SyncListener) {
  listeners.push(listener)
  listener(currentState)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

async function uploadEvidence(companyId: string, clientEventId: string, parent: { checkpoint_scan_id?: string; incident_id?: string; daily_log_id?: string }, uploadedBy: string) {
  const photos = await getPhotosForEvent(clientEventId)
  for (const photo of photos) {
    const ext = photo.mime_type.includes('png') ? 'png' : 'jpg'
    const path = `${companyId}/evidence/${photo.id}.${ext}`
    const { error: uploadErr } = await supabase.storage.from('evidence').upload(path, photo.blob, {
      contentType: photo.mime_type,
      upsert: false,
    })
    if (uploadErr && !uploadErr.message.includes('already exists')) {
      throw uploadErr
    }
    const { error: insertErr } = await supabase.from('evidence').insert({
      company_id: companyId,
      checkpoint_scan_id: parent.checkpoint_scan_id ?? null,
      incident_id: parent.incident_id ?? null,
      daily_log_id: parent.daily_log_id ?? null,
      uploaded_by: uploadedBy,
      storage_path: path,
      mime_type: photo.mime_type,
      taken_at: photo.taken_at,
      latitude: photo.latitude ?? null,
      longitude: photo.longitude ?? null,
    })
    if (insertErr) throw insertErr
  }
}

async function processEvent(event: QueuedEvent, companyId: string, userId: string) {
  if (event.type === 'scan') {
    const p = event.payload as {
      route_session_id: string
      qr_token: string
      scanned_at: string
      latitude?: number
      longitude?: number
      gps_accuracy?: number
      was_offline: boolean
    }
    const { data, error } = await supabase.rpc('register_checkpoint_scan', {
      p_client_event_id: event.client_event_id,
      p_route_session_id: p.route_session_id,
      p_qr_token: p.qr_token,
      p_scanned_at: p.scanned_at,
      p_latitude: p.latitude ?? undefined,
      p_longitude: p.longitude ?? undefined,
      p_gps_accuracy: p.gps_accuracy ?? undefined,
      p_was_offline: p.was_offline,
    })
    if (error) throw error
    if (data) {
      await uploadEvidence(companyId, event.client_event_id, { checkpoint_scan_id: data.id }, userId)
    }
    return
  }

  if (event.type === 'incident') {
    const p = event.payload as {
      service_id: string
      route_session_id?: string
      route_point_id?: string
      incident_type: string
      description: string
      priority: string
      latitude?: number
      longitude?: number
      occurred_at: string
      was_offline: boolean
    }
    const { data, error } = await supabase.rpc('create_incident', {
      p_client_event_id: event.client_event_id,
      p_service_id: p.service_id,
      p_route_session_id: p.route_session_id ?? undefined,
      p_route_point_id: p.route_point_id ?? undefined,
      p_incident_type: p.incident_type as never,
      p_description: p.description,
      p_priority: p.priority as never,
      p_latitude: p.latitude ?? undefined,
      p_longitude: p.longitude ?? undefined,
      p_occurred_at: p.occurred_at,
      p_was_offline: p.was_offline,
    })
    if (error) throw error
    if (data) {
      await uploadEvidence(companyId, event.client_event_id, { incident_id: data.id }, userId)
    }
    return
  }

  if (event.type === 'finish_session') {
    const p = event.payload as { route_session_id: string }
    const { error } = await supabase.rpc('finish_route_session', { p_route_session_id: p.route_session_id })
    if (error) throw error
    return
  }

  if (event.type === 'daily_log') {
    const p = event.payload as {
      service_id: string
      guard_id: string
      log_type: 'handover' | 'receipt'
      post_condition?: string
      items_received?: unknown
      observations?: string
      signed_by_name: string
    }
    const { data, error } = await supabase
      .from('daily_logs')
      .upsert(
        {
          service_id: p.service_id,
          guard_id: p.guard_id,
          log_type: p.log_type,
          post_condition: p.post_condition ?? null,
          items_received: (p.items_received as never) ?? [],
          observations: p.observations ?? null,
          signed_by_name: p.signed_by_name,
          company_id: companyId,
          client_event_id: event.client_event_id,
        },
        { onConflict: 'client_event_id' },
      )
      .select()
      .single()
    if (error) throw error
    if (data) {
      await uploadEvidence(companyId, event.client_event_id, { daily_log_id: data.id }, userId)
    }
    return
  }
}

export async function runSync(companyId: string, userId: string) {
  if (syncInFlight) return
  if (!navigator.onLine) return

  syncInFlight = true
  currentState = { ...currentState, syncing: true }
  emit()

  try {
    const pending = await getPendingEvents()
    currentState.pending = pending.length
    emit()

    for (const event of pending) {
      try {
        await markEventStatus(event.client_event_id, 'syncing')
        await processEvent(event, companyId, userId)
        await markEventStatus(event.client_event_id, 'synced')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido al sincronizar.'
        await markEventStatus(event.client_event_id, 'failed', message)
        currentState.lastError = message
        // Continuar con el siguiente evento: un fallo puntual no debe
        // bloquear la sincronización del resto de la cola.
      }
    }

    const remaining = await getPendingEvents()
    currentState = {
      syncing: false,
      pending: remaining.length,
      lastError: currentState.lastError,
      lastSyncedAt: new Date().toISOString(),
    }
    emit()
  } finally {
    syncInFlight = false
  }
}

export function initAutoSync(getContext: () => { companyId: string; userId: string } | null) {
  const trigger = () => {
    const ctx = getContext()
    if (ctx) void runSync(ctx.companyId, ctx.userId)
  }
  window.addEventListener('online', trigger)
  // Reintento periódico silencioso (por si 'online' no dispara en algunos
  // navegadores móviles al recuperar señal débil/datos móviles)
  const interval = setInterval(trigger, 30000)
  trigger()
  return () => {
    window.removeEventListener('online', trigger)
    clearInterval(interval)
  }
}
