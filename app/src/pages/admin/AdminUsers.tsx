import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import { useAuthStore } from '../../lib/stores/auth'
import { callFunction, userAdmin, generatePassword } from '../../lib/edge'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Field, FormError } from '../../components/ui/Field'
import { PasswordModal, ToggleModal, DeleteModal } from '../../components/admin/UserModals'
import { IconPlus, IconEdit, IconKey, IconPower, IconTrash } from '../../components/ui/icons'
import { ROLE_LABELS } from '../../lib/types/domain'
import type { UserProfile, ServiceRow } from '../../lib/types/domain'

type ModalState =
  | { type: 'new' }
  | { type: 'edit'; user: UserProfile }
  | { type: 'password'; user: UserProfile }
  | { type: 'toggle'; user: UserProfile }
  | { type: 'delete'; user: UserProfile }
  | null

/**
 * Usuarios del panel: supervisores y administradores.
 * Los supervisores se pueden editar, desactivar, cambiar de contraseña y
 * eliminar. Los administradores se listan pero no se tocan desde aquí.
 */
export function AdminUsers() {
  const profile = useAuthStore((s) => s.profile)
  const companyId = profile?.company_id
  const [users, setUsers] = useState<UserProfile[]>([])
  const [services, setServices] = useState<ServiceRow[]>([])
  const [loading, setLoading] = useState(true)
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
    const [u, s] = await Promise.all([
      supabase
        .from('user_profiles')
        .select('*')
        .eq('company_id', cid)
        .in('role', ['supervisor', 'admin'])
        .order('full_name'),
      supabase.from('services').select('*').eq('company_id', cid).eq('is_active', true).order('name'),
    ])
    setUsers(u.data ?? [])
    setServices(s.data ?? [])
    setLoading(false)
  }

  function done(message: string) {
    setModal(null)
    setNotice(message)
    if (companyId) void load(companyId)
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink-50">Usuarios</h2>
          <p className="mt-1 text-sm text-ink-400">Supervisores y administradores con acceso al panel.</p>
        </div>
        <Button onClick={() => setModal({ type: 'new' })}>
          <IconPlus /> Nuevo supervisor
        </Button>
      </div>

      {notice && (
        <p role="status" className="mt-4 rounded-lg bg-ok-500/10 px-3 py-2 text-sm text-ok-400">
          {notice}
        </p>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-ink-400">Cargando…</p>
        ) : (
          <>
            <Card className="hidden overflow-hidden md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-800 text-xs uppercase tracking-wide text-ink-500">
                    <th className="px-5 py-3 font-medium">Nombre</th>
                    <th className="px-5 py-3 font-medium">Rol</th>
                    <th className="px-5 py-3 font-medium">Teléfono</th>
                    <th className="px-5 py-3 font-medium">Estado</th>
                    <th className="px-5 py-3 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-ink-800 last:border-0">
                      <td className="px-5 py-3 font-medium text-ink-50">
                        {u.full_name}
                        {u.id === profile?.id && <span className="ml-2 text-xs text-ink-500">(tú)</span>}
                      </td>
                      <td className="px-5 py-3 text-ink-300">{ROLE_LABELS[u.role]}</td>
                      <td className="px-5 py-3 text-ink-300">{u.phone ?? '—'}</td>
                      <td className="px-5 py-3">
                        <Badge tone={u.is_active ? 'ok' : 'idle'}>{u.is_active ? 'Activo' : 'Inactivo'}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <RowActions user={u} onAction={setModal} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <div className="space-y-3 md:hidden">
              {users.map((u) => (
                <Card key={u.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-50">{u.full_name}</p>
                      <p className="text-xs text-ink-500">
                        {ROLE_LABELS[u.role]}
                        {u.phone ? ` · ${u.phone}` : ''}
                      </p>
                    </div>
                    <Badge tone={u.is_active ? 'ok' : 'idle'}>{u.is_active ? 'Activo' : 'Inactivo'}</Badge>
                  </div>
                  {u.role === 'supervisor' && (
                    <div className="mt-3 flex flex-wrap gap-1 border-t border-ink-800 pt-3">
                      <RowActions user={u} onAction={setModal} labels />
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </>
        )}
      </div>

      {modal?.type === 'new' && companyId && (
        <SupervisorFormModal
          mode="new"
          companyId={companyId}
          services={services}
          onClose={() => setModal(null)}
          onSaved={() => companyId && void load(companyId)}
        />
      )}
      {modal?.type === 'edit' && companyId && (
        <SupervisorFormModal
          mode="edit"
          user={modal.user}
          companyId={companyId}
          services={services}
          onClose={() => setModal(null)}
          onSaved={() => done('Cambios guardados.')}
        />
      )}
      {modal?.type === 'password' && (
        <PasswordModal
          person={{ id: modal.user.id, name: modal.user.full_name, active: modal.user.is_active ?? true }}
          onClose={() => setModal(null)}
          onDone={() => done('Contraseña actualizada.')}
        />
      )}
      {modal?.type === 'toggle' && (
        <ToggleModal
          person={{ id: modal.user.id, name: modal.user.full_name, active: modal.user.is_active ?? true }}
          kind="supervisor"
          onClose={() => setModal(null)}
          onDone={(active) =>
            done(active ? `${modal.user.full_name} fue reactivado.` : `${modal.user.full_name} fue desactivado.`)
          }
        />
      )}
      {modal?.type === 'delete' && (
        <DeleteModal
          person={{ id: modal.user.id, name: modal.user.full_name, active: modal.user.is_active ?? true }}
          onClose={() => setModal(null)}
          onDone={() => done(`${modal.user.full_name} fue eliminado.`)}
        />
      )}
    </div>
  )
}

function RowActions({
  user,
  onAction,
  labels,
}: {
  user: UserProfile
  onAction: (m: ModalState) => void
  labels?: boolean
}) {
  if (user.role !== 'supervisor') return <span className="px-2 text-xs text-ink-600">—</span>
  const btn = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium'
  return (
    <>
      <button className={`${btn} text-ink-300 hover:bg-ink-800 hover:text-ink-50`} title="Editar" aria-label="Editar" onClick={() => onAction({ type: 'edit', user })}>
        <IconEdit width={16} height={16} />
        {labels && 'Editar'}
      </button>
      <button className={`${btn} text-ink-300 hover:bg-ink-800 hover:text-ink-50`} title="Contraseña" aria-label="Contraseña" onClick={() => onAction({ type: 'password', user })}>
        <IconKey width={16} height={16} />
        {labels && 'Contraseña'}
      </button>
      <button
        className={`${btn} text-ink-300 hover:bg-ink-800 hover:text-ink-50`}
        title={user.is_active ? 'Desactivar' : 'Reactivar'}
        aria-label={user.is_active ? 'Desactivar' : 'Reactivar'}
        onClick={() => onAction({ type: 'toggle', user })}
      >
        <IconPower width={16} height={16} />
        {labels && (user.is_active ? 'Desactivar' : 'Reactivar')}
      </button>
      <button className={`${btn} text-danger-400 hover:bg-danger-500/10`} title="Eliminar" aria-label="Eliminar" onClick={() => onAction({ type: 'delete', user })}>
        <IconTrash width={16} height={16} />
        {labels && 'Eliminar'}
      </button>
    </>
  )
}

function SupervisorFormModal({
  mode,
  user,
  companyId,
  services,
  onClose,
  onSaved,
}: {
  mode: 'new' | 'edit'
  user?: UserProfile
  companyId: string
  services: ServiceRow[]
  onClose: () => void
  onSaved: () => void
}) {
  const [fullName, setFullName] = useState(user?.full_name ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [documentId, setDocumentId] = useState(user?.document_id ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(mode === 'new' ? generatePassword() : '')
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ email: string; password: string; name: string } | null>(null)

  // Servicios que ya supervisa (solo al editar).
  useEffect(() => {
    if (mode !== 'edit' || !user) return
    void supabase
      .from('supervisor_services')
      .select('service_id')
      .eq('supervisor_id', user.id)
      .then(({ data }) => setSelected((data ?? []).map((r) => r.service_id)))
  }, [mode, user])

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function syncServices(supervisorId: string) {
    const { data: current } = await supabase
      .from('supervisor_services')
      .select('service_id')
      .eq('supervisor_id', supervisorId)
    const have = new Set((current ?? []).map((r) => r.service_id))
    const toAdd = selected.filter((id) => !have.has(id))
    const toRemove = [...have].filter((id) => !selected.includes(id))
    if (toAdd.length > 0) {
      const { error: e } = await supabase
        .from('supervisor_services')
        .insert(toAdd.map((sid) => ({ supervisor_id: supervisorId, service_id: sid, company_id: companyId })))
      if (e) throw new Error('No se pudieron asignar los servicios.')
    }
    if (toRemove.length > 0) {
      await supabase.from('supervisor_services').delete().eq('supervisor_id', supervisorId).in('service_id', toRemove)
    }
  }

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      if (mode === 'new') {
        const res = await callFunction<{ user_id: string }>('admin-provision-user', {
          email,
          password,
          full_name: fullName,
          phone: phone || null,
          document_id: documentId || null,
          role: 'supervisor',
          company_id: companyId,
        })
        if (selected.length > 0) await syncServices(res.user_id)
        setCreated({ email: email.trim().toLowerCase(), password, name: fullName.trim() })
        onSaved()
      } else if (user) {
        const fields: Record<string, unknown> = { full_name: fullName, phone, document_id: documentId }
        if (email.trim()) fields.email = email
        await userAdmin.update(user.id, fields)
        await syncServices(user.id)
        onSaved()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  if (created) {
    const text = `Acceso a ControlGuard\nUsuario: ${created.email}\nContraseña: ${created.password}`
    return (
      <Modal
        title="Supervisor creado"
        onClose={onClose}
        footer={
          <>
            <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(text)}>
              Copiar datos
            </Button>
            <Button onClick={onClose}>Listo</Button>
          </>
        }
      >
        <p className="text-sm text-ink-200">
          {created.name} ya puede entrar al panel. Entrégale estos datos; es la única vez que se muestra la contraseña.
        </p>
        <dl className="mt-4 space-y-2 rounded-lg bg-ink-800 p-4 font-mono text-sm">
          <div>
            <dt className="text-xs text-ink-500">Usuario</dt>
            <dd className="break-all text-ink-50">{created.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Contraseña</dt>
            <dd className="break-all text-ink-50">{created.password}</dd>
          </div>
        </dl>
      </Modal>
    )
  }

  const canSave = fullName.trim().length > 0 && (mode === 'edit' || (email.trim().length > 0 && password.length >= 8))

  return (
    <Modal
      title={mode === 'new' ? 'Nuevo supervisor' : `Editar a ${user?.full_name}`}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={saving} disabled={!canSave}>
            {mode === 'new' ? 'Crear supervisor' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre completo" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
        <Field label="Cédula / documento" value={documentId} onChange={(e) => setDocumentId(e.target.value)} inputMode="numeric" />
        <Field label="Teléfono" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        <Field
          label={mode === 'new' ? 'Correo (para iniciar sesión)' : 'Correo nuevo (opcional)'}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
          hint={mode === 'edit' ? 'Déjalo vacío para conservar el actual.' : undefined}
        />
        {mode === 'new' && (
          <div className="sm:col-span-2">
            <Field
              label="Contraseña temporal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              hint="Mínimo 8 caracteres."
            />
            <button type="button" onClick={() => setPassword(generatePassword())} className="mt-1 text-xs text-action-400 hover:underline">
              Generar otra
            </button>
          </div>
        )}
      </div>

      {services.length > 0 && (
        <fieldset className="mt-5">
          <legend className="text-xs font-medium text-ink-300">Servicios que supervisa</legend>
          <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {services.map((s) => {
              const on = selected.includes(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(s.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    on ? 'bg-action-500 text-ink-950' : 'bg-ink-800 text-ink-300 ring-1 ring-inset ring-ink-600'
                  }`}
                >
                  {s.name}
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      <div className="mt-4">
        <FormError message={error} />
      </div>
    </Modal>
  )
}
