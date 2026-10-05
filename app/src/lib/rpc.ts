import { supabase } from './supabase/client'

type RpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>
}

/**
 * Llama una función de la base de datos (RPC) y devuelve el resultado o lanza
 * un Error con el mensaje en español que ya viene redactado desde el servidor.
 * Las funciones nuevas (create_checkpoint, etc.) todavía no están en los tipos
 * generados, por eso este envoltorio.
 */
export async function callRpc<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await (supabase as unknown as RpcClient).rpc(name, args)
  if (error) {
    // Función aún no instalada en la base de datos (migración pendiente).
    if (/could not find the function|schema cache/i.test(error.message)) {
      throw new Error('Esta opción todavía no está activada en la base de datos. Pide a soporte aplicar la última actualización.')
    }
    throw new Error(error.message)
  }
  return data as T
}
