import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import { useAuthStore } from '../../lib/stores/auth'
import { callRpc } from '../../lib/rpc'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal, ConfirmDialog } from '../../components/ui/Modal'
import { Field, SelectField, FormError } from '../../components/ui/Field'
import {
  IconQr,
  IconSearch,
  IconCheck,
  IconPlus,
  IconEdit,
  IconTrash,
  IconRefresh,
  IconDownload,
  IconPower,
} from '../../components/ui/icons'
import { qrDataUrls, qrDataUrl } from '../../lib/qr'

interface PointRow {
  id: string
  name: string
  route_id: string
  sequence_order: number
  monthly_fee_cop: number | null
  latitude: number | null
  longitude: number | null
  is_active: boolean
  token: string | null
  serviceName: string
  clientName: string
  lastScanAt: string | null
  lastScanBy: string | null
}

interface RouteOption {
  id: string
  name: string
}

type ModalState =
  | { type: 'create' }
  | { type: 'edit'; point: PointRow }
  | { type: 'regenerate'; point: PointRow }
  | { type: 'toggle'; point: PointRow }
  | { type: 'delete'; point: PointRow }
  | null

/**
 * Puntos de control: el catálogo de QR de la operación.
 *
 * Aquí se añaden casas/negocios nuevos, se cambia el nombre de un punto (y de
 * su QR impreso: el código no cambia, solo el nombre que lo acompaña), se
 * regenera un QR perdido o dañado, se desactiva lo que ya no se atiende y se
 * borra lo que se creó por error. Lo que ya tiene historial no se borra: se
 * desactiva, para no perder los registros de rondas pasadas.
 */
