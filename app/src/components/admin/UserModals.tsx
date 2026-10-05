import { useState } from 'react'
import { userAdmin, generatePassword } from '../../lib/edge'
import { Button } from '../ui/Button'
import { Modal, ConfirmDialog } from '../ui/Modal'
import { Field, FormError } from '../ui/Field'

/** Datos mínimos de una persona (vigilante o supervisor) para estas ventanas. */
export interface Person {
  id: string
  name: string
  active: boolean
}

/* ------------------------------------------------------------------ Contraseña */

export function PasswordModal({ person, onClose, onDone }: { person: Person; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState(generatePassword())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [changed, setChanged] = useState(false)

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      await userAdmin.resetPassword(person.id, password)
      setChanged(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la contraseña.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Nueva contraseña para ${person.name}`}
      onClose={changed ? onDone : onClose}
      footer={
        changed ? (
          <>
            <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(password)}>
              Copiar contraseña
            </Button>
            <Button onClick={onDone}>Listo</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={submit} loading={saving} disabled={password.length < 8}>
              Cambiar contraseña
            </Button>
          </>
        )
      }
    >
      {changed ? (
        <>
          <p className="text-sm text-ink-200">Contraseña cambiada. Entrégasela a {person.name}:</p>
          <p className="mt-3 break-all rounded-lg bg-ink-800 p-4 font-mono text-sm text-ink-50">{password}</p>
        </>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-300">
            Su contraseña actual deja de servir. Si ya tenía la sesión abierta en el celular, seguirá abierta hasta
            que salga o expire.
          </p>
          <Field label="Contraseña nueva" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
          <button
            type="button"
            onClick={() => setPassword(generatePassword())}
            className="text-xs text-action-400 hover:underline"
          >
            Generar otra
          </button>
          <FormError message={error} />
        </div>
      )}
    </Modal>
  )
}

/* ------------------------------------------------------------------ Activar / desactivar */

export function ToggleModal({
  person,
  kind,
  onClose,
  onDone,
}: {
  person: Person
  /** Cambia el texto de las consecuencias según el rol. */
  kind: 'guard' | 'supervisor'
  onClose: () => void
  onDone: (active: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const target = !person.active

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await userAdmin.setActive(person.id, target)
      onDone(target)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado.')
      setBusy(false)
    }
  }

  return (
    <ConfirmDialog
      title={target ? `Reactivar a ${person.name}` : `Desactivar a ${person.name}`}
      confirmLabel={target ? 'Reactivar' : 'Desactivar'}
      danger={!target}
      busy={busy}
      error={error}
      onConfirm={confirm}
      onClose={onClose}
      message={
        target ? (
          <p>
            {person.name} podrá volver a iniciar sesión con su misma contraseña
            {kind === 'guard' ? ' y recibirá sus rondas otra vez.' : '.'}
          </p>
        ) : (
          <>
            <p>Al desactivar a {person.name}:</p>
            <ul className="list-disc space-y-1 pl-5 text-ink-300">
              <li>No podrá iniciar sesión.</li>
              {kind === 'guard' ? (
                <>
                  <li>Deja de recibir rondas nuevas.</li>
                  <li>Sus rondas de hoy que no han empezado se cancelan; una ronda a medias se cierra como incompleta.</li>
                  <li>Todo su historial (escaneos, novedades, rondas) se conserva.</li>
                </>
              ) : (
                <li>Todo lo que revisó o atendió (novedades, alertas) se conserva.</li>
              )}
            </ul>
            <p>Puedes reactivarlo cuando quieras.</p>
          </>
        )
      }
    />
  )
}

/* ------------------------------------------------------------------ Eliminar */

export function DeleteModal({ person, onClose, onDone }: { person: Person; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await userAdmin.remove(person.id)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar.')
      setBusy(false)
    }
  }

  return (
    <ConfirmDialog
      title={`Eliminar a ${person.name}`}
      confirmLabel="Eliminar definitivamente"
      danger
      busy={busy}
      error={error}
      onConfirm={confirm}
      onClose={onClose}
      message={
        <>
          <p>
            Esto borra la cuenta de {person.name} para siempre y no se puede deshacer.
          </p>
          <p className="text-ink-300">
            Solo funciona si nunca registró nada (por ejemplo, alguien creado por equivocación). Si ya tiene rondas,
            escaneos o novedades, el sistema no lo borra y te sugiere desactivarlo, para no perder el historial.
          </p>
        </>
      }
    />
  )
}
