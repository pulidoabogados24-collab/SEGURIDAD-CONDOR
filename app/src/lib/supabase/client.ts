import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  // Nunca ocultar este error: sin estas variables la app no puede
  // conectarse de forma segura al backend. Preferible fallar rápido en
  // desarrollo que dejar la app en un estado ambiguo.
  console.error(
    'Faltan variables de entorno VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'Copia .env.example a .env.local y complétalo.',
  )
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
