import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase/client'
import { useAuthStore } from '../../lib/stores/auth'
import { callFunction, userAdmin, generatePassword } from '../../lib/edge'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { PasswordModal, ToggleModal, DeleteModal } from '../../components/admin/UserModals'
import { Field, SelectField, FormError } from '../../components/ui/Field'
import {
  IconUsers,
  IconPlus,
  IconSearch,
  IconEdit,
  IconTrash,
  IconKey,
  IconPower,
} from '../../components/ui/icons'

interface GuardRow {
  id: string
  name: string
  phone: string | null
  documentId: string | null
  badge: string | null
  active: boolean
  serviceId: string | null
  routeIds: string[]
}

interface Option {
  id: string
  name: string
}

type Filter = 'activos' | 'inactivos' | 'todos'

type ModalState =
  | { type: 'new' }
  | { type: 'edit'; guard: GuardRow }
  | { type: 'password'; guard: GuardRow }
  | { type: 'toggle'; guard: GuardRow }
  | { type: 'delete'; guard: GuardRow }
  | null

/**
 * Vigilantes: alta, edición, desactivación, cambio de contraseña y borrado.
 *
 * Desactivar es la acción normal para "dar de baja" a alguien: bloquea su
 * acceso y lo saca de las rondas, pero conserva todo lo que hizo. Eliminar
 * existe solo para errores de digitación (alguien creado por equivocación que
 * nunca registró nada); si la persona ya tiene historial, el servidor lo
 * rechaza y explica por qué.
 */
