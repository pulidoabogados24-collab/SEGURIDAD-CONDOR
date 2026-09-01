import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { IconBuilding, IconPlus } from '../../components/ui/icons'
import type { Company } from '../../lib/types/domain'

interface CompanyRow extends Company {
  subscriptions: { status: string; plans: { name: string } | { name: string }[] | null }[] | null
}

export function SuperAdminCompanies() {
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('companies')
      .select('*, subscriptions(status, plans(name))')
      .order('created_at', { ascending: false })
    setCompanies((data as CompanyRow[]) ?? [])
    setLoading(false)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink-50">Empresas</h1>
          <p className="mt-1 text-sm text-ink-400">Todas las empresas de seguridad registradas en la plataforma.</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <IconPlus /> Nueva empresa
        </Button>
      </div>

      {showForm && <NewCompanyForm onDone={() => { setShowForm(false); void load() }} onCancel={() => setShowForm(false)} />}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-ink-400">Cargando…</p>
        ) : companies.length === 0 ? (
          <EmptyState icon={<IconBuilding width={32} height={32} />} title="Sin empresas todavía" description="Crea la primera empresa de seguridad para empezar a usar la plataforma." />
        ) : (
          <Card>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink-800 text-xs uppercase tracking-wide text-ink-500">
                  <th className="px-5 py-3 font-medium">Empresa</th>
                  <th className="px-5 py-3 font-medium">NIT</th>
                  <th className="px-5 py-3 font-medium">Plan</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => {
                  const sub = c.subscriptions?.[0]
                  const planObj = Array.isArray(sub?.plans) ? sub?.plans[0] : sub?.plans
                  return (
                    <tr key={c.id} className="border-b border-ink-800 last:border-0">
                      <td className="px-5 py-3">
                        <p className="font-medium text-ink-50">{c.name}</p>
                        {c.is_demo && <span className="text-xs text-action-400">Demo</span>}
                      </td>
                      <td className="px-5 py-3 text-ink-300">{c.nit ?? '—'}</td>
                      <td className="px-5 py-3 text-ink-300">{planObj?.name ?? '—'}</td>
                      <td className="px-5 py-3">
                        <Badge tone={c.is_active ? 'ok' : 'idle'}>{c.is_active ? 'Activa' : 'Inactiva'}</Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  )
}

function NewCompanyForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [nit, setNit] = useState('')
  const [email, setEmail] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminName, setAdminName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    try {
      const { data: plan } = await supabase.from('plans').select('id').eq('code', 'basico').single()
      const { data: company, error: companyErr } = await supabase
        .from('companies')
        .insert({ name, nit, contact_email: email })
        .select()
        .single()
      if (companyErr) throw companyErr

      await supabase.from('subscriptions').insert({ company_id: company.id, plan_id: plan!.id, status: 'trialing' })

      const { data: session } = await supabase.auth.getSession()
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-provision-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({
          email: adminEmail,
          password: adminPassword,
          full_name: adminName,
          role: 'admin',
          company_id: company.id,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) throw new Error(body.error ?? 'No se pudo crear el administrador.')

      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear la empresa.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mt-6 p-6">
      <h3 className="text-sm font-semibold text-ink-50">Nueva empresa</h3>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <Field label="Nombre de la empresa" value={name} onChange={setName} />
        <Field label="NIT" value={nit} onChange={setNit} />
        <Field label="Correo de contacto" value={email} onChange={setEmail} type="email" />
        <div />
        <Field label="Nombre del administrador" value={adminName} onChange={setAdminName} />
        <Field label="Correo del administrador" value={adminEmail} onChange={setAdminEmail} type="email" />
        <Field label="Contraseña temporal" value={adminPassword} onChange={setAdminPassword} type="password" />
      </div>
      {error && <p className="mt-3 text-sm text-danger-400">{error}</p>}
      <div className="mt-5 flex gap-3">
        <Button onClick={handleSubmit} loading={saving} disabled={!name || !adminEmail || !adminPassword}>
          Crear empresa
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </Card>
  )
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-ink-300">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ink-50 outline-none focus:border-action-400 focus:ring-1 focus:ring-action-400"
      />
    </div>
  )
}
