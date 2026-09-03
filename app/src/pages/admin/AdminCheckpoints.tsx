import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import { useAuthStore } from '../../lib/stores/auth'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { IconQr, IconSearch, IconCheck } from '../../components/ui/icons'
import { qrDataUrls } from '../../lib/qr'

interface PointRow {
  id: string
  name: string
  sequence_order: number
  monthly_fee_cop: number | null
  latitude: number | null
  longitude: number | null
  token: string | null
  serviceName: string
  clientName: string
  lastScanAt: string | null
  lastScanBy: string | null
}

/**
 * Puntos de control: el catálogo de QR de la operación.
 *
 * Es la pieza que faltaba para que el sistema sirviera de algo. Los códigos
 * existían en la base de datos, pero no había ninguna pantalla que los
 * mostrara, así que no había nada que pegar en una portería ni nada que
 * escanear. Aquí se ven, se buscan, se imprimen y se verifica cuándo fue la
 * última vez que alguien pasó por cada uno.
 */
export function AdminCheckpoints() {
  const companyId = useAuthStore((s) => s.profile?.company_id)
  const [points, setPoints] = useState<PointRow[]>([])
  const [qrImages, setQrImages] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [clientFilter, setClientFilter] = useState<string>('todos')

  useEffect(() => {
    if (companyId) void load(companyId)
  }, [companyId])

  async function load(cid: string) {
    setLoading(true)

    const { data: pts } = await supabase
      .from('route_points')
      .select(
        'id, name, sequence_order, monthly_fee_cop, latitude, longitude, services(name, clients(name)), qr_codes(token, status)',
      )
      .eq('company_id', cid)
      .eq('is_active', true)
      .order('sequence_order')

    const rows: PointRow[] = (pts ?? []).map((p) => {
      const service = Array.isArray(p.services) ? p.services[0] : p.services
      const client = service
        ? Array.isArray(service.clients)
          ? service.clients[0]
          : service.clients
        : null
      const codes = (Array.isArray(p.qr_codes) ? p.qr_codes : p.qr_codes ? [p.qr_codes] : []) as {
        token: string
        status: string
      }[]
      const active = codes.find((c) => c.status === 'active')

      return {
        id: p.id,
        name: p.name,
        sequence_order: p.sequence_order,
        monthly_fee_cop: p.monthly_fee_cop,
        latitude: p.latitude,
        longitude: p.longitude,
        token: active?.token ?? null,
        serviceName: service?.name ?? '—',
        clientName: client?.name ?? '—',
        lastScanAt: null,
        lastScanBy: null,
      }
    })

    // Último escaneo por punto, para saber cuáles están realmente en uso.
    const { data: scans } = await supabase
      .from('checkpoint_scans')
      .select('route_point_id, scanned_at, guards(user_profiles(full_name))')
      .eq('company_id', cid)
      .order('scanned_at', { ascending: false })
      .limit(1000)

    const seen = new Set<string>()
    for (const s of scans ?? []) {
      if (!s.route_point_id || seen.has(s.route_point_id)) continue
      seen.add(s.route_point_id)
      const g = Array.isArray(s.guards) ? s.guards[0] : s.guards
      const up = g?.user_profiles
      const prof = Array.isArray(up) ? up[0] : up
      const row = rows.find((r) => r.id === s.route_point_id)
      if (row) {
        row.lastScanAt = s.scanned_at
        row.lastScanBy = prof?.full_name ?? null
      }
    }

    setPoints(rows)
    setLoading(false)

    const tokens = rows.map((r) => r.token).filter((t): t is string => !!t)
    setQrImages(await qrDataUrls(tokens, 300))
  }

  const clients = useMemo(
    () => Array.from(new Set(points.map((p) => p.clientName))).sort(),
    [points],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return points.filter((p) => {
      if (clientFilter !== 'todos' && p.clientName !== clientFilter) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        p.clientName.toLowerCase().includes(q) ||
        String(p.sequence_order) === q
      )
    })
  }, [points, query, clientFilter])

  const scanned = visible.filter((p) => p.lastScanAt).length

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink-50">Puntos de control</h2>
          <p className="mt-1 text-sm text-ink-400">
            Cada punto tiene un código QR único. Imprímelo y pégalo en el sitio: el
            vigilante lo escanea y queda registrada la hora, la ubicación y quién lo hizo.
          </p>
        </div>
        <Button onClick={() => window.print()} variant="secondary">
          Imprimir códigos
        </Button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 print:hidden">
        <Stat label="Puntos" value={visible.length} />
        <Stat label="Con QR activo" value={visible.filter((p) => p.token).length} />
        <Stat label="Ya escaneados" value={scanned} />
        <Stat
          label="Cartera mensual"
          value={formatCop(visible.reduce((s, p) => s + (p.monthly_fee_cop ?? 0), 0))}
        />
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row print:hidden">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500">
            <IconSearch width={16} height={16} />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar punto o cliente…"
            className="w-full rounded-lg border border-ink-700 bg-ink-900 py-2.5 pl-9 pr-3 text-sm text-ink-50 outline-none focus:border-action-500"
          />
        </div>
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm text-ink-50 outline-none focus:border-action-500"
        >
          <option value="todos">Todos los clientes</option>
          {clients.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-ink-400">Cargando puntos…</p>
      ) : visible.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<IconQr width={32} height={32} />}
            title="Sin puntos de control"
            description="Cuando se creen puntos para un servicio, sus códigos QR aparecerán aquí."
          />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((p) => (
            <Card key={p.id} className="overflow-hidden print:break-inside-avoid">
              <div className="flex items-start justify-between gap-2 border-b border-ink-800 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-50">{p.name}</p>
                  {clients.length > 1 && (
                    <p className="truncate text-xs text-ink-500">{p.clientName}</p>
                  )}
                </div>
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-ink-800 font-mono text-xs font-bold text-action-400">
                  {p.sequence_order}
                </span>
              </div>

              <div className="flex items-center justify-center bg-white p-4">
                {p.token && qrImages[p.token] ? (
                  <img
                    src={qrImages[p.token]}
                    alt={`Código QR del punto ${p.name}`}
                    className="h-40 w-40"
                  />
                ) : (
                  <div className="flex h-40 w-40 items-center justify-center text-center text-xs text-ink-600">
                    {p.token ? 'Generando…' : 'Sin QR activo'}
                  </div>
                )}
              </div>

              <div className="space-y-1.5 px-4 py-3 text-xs">
                {p.monthly_fee_cop != null && (
                  <Row k="Tarifa" v={formatCop(p.monthly_fee_cop)} />
                )}
                <Row
                  k="Ubicación"
                  v={
                    p.latitude != null && p.longitude != null
                      ? `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`
                      : 'Se fija al primer escaneo'
                  }
                />
                <div className="pt-1">
                  {p.lastScanAt ? (
                    <Badge tone="ok">
                      <IconCheck width={12} height={12} />
                      {new Date(p.lastScanAt).toLocaleString('es-CO', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {p.lastScanBy ? ` · ${p.lastScanBy}` : ''}
                    </Badge>
                  ) : (
                    <Badge tone="idle">Sin escaneos aún</Badge>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-1 font-mono text-lg font-bold text-ink-50">{value}</p>
    </Card>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-ink-500">{k}</span>
      <span className="truncate font-mono text-ink-200">{v}</span>
    </div>
  )
}

function formatCop(value: number): string {
  return value.toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  })
}
