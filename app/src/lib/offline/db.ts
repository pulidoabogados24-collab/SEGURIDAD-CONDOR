// ============================================================================
// IndexedDB: cola de sincronización offline del vigilante.
//
// Principio de diseño (ver ADR 0001): IndexedDB es un BUFFER TEMPORAL, nunca
// la base de datos principal. Cada evento se guarda aquí con un UUID
// generado en el cliente (client_event_id) que sirve de idempotencia en el
// servidor: aunque el mismo evento se reintente varias veces al sincronizar,
// el backend nunca lo duplica (UNIQUE constraint en la tabla + función
// register_checkpoint_scan que devuelve el registro existente si el
// client_event_id ya existe).
//
// Tipos de evento en cola: 'scan' (paso por punto de control), 'incident'
// (novedad), 'daily_log' (minuta), cada uno con sus fotos asociadas como
// Blob en un object store separado.
// ============================================================================
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export type QueuedEventType = 'scan' | 'incident' | 'daily_log' | 'finish_session'

export interface QueuedEvent {
  client_event_id: string // clave primaria, generada con crypto.randomUUID()
  type: QueuedEventType
  payload: Record<string, unknown>
  created_at: string
  attempts: number
  last_error?: string
  status: 'pending' | 'syncing' | 'synced' | 'failed'
  synced_at?: string
}

export interface QueuedPhoto {
  id: string // uuid, referenciado desde el payload del evento como photo_ref
  client_event_id: string
  blob: Blob
  mime_type: string
  taken_at: string
  latitude?: number
  longitude?: number
}

interface ControlGuardDB extends DBSchema {
  events: {
    key: string
    value: QueuedEvent
    indexes: { 'by-status': string }
  }
  photos: {
    key: string
    value: QueuedPhoto
    indexes: { 'by-event': string }
  }
  route_cache: {
    key: string
    value: Record<string, unknown>
  }
}

let dbPromise: Promise<IDBPDatabase<ControlGuardDB>> | null = null

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<ControlGuardDB>('controlguard-offline', 1, {
      upgrade(db) {
        const events = db.createObjectStore('events', { keyPath: 'client_event_id' })
        events.createIndex('by-status', 'status')

        const photos = db.createObjectStore('photos', { keyPath: 'id' })
        photos.createIndex('by-event', 'client_event_id')

        db.createObjectStore('route_cache')
      },
    })
  }
  return dbPromise
}

export async function enqueueEvent(type: QueuedEventType, payload: Record<string, unknown>): Promise<string> {
  const client_event_id = crypto.randomUUID()
  const db = await getDb()
  await db.put('events', {
    client_event_id,
    type,
    payload,
    created_at: new Date().toISOString(),
    attempts: 0,
    status: 'pending',
  })
  return client_event_id
}

export async function savePhotoBlob(
  clientEventId: string,
  blob: Blob,
  meta: { taken_at: string; latitude?: number; longitude?: number },
): Promise<string> {
  const db = await getDb()
  const id = crypto.randomUUID()
  await db.put('photos', {
    id,
    client_event_id: clientEventId,
    blob,
    mime_type: blob.type || 'image/jpeg',
    taken_at: meta.taken_at,
    latitude: meta.latitude,
    longitude: meta.longitude,
  })
  return id
}

export async function getPendingEvents(): Promise<QueuedEvent[]> {
  const db = await getDb()
  const all = await db.getAllFromIndex('events', 'by-status', 'pending')
  const failed = await db.getAllFromIndex('events', 'by-status', 'failed')
  return [...all, ...failed].sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function getPhotosForEvent(clientEventId: string): Promise<QueuedPhoto[]> {
  const db = await getDb()
  return db.getAllFromIndex('photos', 'by-event', clientEventId)
}

export async function markEventStatus(
  clientEventId: string,
  status: QueuedEvent['status'],
  error?: string,
) {
  const db = await getDb()
  const event = await db.get('events', clientEventId)
  if (!event) return
  event.status = status
  if (status === 'synced') event.synced_at = new Date().toISOString()
  if (status === 'failed') {
    event.attempts += 1
    event.last_error = error
  }
  await db.put('events', event)
}

export async function countPending(): Promise<number> {
  const db = await getDb()
  const pending = await db.countFromIndex('events', 'by-status', 'pending')
  const failed = await db.countFromIndex('events', 'by-status', 'failed')
  return pending + failed
}

export async function cacheRouteData(key: string, data: Record<string, unknown>) {
  const db = await getDb()
  await db.put('route_cache', data, key)
}

export async function getCachedRouteData(key: string): Promise<Record<string, unknown> | undefined> {
  const db = await getDb()
  return db.get('route_cache', key)
}
