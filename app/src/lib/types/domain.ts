// Tipos de dominio de la aplicación (alias legibles sobre los tipos
// generados de Supabase, más los tipos de eventos offline).
import type { Database } from '../supabase/database.types'

export type AppRole = Database['public']['Enums']['app_role']
export type ScanResult = Database['public']['Enums']['scan_result']
export type IncidentPriority = Database['public']['Enums']['incident_priority']
export type IncidentType = Database['public']['Enums']['incident_type']
export type AlertType = Database['public']['Enums']['alert_type']
export type RouteSessionStatus = Database['public']['Enums']['route_session_status']

export type UserProfile = Database['public']['Tables']['user_profiles']['Row']
export type Company = Database['public']['Tables']['companies']['Row']
export type Client = Database['public']['Tables']['clients']['Row']
export type ServiceRow = Database['public']['Tables']['services']['Row']
export type Guard = Database['public']['Tables']['guards']['Row']
export type Route = Database['public']['Tables']['routes']['Row']
export type RoutePoint = Database['public']['Tables']['route_points']['Row']
export type QrCode = Database['public']['Tables']['qr_codes']['Row']
export type RouteSession = Database['public']['Tables']['route_sessions']['Row']
export type CheckpointScan = Database['public']['Tables']['checkpoint_scans']['Row']
export type Incident = Database['public']['Tables']['incidents']['Row']
export type Alert = Database['public']['Tables']['alerts']['Row']
export type DailyLog = Database['public']['Tables']['daily_logs']['Row']
export type Shift = Database['public']['Tables']['shifts']['Row']

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Super Administrador',
  admin: 'Administrador',
  supervisor: 'Supervisor',
  guard: 'Vigilante',
  client: 'Cliente',
}

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  suspicious_person: 'Persona sospechosa',
  open_door: 'Puerta abierta',
  damage: 'Daño',
  lighting_failure: 'Falla de iluminación',
  suspicious_vehicle: 'Vehículo sospechoso',
  unauthorized_access: 'Acceso no autorizado',
  disturbance: 'Alteración del orden',
  emergency: 'Emergencia',
  physical_damage: 'Daño físico',
  other: 'Otro',
}

export const PRIORITY_LABELS: Record<IncidentPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  critical: 'Crítica',
}

export const SCAN_RESULT_LABELS: Record<ScanResult, string> = {
  ok: 'Correcto',
  out_of_sequence: 'Fuera de secuencia',
  location_mismatch: 'Ubicación fuera de rango',
  duplicate: 'Duplicado',
  invalid_qr: 'QR inválido',
  too_fast: 'Escaneo demasiado rápido',
}

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  route_delayed: 'Ronda atrasada',
  checkpoint_skipped: 'Punto omitido',
  guard_inactive: 'Vigilante sin actividad',
  suspicious_location: 'Ubicación sospechosa',
  critical_incident: 'Novedad crítica',
  route_incomplete: 'Ronda incompleta',
  qr_anomaly: 'Anomalía de QR',
}
