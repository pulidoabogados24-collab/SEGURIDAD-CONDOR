import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase/client'
import { useAuthStore } from '../../lib/stores/auth'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { IconBuilding, IconPlus } from '../../components/ui/icons'
import type { ServiceRow, Client } from '../../lib/types/domain'

const SERVICE_TYPE_LABELS: Record<string, string> = {
  neighborhood: 'Barrio', condo: 'Conjunto residencial', company: 'Empresa',
  warehouse: 'Bodega', farm: 'Finca', mall: 'Centro comercial', institution: 'Institución', other: 'Otro',
}

export function AdminServices() {
  const companyId = useAuthStore((s) => s.profile?.company_id)
  const [services, setServices] = useState<ServiceRow[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (companyId) void load(companyId)
  }, [companyId])

  async function load(cid: string) {
    setLoading(true)
    const [s, c] = await Promise.all([
      supabase.from('services').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('clients').select('*').eq('company_id', cid).order('name'),
    ])
    setServices(s.data ?? [])
    setClients(c.data ?? [])
    setLoading(false)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink-50">Servicios</h1>
          <p className="mt-1 text-sm text-ink-400">Barrios, conjuntos, bodegas y demás servicios contratados.</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <IconPlus /> Nuevo servicio
        </Button>
      </div>

      {showForm && companyId && (
        <NewServiceForm
          companyId={companyId}
          clients={clients}
          onDone={() => { setShowForm(false); void load(companyId) }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-ink-400">Cargando…</p>
        ) : services.length === 0 ? (
          <EmptyState
            icon={<IconBuilding width={32} height={32} />}
            title="Aún no tienes servicios"
            description="Crea tu primer servicio (barrio, conjunto, bodega, etc.) para empezar a configurar rondas y puntos de control."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <Link key={s.id} to={`/admin/servicios/${s.id}`}>
                <Card className="p-5 transition-colors hover:border-action-500/50">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                    {SERVICE_TYPE_LABELS[s.service_type] ?? s.service_type}
                  </p>
                  <p className="mt-1 text-base font-semibold text-ink-50">{s.name}</p>
                  <p className="mt-1 text-xs text-ink-400">{s.city ?? 'Sin ciudad registrada'}</p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function NewServiceForm({
  companyId,
  clients,
  onDone,
  onCancel,
}: {
  companyId: string
  clients: Client[]
  onDone: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [clientId, setClientId] = useState(clients[0]?.id ?? '')
  const [clientName, setClientName] = useState('')
  const [serviceType, setServiceType] = useState('neighborhood')
  const [city, setCity] = useState('')
  const [radius, setRadius] = useState(60)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    try {
      let finalClientId = clientId
      if (!finalClientId && clientName) {
        const { data, error: cErr } = await supabase
          .from('clients')
          .insert({ company_id: companyId, name: clientName })
          .select()
          .single()
        if (cErr) throw cErr
        finalClientId = data.id
      }
      if (!finalClientId) throw new Error('Selecciona o crea un cliente.')

      const { error: sErr } = await supabase.from('services').insert({
        company_id: companyId,
        client_id: finalClientId,
        name,
        service_type: serviceType,
        city,
        gps_radius_meters: radius,
      })
      if (sErr) throw sErr
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el servicio.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mt-6 p-6">
      <h3 className="text-sm font-semibold text-ink-50">Nuevo servicio</h3>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-300">Nombre del servicio</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Barrio El Porvenir"
            className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ink-50 outline-none focus:border-action-400 focus:ring-1 focus:ring-action-400"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-300">Tipo</label>
          <select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
            className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ink-50 outline-none focus:border-action-400"
          >
            {Object.entries(SERVICE_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-300">Cliente existente</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ink-50 outline-none focus:border-action-400"
          >
            <option value="">— Crear nuevo cliente —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        {!clientId && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-300">Nombre del nuevo cliente</label>
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Junta de Acción Comunal…"
              className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ink-50 outline-none focus:border-action-400"
            />
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-300">Ciudad</label>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ink-50 outline-none focus:border-action-400"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-300">Radio GPS permitido (metros)</label>
          <input
            type="number"
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ink-50 outline-none focus:border-action-400"
          />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-danger-400">{error}</p>}
      <div className="mt-5 flex gap-3">
        <Button onClick={handleSubmit} loading={saving} disabled={!name}>Crear servicio</Button>
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </Card>
  )
}
