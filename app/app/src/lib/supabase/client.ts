import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

/**
 * Conexión al backend de Supabase.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ HAY VALORES POR DEFECTO AQUÍ (y por qué no es una fuga de datos)
 *
 * Estos dos valores son públicos por diseño. La app del vigilante corre en
 * el navegador: para hablar con la base de datos necesita la dirección del
 * proyecto y la clave "publishable", y ambas viajan en el paquete
 * JavaScript que descarga cualquiera que abra la página. Eso pasa igual si
 * se inyectan por variable de entorno — Vite las incrusta en el build, no
 * las oculta. No hay forma de tener una app cliente que hable con la base
 * de datos y a la vez esconda estos dos valores.
 *
 * Lo que impide que alguien con esta clave lea datos ajenos NO es el
 * secreto de la clave, sino Row Level Security en Postgres: sin una sesión
 * autenticada la clave sola no devuelve ni una fila, y con sesión solo
 * devuelve las filas de la empresa de ese usuario. La clave con poderes
 * reales (service_role) nunca sale del servidor y no está en este archivo.
 *
 * Se ponen como respaldo porque la alternativa era peor: si las variables
 * de entorno no llegan al build, `createClient` recibe `undefined`, lanza
 * "supabaseUrl is required" y la aplicación entera muere antes de pintar
 * nada — pantalla en negro, sin explicación para quien la abre. Un olvido
 * de configuración no debería tumbar el sistema operativo de una empresa
 * de seguridad.
 *
 * Las variables de entorno siguen teniendo prioridad: quien despliegue
 * este código contra OTRO proyecto de Supabase solo tiene que definir
 * VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY y estas constantes se ignoran.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Proyecto Supabase de Condor Security. Valores públicos (ver arriba). */
const FALLBACK_URL = 'https://vgmyryxelsayscxbjjoh.supabase.co'
const FALLBACK_ANON_KEY = 'sb_publishable_0aXpG7oIq_qPQFTU7XXAcA_ZqQBOSYq'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || FALLBACK_URL
const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || FALLBACK_ANON_KEY

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  // Aviso, no error: la app funciona igual. Sirve para que quien despliegue
  // contra otro proyecto se dé cuenta de que está usando el de respaldo.
  console.warn(
    'Seguridad Cóndor: usando la configuración de Supabase por defecto. ' +
      'Para apuntar a otro proyecto, define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.',
  )
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
