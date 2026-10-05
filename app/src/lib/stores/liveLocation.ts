import { create } from 'zustand'

export type LiveLocationStatus = 'idle' | 'starting' | 'active' | 'denied' | 'unsupported'

interface LiveLocationState {
  status: LiveLocationStatus
  /** Ronda cuya ubicación se está compartiendo ahora mismo. */
  sessionId: string | null
  /** Hora (ms) del último envío exitoso al servidor. */
  lastSentAt: number | null
  accuracy: number | null
  set: (patch: Partial<Omit<LiveLocationState, 'set'>>) => void
}

export const useLiveLocation = create<LiveLocationState>((set) => ({
  status: 'idle',
  sessionId: null,
  lastSentAt: null,
  accuracy: null,
  set: (patch) => set(patch),
}))

/** Avisa al compartidor de ubicación que la ronda cambió (se inició o terminó). */
export function notifySessionChanged() {
  window.dispatchEvent(new Event('cg:session-changed'))
}
