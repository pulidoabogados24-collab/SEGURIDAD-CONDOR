import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase/client'

/**
 * Llama a una Edge Function de Supabase con la sesión del usuario.
 *
 * Devuelve el JSON de respuesta o lanza un Error con un mensaje que ya está
 * en español y listo para mostrar (las funciones del servidor responden
 * { error: "..." } con texto pensado para la persona, no para el programador).
 */
export async function callFunction<T = Record<string, unknown>>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data: session } = await supabase.auth.getSession()
  const token = session.session?.access_token
  if (!token) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.')

  let resp: Response
  try {
    resp = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.')
  }

  let payload: Record<string, unknown> = {}
  try {
    payload = await resp.json()
  } catch {
    /* respuesta sin cuerpo JSON */
  }

  if (!resp.ok) {
    const msg = typeof payload.error === 'string' ? payload.error : ''
    throw new Error(msg || 'No se pudo completar la acción. Intenta de nuevo.')
  }
  return payload as T
}

/** Gestión de usuarios ya creados (vigilantes y supervisores). */
export const userAdmin = {
  update: (userId: string, fields: Record<string, unknown>) =>
    callFunction('admin-manage-user', { action: 'update', user_id: userId, ...fields }),
  setActive: (userId: string, active: boolean) =>
    callFunction('admin-manage-user', { action: 'set_active', user_id: userId, active }),
  resetPassword: (userId: string, newPassword: string) =>
    callFunction('admin-manage-user', { action: 'reset_password', user_id: userId, new_password: newPassword }),
  remove: (userId: string) => callFunction('admin-manage-user', { action: 'delete', user_id: userId }),
}

/** Contraseña temporal legible: sin caracteres que se confunden (0/O, 1/l). */
export function generatePassword(length = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('') + '#7'
}
