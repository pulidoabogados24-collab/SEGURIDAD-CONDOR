import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import { useAuthStore } from '../../lib/stores/auth'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { IconUsers, IconPlus } from '../../components/ui/icons'
import type { ServiceRow } from '../../lib/types/domain'

interface GuardRow {
  id: string
  badge_code: string | null
  is_active: boolean
  default_service_id: string | null
  user_profiles: { full_name: string; phone: string | null } | { full_name: string; phone: string | null }[] | null
}

export function AdminGuards() {
  const companyId = useAuthStore((s) => s.profile?.company_id)
  const [guards, setGuards] = useState<GuardRow[]>([])
  const [services, setServices] = useState<ServiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (companyId) void load(companyId)
  }, [companyId])

  async function load(cid: string) {
    setLoading(true)
    const [g, s] = await Promise.all([
      supabase.from('guards').select('id, badge_code, is_active, default_service_id, user_profiles(full_name, phone)').eq('company_id', cid),
      supabase.from('services').select('*').eq('company_id', cid),
    ])
    setGuards((g.data as GuardRow[]) ?? [])
    setServices(s.data ?? [])
    setLoading(false)
  }

  function profileOf(g: GuardRow) {
    return Array.isArray(g.user_profiles) ? g.user_profiles[0] : g.user_profiles
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink-50">Vigilantes</h1>
          <p className="mt-1 text-sm text-ink-400">Personal operativo de tu empresa.</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <IconPlus /> Nuevo vigilante
        </Button>
      </div>

      {showForm && companyId && (
        <NewGuardForm
          companyId={companyId}
          services={services}
          onDone={() => { setShowForm(false); void load(companyId) }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-ink-400">Cargando…</p>
        ) : guards.length === 0 ? (
          <EmptyState icon={<IconUsers width={32} height={32} />} title="Sin vigilantes registrados" description="Crea tu primer vigilante para poder asignarle rondas." />
        ) : (
          <Card>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink-800 text-xs uppercase tracking-wide text-ink-500">
                  <th className="px-5 py-3 font-medium">Nombre</th>
                  <th className="px-5 py-3 font-medium">Código</th>
                  <th className="px-5 py-3 font-medium">Servicio por defecto</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {guards.map((g) => (
                  <tr key={g.id} className="border-b border-ink-800 last:border-0">
                    <td className="px-5 py-3 font-medium text-ink-50">{profileOf(g)?.full_name ?? '—'}</td>
                    <td className="px-5 py-3 text-ink-300">{g.badge_code ?? '—'}</td>
                    <td className="px-5 py-3 text-ink-300">{services.find((s) => s.id === g.default_service_id)?.name ?? '—'}</td>
                    <td className="px-5 py-3"><Badge tone={g.is_active ? 'ok' : 'idle'}>{g.is_active ? 'Activo' : 'Inactivo'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  )
}

function NewGuardForm({ companyId, services, onDone, onCancel }: { companyId: string; services: ServiceRow[]; onDone: () => void; onCancel: () => void }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [badgeCode, setBadgeCode] = useState('')
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      const { data: session } = await supabase.auth.getSession()
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-provision-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session?.access_token}` },
        body: JSON.stringify({
          email, password, full_name: fullName, role: 'guard', company_id: companyId,
          badge_code: badgeCode, default_service_id: serviceId || null,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) throw new Error(body.error ?? 'No se pudo crear el vigilante.')
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el vigilante.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mt-6 p-6">
      <h3 className="text-sm font-semibold text-ink-50">Nuevo vigilante</h3>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <Field label="Nombre completo" value={fullName} onChange={setFullName} />
        <Field label="Código / carné" value={badgeCode} onChange={setBadgeCode} />
        <Field label="Correo (para iniciar sesión)" value={email} onChange={setEmail} type="email" />
        <Field label="Contraseña temporal" value={password} onChange={setPassword} type="password" />
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-300">Servicio por defecto</label>
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ink-50 outline-none focus:border-action-400">
            <option value="">Sin asignar</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-danger-400">{error}</p>}
      <div className="mt-5 flex gap-3">
        <Button onClick={submit} loading={saving} disabled={!fullName || !email || !password}>Crear vigilante</Button>
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </Card>
  )
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-ink-300">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ink-50 outline-none focus:border-action-400 focus:ring-1 focus:ring-action-400" />
    </div>
  )
}