export function AdminGuards() {
  const companyId = useAuthStore((s) => s.profile?.company_id)
  const [guards, setGuards] = useState<GuardRow[]>([])
  const [services, setServices] = useState<Option[]>([])
  const [routes, setRoutes] = useState<Option[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('activos')
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
    setLoadError(null)
    const [g, s, r, rg] = await Promise.all([
      supabase
        .from('guards')
        .select('id, badge_code, is_active, default_service_id, user_profiles(full_name, phone, document_id)')
        .eq('company_id', cid),
      supabase.from('services').select('id, name').eq('company_id', cid).eq('is_active', true).order('name'),
      supabase.from('routes').select('id, name').eq('company_id', cid).eq('is_active', true).order('name'),
      supabase.from('route_guards').select('route_id, guard_id').eq('company_id', cid),
    ])

    if (g.error) {
      setLoadError('No se pudieron cargar los vigilantes. Revisa tu conexión e intenta de nuevo.')
      setLoading(false)
      return
    }

    const routeIdsByGuard = new Map<string, string[]>()
    for (const row of rg.data ?? []) {
      const list = routeIdsByGuard.get(row.guard_id) ?? []
      list.push(row.route_id)
      routeIdsByGuard.set(row.guard_id, list)
    }

    const rows: GuardRow[] = (g.data ?? []).map((row) => {
      const up = Array.isArray(row.user_profiles) ? row.user_profiles[0] : row.user_profiles
      return {
        id: row.id,
        name: up?.full_name ?? '—',
        phone: up?.phone ?? null,
        documentId: up?.document_id ?? null,
        badge: row.badge_code,
        active: row.is_active ?? true,
        serviceId: row.default_service_id,
        routeIds: routeIdsByGuard.get(row.id) ?? [],
      }
    })
    rows.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'es'))

    setGuards(rows)
    setServices(s.data ?? [])
    setRoutes(r.data ?? [])
    setLoading(false)
  }

  const counts = useMemo(
    () => ({
      activos: guards.filter((g) => g.active).length,
      inactivos: guards.filter((g) => !g.active).length,
      todos: guards.length,
    }),
    [guards],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return guards.filter((g) => {
      if (filter === 'activos' && !g.active) return false
      if (filter === 'inactivos' && g.active) return false
      if (!q) return true
      return (
        g.name.toLowerCase().includes(q) ||
        (g.badge ?? '').toLowerCase().includes(q) ||
        (g.documentId ?? '').toLowerCase().includes(q) ||
        (g.phone ?? '').toLowerCase().includes(q)
      )
    })
  }, [guards, query, filter])

  const routeName = (id: string) => routes.find((r) => r.id === id)?.name ?? 'Ronda'

  function done(message: string) {
    setModal(null)
    setNotice(message)
    if (companyId) void load(companyId)
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink-50">Vigilantes</h2>
          <p className="mt-1 text-sm text-ink-400">
            Crea, edita y da de baja al personal operativo. Dar de baja conserva todo su historial.
          </p>
        </div>
        <Button onClick={() => setModal({ type: 'new' })}>
          <IconPlus /> Nuevo vigilante
        </Button>
      </div>

      {notice && (
        <p role="status" className="mt-4 rounded-lg bg-ok-500/10 px-3 py-2 text-sm text-ok-400">
          {notice}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500">
            <IconSearch width={16} height={16} />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, código, documento o teléfono…"
            className="w-full rounded-lg border border-ink-700 bg-ink-900 py-2.5 pl-9 pr-3 text-sm text-ink-50 outline-none focus:border-action-500"
          />
        </div>
        <div className="flex gap-1 rounded-lg bg-ink-900 p-1 ring-1 ring-inset ring-ink-700" role="tablist">
          {(['activos', 'inactivos', 'todos'] as Filter[]).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold capitalize md:flex-none ${
                filter === f ? 'bg-action-500 text-ink-950' : 'text-ink-300 hover:text-ink-50'
              }`}
            >
              {f} ({counts[f]})
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {loading ? (
          <p className="text-sm text-ink-400">Cargando…</p>
        ) : loadError ? (
          <EmptyState
            title="No se pudo cargar"
            description={loadError}
            action={<Button onClick={() => companyId && void load(companyId)}>Reintentar</Button>}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<IconUsers width={32} height={32} />}
            title={guards.length === 0 ? 'Sin vigilantes registrados' : 'Nadie coincide con ese filtro'}
            description={
              guards.length === 0
                ? 'Crea tu primer vigilante para poder asignarle rondas.'
                : 'Prueba con otra búsqueda o cambia entre Activos, Inactivos y Todos.'
            }
          />
        ) : (
          <>
            {/* Escritorio: tabla */}
            <Card className="hidden overflow-hidden md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-800 text-xs uppercase tracking-wide text-ink-500">
                    <th className="px-5 py-3 font-medium">Vigilante</th>
                    <th className="px-5 py-3 font-medium">Código</th>
                    <th className="px-5 py-3 font-medium">Rondas</th>
                    <th className="px-5 py-3 font-medium">Estado</th>
                    <th className="px-5 py-3 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((g) => (
                    <tr key={g.id} className="border-b border-ink-800 last:border-0">
                      <td className="px-5 py-3">
                        <p className="font-medium text-ink-50">{g.name}</p>
                        <p className="text-xs text-ink-500">
                          {[g.documentId, g.phone].filter(Boolean).join(' · ') || 'Sin documento ni teléfono'}
                        </p>
                      </td>
                      <td className="px-5 py-3 font-mono text-ink-300">{g.badge ?? '—'}</td>
                      <td className="px-5 py-3 text-ink-300">
                        {g.routeIds.length === 0 ? (
                          <span className="text-warn-400">Sin ronda asignada</span>
                        ) : (
                          g.routeIds.map(routeName).join(', ')
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={g.active ? 'ok' : 'idle'}>{g.active ? 'Activo' : 'Inactivo'}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <Actions guard={g} onAction={setModal} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            {/* Celular: tarjetas */}
            <div className="space-y-3 md:hidden">
              {visible.map((g) => (
                <Card key={g.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-50">{g.name}</p>
                      <p className="truncate text-xs text-ink-500">
                        {[g.badge && `Código ${g.badge}`, g.documentId, g.phone].filter(Boolean).join(' · ') ||
                          'Sin datos de contacto'}
                      </p>
                    </div>
                    <Badge tone={g.active ? 'ok' : 'idle'}>{g.active ? 'Activo' : 'Inactivo'}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-ink-400">
                    {g.routeIds.length === 0 ? (
                      <span className="text-warn-400">Sin ronda asignada</span>
                    ) : (
                      g.routeIds.map(routeName).join(', ')
                    )}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1 border-t border-ink-800 pt-3">
                    <Actions guard={g} onAction={setModal} labels />
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>

      {modal?.type === 'new' && companyId && (
        <GuardFormModal
          mode="new"
          companyId={companyId}
          services={services}
          routes={routes}
          onClose={() => setModal(null)}
          onSaved={() => companyId && void load(companyId)}
        />
      )}
      {modal?.type === 'edit' && companyId && (
        <GuardFormModal
          mode="edit"
          guard={modal.guard}
          companyId={companyId}
          services={services}
          routes={routes}
          onClose={() => setModal(null)}
          onSaved={() => done('Cambios guardados.')}
        />
      )}
      {modal?.type === 'password' && (
        <PasswordModal person={{ id: modal.guard.id, name: modal.guard.name, active: modal.guard.active }} onClose={() => setModal(null)} onDone={() => done('Contraseña actualizada.')} />
      )}
      {modal?.type === 'toggle' && (
        <ToggleModal
          person={{ id: modal.guard.id, name: modal.guard.name, active: modal.guard.active }}
          kind="guard"
          onClose={() => setModal(null)}
          onDone={(active) =>
            done(active ? `${modal.guard.name} fue reactivado.` : `${modal.guard.name} fue desactivado.`)
          }
        />
      )}
      {modal?.type === 'delete' && (
        <DeleteModal
          person={{ id: modal.guard.id, name: modal.guard.name, active: modal.guard.active }}
          onClose={() => setModal(null)}
          onDone={() => done(`${modal.guard.name} fue eliminado.`)}
        />
      )}
    </div>
  )
}

function Actions({
  guard,
  onAction,
  labels,
}: {
  guard: GuardRow
  onAction: (m: ModalState) => void
  labels?: boolean
}) {
  return (
    <>
      <ActionButton label="Editar" onClick={() => onAction({ type: 'edit', guard })} showLabel={labels}>
        <IconEdit width={16} height={16} />
      </ActionButton>
      <ActionButton label="Contraseña" onClick={() => onAction({ type: 'password', guard })} showLabel={labels}>
        <IconKey width={16} height={16} />
      </ActionButton>
      <ActionButton
        label={guard.active ? 'Desactivar' : 'Reactivar'}
        onClick={() => onAction({ type: 'toggle', guard })}
        showLabel={labels}
      >
        <IconPower width={16} height={16} />
      </ActionButton>
      <ActionButton label="Eliminar" danger onClick={() => onAction({ type: 'delete', guard })} showLabel={labels}>
        <IconTrash width={16} height={16} />
      </ActionButton>
    </>
  )
}

function ActionButton({
  label,
  onClick,
  children,
  danger,
  showLabel,
}: {
  label: string
  onClick: () => void
  children: ReactNode
  danger?: boolean
  showLabel?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${
        danger ? 'text-danger-400 hover:bg-danger-500/10' : 'text-ink-300 hover:bg-ink-800 hover:text-ink-50'
      }`}
    >
      {children}
      {showLabel && <span>{label}</span>}
    </button>
  )
}

/* ------------------------------------------------------------------ Alta / edición */

function GuardFormModal({
  mode,
  guard,
  companyId,
  services,
  routes,
  onClose,
  onSaved,
}: {
  mode: 'new' | 'edit'
  guard?: GuardRow
  companyId: string
  services: Option[]
  routes: Option[]
  onClose: () => void
  onSaved: () => void
}) {
  const [fullName, setFullName] = useState(guard?.name ?? '')
  const [documentId, setDocumentId] = useState(guard?.documentId ?? '')
  const [phone, setPhone] = useState(guard?.phone ?? '')
  const [badge, setBadge] = useState(guard?.badge ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(mode === 'new' ? generatePassword() : '')
  const [serviceId, setServiceId] = useState(guard?.serviceId ?? '')
  const [routeIds, setRouteIds] = useState<string[]>(guard?.routeIds ?? (routes.length === 1 ? [routes[0].id] : []))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ email: string; password: string; name: string } | null>(null)

  function toggleRoute(id: string) {
    setRouteIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
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
          role: 'guard',
          company_id: companyId,
          badge_code: badge || null,
          default_service_id: serviceId || null,
        })
        if (routeIds.length > 0) {
          await userAdmin.update(res.user_id, { route_ids: routeIds })
        }
        setCreated({ email: email.trim().toLowerCase(), password, name: fullName.trim() })
        onSaved()
      } else if (guard) {
        const fields: Record<string, unknown> = {
          full_name: fullName,
          phone,
          document_id: documentId,
          badge_code: badge,
          default_service_id: serviceId || null,
          route_ids: routeIds,
        }
        if (email.trim()) fields.email = email
        await userAdmin.update(guard.id, fields)
        onSaved()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  // Pantalla de éxito tras crear: es el único momento en que se ve la contraseña.
  if (created) {
    const text = `Acceso a ControlGuard\nUsuario: ${created.email}\nContraseña: ${created.password}`
    return (
      <Modal
        title="Vigilante creado"
        onClose={onClose}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => void navigator.clipboard?.writeText(text)}
            >
              Copiar datos
            </Button>
            <Button onClick={onClose}>Listo</Button>
          </>
        }
      >
        <p className="text-sm text-ink-200">
          {created.name} ya puede entrar a la app. Entrégale estos datos; es la única vez que se muestra la
          contraseña (después solo se puede cambiar por una nueva).
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

  const canSave =
    fullName.trim().length > 0 && (mode === 'edit' || (email.trim().length > 0 && password.length >= 8))

  return (
    <Modal
      title={mode === 'new' ? 'Nuevo vigilante' : `Editar a ${guard?.name}`}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={saving} disabled={!canSave}>
            {mode === 'new' ? 'Crear vigilante' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre completo" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
        <Field label="Cédula / documento" value={documentId} onChange={(e) => setDocumentId(e.target.value)} inputMode="numeric" />
        <Field label="Teléfono" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        <Field label="Código / carné" value={badge} onChange={(e) => setBadge(e.target.value)} />
        <Field
          label={mode === 'new' ? 'Correo (para iniciar sesión)' : 'Correo nuevo (opcional)'}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
          hint={mode === 'edit' ? 'Déjalo vacío para conservar el actual.' : undefined}
        />
        {mode === 'new' && (
          <div>
            <Field
              label="Contraseña temporal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              hint="Mínimo 8 caracteres."
            />
            <button
              type="button"
              onClick={() => setPassword(generatePassword())}
              className="mt-1 text-xs text-action-400 hover:underline"
            >
              Generar otra
            </button>
          </div>
        )}
        <SelectField
          label="Servicio principal (opcional)"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          className="sm:col-span-2"
        >
          <option value="">Sin asignar</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
      </div>

      <fieldset className="mt-5">
        <legend className="text-xs font-medium text-ink-300">Rondas que hace este vigilante</legend>
        <p className="mt-1 text-xs text-ink-500">
          El sistema le genera su ronda cada día según el horario de la ronda. Sin ronda asignada no recibe nada.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {routes.length === 0 && <p className="text-xs text-ink-500">Aún no hay rondas creadas.</p>}
          {routes.map((r) => {
            const on = routeIds.includes(r.id)
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleRoute(r.id)}
                className={`rounded-full px-3.5 py-2 text-xs font-semibold ${
                  on ? 'bg-action-500 text-ink-950' : 'bg-ink-800 text-ink-300 ring-1 ring-inset ring-ink-600'
                }`}
              >
                {r.name}
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="mt-4">
        <FormError message={error} />
      </div>
    </Modal>
  )
}
