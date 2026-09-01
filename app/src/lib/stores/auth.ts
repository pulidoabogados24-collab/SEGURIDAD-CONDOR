import { create, type StoreApi } from 'zustand'
import { supabase } from '../supabase/client'
import type { UserProfile } from '../types/domain'

interface AuthState {
  loading: boolean
  userId: string | null
  profile: UserProfile | null
  error: string | null
  init: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

let authListenerRegistered = false

async function loadProfileFor(uid: string, set: StoreApi<AuthState>['setState']) {
  const { data: profile, error } = await supabase.from('user_profiles').select('*').eq('id', uid).single()
  if (error) {
    set({ loading: false, userId: uid, profile: null, error: 'No se pudo cargar tu perfil. Contacta al administrador.' })
    return
  }
  set({ loading: false, userId: uid, profile, error: null })
}

export const useAuthStore = create<AuthState>((set) => ({
  loading: true,
  userId: null,
  profile: null,
  error: null,

  // init() se llama una vez al montar <App>. Registra el listener de
  // onAuthStateChange de forma INCONDICIONAL (antes vivía dentro del
  // branch "hay sesión", así que en una carga fresca sin sesión el
  // listener nunca se registraba: un login exitoso posterior actualizaba
  // Supabase pero nada avisaba a la UI, dejando el botón de "Iniciar
  // sesión" aparentemente sin efecto). onAuthStateChange dispara también
  // con el estado inicial (evento INITIAL_SESSION) apenas se suscribe,
  // así que es la única fuente de verdad: cubre carga inicial, login,
  // logout y expiración/refresco de sesión en una sola ruta de código.
  init: async () => {
    set({ loading: true })

    if (!authListenerRegistered) {
      authListenerRegistered = true
      supabase.auth.onAuthStateChange((_event, session) => {
        const uid = session?.user.id ?? null
        if (!uid) {
          set({ loading: false, userId: null, profile: null })
          return
        }
        // No podemos usar await dentro del propio callback de onAuthStateChange
        // (Supabase lo desaconseja porque puede deadlockear con la promesa
        // interna del cliente); se dispara una función async aparte.
        void loadProfileFor(uid, set)
      })
    }

    // Resuelve el estado inicial explícitamente por si el evento
    // INITIAL_SESSION del listener tarda o el navegador no lo emite.
    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user.id ?? null
    if (!userId) {
      set({ loading: false, userId: null, profile: null })
      return
    }
    await loadProfileFor(userId, set)
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      const friendly =
        error.message === 'Invalid login credentials'
          ? 'Correo o contraseña incorrectos.'
          : 'No pudimos iniciar sesión. Intenta de nuevo en unos segundos.'
      return { error: friendly }
    }
    return {}
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ userId: null, profile: null })
  },
}))