export function AdminCheckpoints() {
  const companyId = useAuthStore((s) => s.profile?.company_id)
  const [points, setPoints] = useState<PointRow[]>([])
  const [routes, setRoutes] = useState<RouteOption[]>([])
  const [qrImages, setQrImages] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [clientFilter, setClientFilter] = useState<string>('todos')
  const [showInactive, setShowInactive] = useState(false)
  const [modal, setModal] = useState<ModalState>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (companyId) void load(companyId)
  }, [companyId])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(t)
  }, [notice])

  async function load(cid: string) {
    setLoading(true)

    const [{ data: pts }, { data: rts }] = await Promise.all([
      supabase
        .from('route_points')
        .select(
          'id, name, route_id, sequence_order, monthly_fee_cop, latitude, longitude, is_active, services(name, clients(name)), qr_codes(token, status)',
        )
        .eq('company_id', cid)
        .order('sequence_order'),
      supabase.from('routes').select('id, name').eq('company_id', cid).eq('is_active', true).order('name'),
    ])
    setRoutes(rts ?? [])

    const rows: PointRow[] = (pts ?? []).map((p) => {
      const service = Array.isArray(p.services) ? p.services[0] : p.services
      const client = service ? (Array.isArray(service.clients) ? service.clients[0] : service.clients) : null
      const codes = (Array.isArray(p.qr_codes) ? p.qr_codes : p.qr_codes ? [p.qr_codes] : []) as {
        token: string
        status: string
      }[]
      const active = codes.find((c) => c.status === 'active')

      return {
        id: p.id,
        name: p.name,
        route_id: p.route_id,
        sequence_order: p.sequence_order,
        monthly_fee_cop: p.monthly_fee_cop,
        latitude: p.latitude,
        longitude: p.longitude,
        is_active: p.is_active,
        token: active?.token ?? null,
        serviceName: service?.name ?? '—',
        clientName: client?.name ?? '—',
        lastScanAt: null,
        lastScanBy: null,
      }
    })

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

  function done(message: string) {
    setModal(null)
    setNotice(message)
    if (companyId) void load(companyId)
  }

  const inactiveCount = points.filter((p) => !p.is_active).length

  const clients = useMemo(() => Array.from(new Set(points.map((p) => p.clientName))).sort(), [points])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return points.filter((p) => {
      if (!showInactive && !p.is_active) return false
      if (clientFilter !== 'todos' && p.clientName !== clientFilter) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        p.clientName.toLowerCase().includes(q) ||
        String(p.sequence_order) === q
      )
    })
  }, [points, query, clientFilter, showInactive])

  const activeVisible = visible.filter((p) => p.is_active)
  const scanned = activeVisible.filter((p) => p.lastScanAt).length

  async function downloadQr(p: PointRow) {
    if (!p.token) return
    const url = await qrDataUrl(p.token, 800)
    const a = document.createElement('a')
    a.href = url
    a.download = `QR-${p.sequence_order}-${p.name.replace(/[^\p{L}\p{N}]+/gu, '_')}.png`
    a.click()
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-lg font-semibold text-ink-50">Puntos de control</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-400">
            Cada punto tiene un código QR único. Imprímelo y pégalo en el sitio: el vigilante lo escanea y queda
            registrada la hora, la ubicación y quién lo hizo.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => window.print()} variant="secondary">
            Imprimir códigos
          </Button>
          <Button onClick={() => setModal({ type: 'create' })}>
            <IconPlus /> Añadir punto
          </Button>
        </div>
      </div>

      {notice && (
        <p role="status" className="mt-4 rounded-lg bg-ok-500/10 px-3 py-2 text-sm text-ok-400 print:hidden">
          {notice}
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 print:hidden">
        <Stat label="Puntos activos" value={activeVisible.length} />
        <Stat label="Con QR activo" value={activeVisible.filter((p) => p.token).length} />
        <Stat label="Ya escaneados" value={scanned} />
        <Stat label="Cartera mensual" value={formatCop(activeVisible.reduce((s, p) => s + (p.monthly_fee_cop ?? 0), 0))} />
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center print:hidden">
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
        {inactiveCount > 0 && (
          <label className="flex items-center gap-2 text-sm text-ink-300">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Mostrar desactivados ({inactiveCount})
          </label>
        )}
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-ink-400">Cargando puntos…</p>
      ) : visible.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<IconQr width={32} height={32} />}
            title="Sin puntos de control"
            description="Añade el primer punto con el botón «Añadir punto»: se crea con su código QR listo para imprimir."
          />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((p) => (
            <Card key={p.id} className={`overflow-hidden print:break-inside-avoid ${p.is_active ? '' : 'opacity-60 print:hidden'}`}>
              <div className="flex items-start justify-between gap-2 border-b border-ink-800 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-50">{p.name}</p>
                  {clients.length > 1 && <p className="truncate text-xs text-ink-500">{p.clientName}</p>}
                </div>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  {!p.is_active && <Badge tone="idle">Desactivado</Badge>}
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-800 font-mono text-xs font-bold text-action-400">
                    {p.sequence_order}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-center bg-white p-4">
                {p.is_active && p.token && qrImages[p.token] ? (
                  <img src={qrImages[p.token]} alt={`Código QR del punto ${p.name}`} className="h-40 w-40" />
                ) : (
                  <div className="flex h-40 w-40 items-center justify-center text-center text-xs text-ink-600">
                    {!p.is_active ? 'QR anulado' : p.token ? 'Generando…' : 'Sin QR activo'}
                  </div>
                )}
              </div>

              <div className="space-y-1.5 px-4 py-3 text-xs">
                {p.monthly_fee_cop != null && <Row k="Tarifa" v={formatCop(p.monthly_fee_cop)} />}
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

              <div className="flex flex-wrap gap-1 border-t border-ink-800 px-2 py-2 print:hidden">
                <IconBtn label="Editar" onClick={() => setModal({ type: 'edit', point: p })}>
                  <IconEdit width={16} height={16} />
                </IconBtn>
                {p.is_active && p.token && (
                  <IconBtn label="Descargar QR" onClick={() => void downloadQr(p)}>
                    <IconDownload width={16} height={16} />
                  </IconBtn>
                )}
                {p.is_active && (
                  <IconBtn label="Nuevo QR" onClick={() => setModal({ type: 'regenerate', point: p })}>
                    <IconRefresh width={16} height={16} />
                  </IconBtn>
                )}
                <IconBtn label={p.is_active ? 'Desactivar' : 'Reactivar'} onClick={() => setModal({ type: 'toggle', point: p })}>
                  <IconPower width={16} height={16} />
                </IconBtn>
                <IconBtn label="Eliminar" danger onClick={() => setModal({ type: 'delete', point: p })}>
                  <IconTrash width={16} height={16} />
                </IconBtn>
              </div>
            </Card>
          ))}
        </div>
      )}

      {modal?.type === 'create' && (
        <PointFormModal
          mode="create"
          routes={routes}
          onClose={() => setModal(null)}
          onDone={(name) => done(`Punto «${name}» creado con su código QR.`)}
        />
      )}
      {modal?.type === 'edit' && (
        <PointFormModal
          mode="edit"
          point={modal.point}
          routes={routes}
          onClose={() => setModal(null)}
          onDone={() => done('Cambios guardados.')}
        />
      )}
      {modal?.type === 'regenerate' && (
        <ActionConfirm
          title="Generar un nuevo QR"
          confirmLabel="Generar nuevo QR"
          danger
          message={
            <>
              Se creará un código nuevo para <strong>{modal.point.name}</strong> y el actual dejará de funcionar. Tendrás que
              imprimir y pegar el nuevo. Úsalo si el QR se perdió, se dañó o alguien lo copió.
            </>
          }
          run={() => callRpc('regenerate_checkpoint_qr', { p_point_id: modal.point.id })}
          onClose={() => setModal(null)}
          onDone={() => done('QR nuevo generado. Imprímelo y reemplaza el anterior.')}
        />
      )}
      {modal?.type === 'toggle' && (
        <ActionConfirm
          title={modal.point.is_active ? 'Desactivar punto' : 'Reactivar punto'}
          confirmLabel={modal.point.is_active ? 'Desactivar' : 'Reactivar'}
          danger={modal.point.is_active}
          message={
            modal.point.is_active ? (
              <>
                <strong>{modal.point.name}</strong> dejará de aparecer en las rondas y su QR se anulará. El historial de
                escaneos se conserva y puedes reactivarlo cuando quieras.
              </>
            ) : (
              <>
                <strong>{modal.point.name}</strong> volverá a las rondas y su QR anterior se vuelve a activar (el adhesivo ya pegado sigue sirviendo).
              </>
            )
          }
          run={() => callRpc('set_checkpoint_active', { p_point_id: modal.point.id, p_active: !modal.point.is_active })}
          onClose={() => setModal(null)}
          onDone={() => done(modal.point.is_active ? 'Punto desactivado.' : 'Punto reactivado.')}
        />
      )}
      {modal?.type === 'delete' && (
        <ActionConfirm
          title="Eliminar punto"
          confirmLabel="Eliminar definitivamente"
          danger
          message={
            <>
              Se borrará <strong>{modal.point.name}</strong> por completo, con su cliente y su QR. Solo es posible si nunca
              tuvo escaneos ni novedades; si ya tiene historial, usa «Desactivar».
            </>
          }
          run={() => callRpc('delete_checkpoint', { p_point_id: modal.point.id })}
          onClose={() => setModal(null)}
          onDone={() => done('Punto eliminado.')}
        />
      )}
    </div>
  )
}

