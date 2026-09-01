import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import { useAuthStore } from '../../lib/stores/auth'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { IconPlus } from '../../components/ui/icons'
import { ROLE_LABELS } from '../../lib/types/domain'
import type { UserProfile, ServiceRow } from '../../lib/types/domain'

export function AdminUsers() {
  const companyId = useAuthStore((s) => s.profile?.company_id)
  const [users, setUsers] = useState<UserProfile[]>([])
  const [services, setServices] = useState<ServiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (companyId) void load(companyId)
  }, [companyId])

  async function load(cid: string) {
    setLoading(true)
    const [u, s] = await Promise.all([
      supabase.from('user_profiles').select('*').eq('company_id', cid).in('role', ['supervisor', 'admin']).order('full_name'),
      supabase.from('services').select('*').eq('company_id', cid),
    ])
    setUsers(u.data ?? [])
    setServices(s.data ?? [])
    setLoading(false)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink-50">Usuarios</h1>
          <p className="mt-1 text-sm text-ink-400">Supervisores y administradores con acceso al panel.</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <IconPlus /> Nuevo supervisor
        </Button>
      </div>

      {showForm && companyId && (
        <NewSupervisorForm companyId={companyId} services={services} onDone={() => { setShowForm(false); void load(companyId) }} onCancel={() => setShowForm(false)} />
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-ink-400">Cargando…</p>
        ) : (
          <Card>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink-800 text-xs uppercase tracking-wide text-ink-500">
                  <th className="px-5 py-3 font-medium">Nombre</th>
                  <th className="px-5 py-3 font-medium">Rol</th>
                  <th className="px-5 py-3 font-medium">Teléfono</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-ink-800 last:border-0">
                    <td className="px-5 py-3 font-medium text-ink-50">{u.full_name}</td>
                    <td className="px-5 py-3 text-ink-300">{ROLE_LABELS[u.role]}</td>
                    <td className="px-5 py-3 text-ink-300">{u.phone ?? '—'}</td>
                    <td className="px-5 py-3"><Badge tone={u.is_active ? 'ok' : 'idle'}>{u.is_active ? 'Activo' : 'Inactivo'}</Badge></td>
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

function NewSupervisorForm({ companyId, services, onDone, onCancel }: { companyId: string; services: ServiceRow[]; onDone: () => void; onCancel: () => void }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleService(id: string) {
    setSelectedServices((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      const { data: session } = await supabase.auth.getSession()
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-provision-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session?.access_token}` },
        body: JSON.stringify({ email, password, full_name: fullName, role: 'supervisor', company_id: companyId }),
      })
      const body = await resp.json()
      if (!resp.ok) throw new Error(body.error ?? 'No se pudo crear el supervisor.')

      if (selectedServices.length > 0) {
        await supabase.from('supervisor_services').insert(
          selectedServices.map((sid) => ({ supervisor_id: body.user_id, service_id: sid, company_id: companyId })),
        )
      }
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el supervisor.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mt-6 p-6">
      <h3 className="text-sm font-semibold text-ink-50">Nuevo supervisor</h3>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-300">Nombre completo</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ink-50 outline-none focus:border-action-400" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-300">Correo</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ink-50 outline-none focus:border-action-400" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-300">Contraseña temporal</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ink-50 outline-none focus:border-action-400" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-300">Servicios a supervisar</label>
          <div className="flex flex-wrap gap-2">
            {services.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleService(s.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${selectedServices.includes(s.id) ? 'bg-action-500 text-ink-950' : 'bg-ink-800 text-ink-300 ring-1 ring-inset ring-ink-600'}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-danger-400">{error}</p>}
      <div className="mt-5 flex gap-3">
        <Button onClick={submit} loading={saving} disabled={!fullName || !email || !password}>Crear supervisor</Button>
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </Card>
  )
}
