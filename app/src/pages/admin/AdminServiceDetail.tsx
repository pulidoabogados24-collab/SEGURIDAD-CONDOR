import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { supabase } from '../../lib/supabase/client'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { IconChevronLeft, IconPlus, IconQr } from '../../components/ui/icons'
import type { ServiceRow, Route, RoutePoint, QrCode as QrCodeRow } from '../../lib/types/domain'

export function AdminServiceDetail() {
  const { serviceId } = useParams<{ serviceId: string }>()
  const [service, setService] = useState<ServiceRow | null>(null)
  const [routes, setRoutes] = useState<Route[]>([])
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null)
  const [points, setPoints] = useState<(RoutePoint & { qr_codes: QrCodeRow[] })[]>([])
  const [loading, setLoading] = useState(true)
  const [showRouteForm, setShowRouteForm] = useState(false)
  const [showPointForm, setShowPointForm] = useState(false)

  useEffect(() => {
    if (serviceId) void load(serviceId)
  }, [serviceId])

  useEffect(() => {
    if (selectedRoute) void loadPoints(selectedRoute)
  }, [selectedRoute])

  async function load(sid: string) {
    setLoading(true)
    const [s, r] = await Promise.all([
      supabase.from('services').select('*').eq('id', sid).single(),
      supabase.from('routes').select('*').eq('service_id', sid).order('created_at'),
    ])
    setService(s.data)
    setRoutes(r.data ?? [])
    if (r.data && r.data.length > 0) setSelectedRoute(r.data[0].id)
    setLoading(false)
  }

  async function loadPoints(routeId: string) {
    const { data } = await supabase
      .from('route_points')
      .select('*, qr_codes(*)')
      .eq('route_id', routeId)
      .order('sequence_order')
    setPoints((data as (RoutePoint & { qr_codes: QrCodeRow[] })[]) ?? [])
  }

  async function downloadAllQr() {
    for (const point of points) {
      const activeQr = point.qr_codes.find((q) => q.status === 'active')
      if (!activeQr) continue
      const dataUrl = await QRCode.toDataURL(activeQr.token, { width: 480, margin: 2 })
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `QR-${point.sequence_order}-${point.name.replace(/\s+/g, '_')}.png`
      link.click()
      await new Promise((r) => setTimeout(r, 150))
    }
  }

  if (loading) return <div className="p-8 text-sm text-ink-400">Cargando…</div>
  if (!service) return <div className="p-8 text-sm text-ink-400">Servicio no encontrado.</div>

  return (
    <div className="p-8">
      <Link to="/admin/servicios" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-400 hover:text-ink-100">
        <IconChevronLeft width={16} height={16} /> Servicios
      </Link>
      <h1 className="text-lg font-semibold text-ink-50">{service.name}</h1>
      <p className="mt-1 text-sm text-ink-400">Radio GPS permitido: {service.gps_radius_meters} m</p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-50">Rondas</h3>
            <button onClick={() => setShowRouteForm(true)} className="text-ink-400 hover:text-action-400">
              <IconPlus width={16} height={16} />
            </button>
          </div>
          {showRouteForm && service && (
            <NewRouteForm
              companyId={service.company_id}
              serviceId={service.id}
              onDone={() => { setShowRouteForm(false); void load(service.id) }}
              onCancel={() => setShowRouteForm(false)}
            />
          )}
          <div className="space-y-1">
            {routes.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedRoute(r.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                  selectedRoute === r.id ? 'bg-action-500/15 text-action-400' : 'text-ink-300 hover:bg-ink-800'
                }`}
              >
                <p className="font-medium">{r.name}</p>
                <p className="text-xs opacity-70">{r.scheduled_time.slice(0, 5)}</p>
              </button>
            ))}
            {routes.length === 0 && !showRouteForm && (
              <p className="px-3 py-2 text-xs text-ink-500">Sin rondas configuradas.</p>
            )}
          </div>
        </Card>

        <div>
          {selectedRoute ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink-50">Puntos de control</h3>
                <div className="flex gap-2">
                  <Button variant="secondary" size="md" onClick={downloadAllQr} disabled={points.length === 0}>
                    <IconQr width={16} height={16} /> Descargar todos los QR
                  </Button>
                  <Button size="md" onClick={() => setShowPointForm(true)}>
                    <IconPlus width={16} height={16} /> Nuevo punto
                  </Button>
                </div>
              </div>

              {showPointForm && service && (
                <NewPointForm
                  companyId={service.company_id}
                  serviceId={service.id}
                  routeId={selectedRoute}
                  nextSequence={points.length + 1}
                  onDone={() => { setShowPointForm(false); void loadPoints(selectedRoute) }}
                  onCancel={() => setShowPointForm(false)}
                />
              )}

              {points.length === 0 && !showPointForm ? (
                <EmptyState title="Sin puntos de control" description="Agrega puntos en el orden en que el vigilante debe recorrerlos." />
              ) : (
                <div className="space-y-3">
                  {points.map((p) => (
                    <PointCard key={p.id} point={p} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <EmptyState title="Crea una ronda primero" description="Las rondas agrupan los puntos de control en el orden que debe seguir el vigilante." />
          )}
        </div>
      </div>
    </div>
  )
}

function PointCard({ point }: { point: RoutePoint & { qr_codes: QrCodeRow[] } }) {
  const [qrImg, setQrImg] = useState<string>('')
  const activeQr = point.qr_codes.find((q) => q.status === 'active')

  useEffect(() => {
    if (activeQr) {
      void QRCode.toDataURL(activeQr.token, { width: 160, margin: 1 }).then(setQrImg)
    }
  }, [activeQr])

  async function regenerate() {
    if (!activeQr) return
    if (!confirm('¿Regenerar este código QR? El código anterior dejará de funcionar.')) return
    await supabase.from('qr_codes').update({ status: 'invalidated', invalidated_at: new Date().toISOString(), invalidated_reason: 'Regenerado manualmente' }).eq('id', activeQr.id)
    await supabase.from('qr_codes').insert({ company_id: point.company_id, route_point_id: point.id, version: (activeQr.version ?? 1) + 1 })
    window.location.reload()
  }

  return (
    <Card className="flex items-center gap-4 p-4">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-ink-800 text-sm font-semibold text-ink-200">
        {point.sequence_order}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-ink-50">{point.name}</p>
        <p className="text-xs text-ink-400">
          {point.latitude ? `${point.latitude.toFixed(5)}, ${point.longitude?.toFixed(5)}` : 'Sin coordenadas GPS'}
        </p>
        <div className="mt-1">
          <Badge tone={activeQr ? 'ok' : 'danger'}>{activeQr ? 'QR activo' : 'Sin QR activo'}</Badge>
        </div>
      </div>
      {qrImg && <img src={qrImg} alt={`QR ${point.name}`} className="h-16 w-16 rounded bg-white p-1" />}
      <Button variant="secondary" size="md" onClick={regenerate}>Regenerar QR</Button>
    </Card>
  )
}

function NewRouteForm({ companyId, serviceId, onDone, onCancel }: { companyId: string; serviceId: string; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [time, setTime] = useState('22:00')
  const [duration, setDuration] = useState(60)
  const [tolerance, setTolerance] = useState(15)
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    await supabase.from('routes').insert({
      company_id: companyId, service_id: serviceId, name,
      scheduled_time: time, expected_duration_minutes: duration, tolerance_minutes: tolerance,
    })
    setSaving(false)
    onDone()
  }

  return (
    <div className="mb-3 space-y-2 rounded-lg border border-ink-700 p-3">
      <input placeholder="Nombre de la ronda" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border border-ink-600 bg-ink-800 px-2 py-1.5 text-xs text-ink-50 outline-none focus:border-action-400" />
      <div className="flex gap-2">
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full rounded border border-ink-600 bg-ink-800 px-2 py-1.5 text-xs text-ink-50" />
        <input type="number" placeholder="min" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-20 rounded border border-ink-600 bg-ink-800 px-2 py-1.5 text-xs text-ink-50" />
      </div>
      <div className="flex gap-2">
        <input type="number" placeholder="Tolerancia min" value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className="w-full rounded border border-ink-600 bg-ink-800 px-2 py-1.5 text-xs text-ink-50" />
      </div>
      <div className="flex gap-2">
        <Button size="md" className="flex-1 !py-1.5 !text-xs" onClick={submit} loading={saving} disabled={!name}>Crear</Button>
        <Button size="md" variant="ghost" className="!py-1.5 !text-xs" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  )
}

function NewPointForm({
  companyId, serviceId, routeId, nextSequence, onDone, onCancel,
}: { companyId: string; serviceId: string; routeId: string; nextSequence: number; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function useCurrentLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude.toString()); setLng(pos.coords.longitude.toString()) },
      () => setError('No se pudo obtener tu ubicación. Ingresa las coordenadas manualmente.'),
    )
  }

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      const { data: point, error: pErr } = await supabase.from('route_points').insert({
        company_id: companyId, route_id: routeId, service_id: serviceId,
        name, sequence_order: nextSequence,
        latitude: lat ? Number(lat) : null, longitude: lng ? Number(lng) : null,
      }).select().single()
      if (pErr) throw pErr
      const { error: qErr } = await supabase.from('qr_codes').insert({ company_id: companyId, route_point_id: point.id })
      if (qErr) throw qErr
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el punto.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mb-4 p-4">
      <div className="grid grid-cols-3 gap-3">
        <input placeholder="Nombre del punto" value={name} onChange={(e) => setName(e.target.value)} className="col-span-3 rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ink-50 outline-none focus:border-action-400 sm:col-span-1" />
        <input placeholder="Latitud" value={lat} onChange={(e) => setLat(e.target.value)} className="rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ink-50 outline-none focus:border-action-400" />
        <input placeholder="Longitud" value={lng} onChange={(e) => setLng(e.target.value)} className="rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ink-50 outline-none focus:border-action-400" />
      </div>
      <button onClick={useCurrentLocation} className="mt-2 text-xs text-action-400 hover:underline">Usar mi ubicación actual</button>
      {error && <p className="mt-2 text-xs text-danger-400">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Button onClick={submit} loading={saving} disabled={!name}>Crear punto y generar QR</Button>
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </Card>
  )
}