function ActionConfirm({
  title,
  message,
  confirmLabel,
  danger,
  run,
  onClose,
  onDone,
}: {
  title: string
  message: React.ReactNode
  confirmLabel: string
  danger?: boolean
  run: () => Promise<unknown>
  onClose: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <ConfirmDialog
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      danger={danger}
      busy={busy}
      error={error}
      onClose={onClose}
      onConfirm={async () => {
        setBusy(true)
        setError(null)
        try {
          await run()
          onDone()
        } catch (e) {
          setError(e instanceof Error ? e.message : 'No se pudo completar la acción.')
          setBusy(false)
        }
      }}
    />
  )
}

function PointFormModal({
  mode,
  point,
  routes,
  onClose,
  onDone,
}: {
  mode: 'create' | 'edit'
  point?: PointRow
  routes: RouteOption[]
  onClose: () => void
  onDone: (name: string) => void
}) {
  const [name, setName] = useState(point?.name ?? '')
  const [fee, setFee] = useState(point?.monthly_fee_cop != null ? String(point.monthly_fee_cop) : '')
  const [address, setAddress] = useState('')
  const [routeId, setRouteId] = useState(routes[0]?.id ?? '')
  const [resetLocation, setResetLocation] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const feeNumber = fee.trim() === '' ? null : Number(fee.replace(/[^\d]/g, ''))
  const canSave = name.trim().length > 0 && (mode === 'edit' || routeId !== '')

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      if (mode === 'create') {
        await callRpc('create_checkpoint', {
          p_route_id: routeId,
          p_name: name,
          p_monthly_fee: feeNumber,
          p_address: address || null,
        })
      } else if (point) {
        await callRpc('update_checkpoint', {
          p_point_id: point.id,
          p_name: name,
          p_monthly_fee: feeNumber,
          p_reset_location: resetLocation,
        })
      }
      onDone(name.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
      setSaving(false)
    }
  }

  return (
    <Modal
      title={mode === 'create' ? 'Añadir punto de control' : 'Editar punto'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={saving} disabled={!canSave}>
            {mode === 'create' ? 'Crear punto' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Nombre (casa, negocio o sitio)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          autoFocus
          hint={mode === 'edit' ? 'El QR impreso sigue sirviendo: solo cambia el nombre con el que aparece en el sistema.' : undefined}
        />
        {mode === 'create' && (
          <SelectField label="Ronda" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            {routes.length === 0 && <option value="">No hay rondas activas</option>}
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </SelectField>
        )}
        <Field
          label="Tarifa mensual (COP, opcional)"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          inputMode="numeric"
          placeholder="Ej. 80000"
        />
        {mode === 'create' && (
          <Field
            label="Dirección (opcional)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            hint="La ubicación GPS exacta se fija sola cuando el vigilante escanea el QR por primera vez."
          />
        )}
        {mode === 'edit' && point?.latitude != null && (
          <label className="flex items-start gap-2 text-sm text-ink-300">
            <input type="checkbox" className="mt-0.5" checked={resetLocation} onChange={(e) => setResetLocation(e.target.checked)} />
            <span>Borrar la ubicación guardada (se volverá a fijar en el próximo escaneo). Úsalo si el punto cambió de lugar.</span>
          </label>
        )}
        <FormError message={error} />
      </div>
    </Modal>
  )
}

function IconBtn({
  label,
  onClick,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg ${
        danger ? 'text-danger-400 hover:bg-danger-500/10' : 'text-ink-300 hover:bg-ink-800 hover:text-ink-50'
      }`}
    >
      {children}
    </button>
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
  return value.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
}
