import QRCode from 'qrcode'

/**
 * Generación de los códigos QR de los puntos de control.
 *
 * Qué se codifica: exclusivamente el `token` (un UUID aleatorio) de la
 * tabla `qr_codes`. Nada más. El QR NO lleva el nombre del punto, ni el
 * cliente, ni coordenadas, ni ningún dato del negocio — quien fotografíe
 * un adhesivo pegado en una portería solo obtiene un identificador opaco
 * que no le dice nada y que, sin sesión de vigilante autenticado, no sirve
 * para registrar nada.
 *
 * La validación real (que el punto exista, que corresponda a la ronda en
 * curso, el orden, la distancia GPS y el tiempo entre escaneos) ocurre en
 * la base de datos, dentro de `register_checkpoint_scan`.
 */

/** Nivel de corrección de error alto: un adhesivo a la intemperie se raya. */
const OPTIONS = {
  errorCorrectionLevel: 'H' as const,
  margin: 1,
  color: { dark: '#0B0D10', light: '#FFFFFF' },
}

/** Devuelve el QR como data URL PNG, listo para un <img>. */
export async function qrDataUrl(token: string, size = 320): Promise<string> {
  return QRCode.toDataURL(token, { ...OPTIONS, width: size })
}

/** Genera varios QR en paralelo, indexados por token. */
export async function qrDataUrls(
  tokens: string[],
  size = 320,
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    tokens.map(async (t) => [t, await qrDataUrl(t, size)] as const),
  )
  return Object.fromEntries(entries)
}
