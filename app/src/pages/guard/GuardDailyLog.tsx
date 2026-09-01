import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase/client'
import { useAuthStore } from '../../lib/stores/auth'
import { Button } from '../../components/ui/Button'
import { IconChevronLeft } from '../../components/ui/icons'
import { enqueueEvent } from '../../lib/offline/db'

interface Item { item: string; qty: number; ok: boolean }

// Postgres/Supabase tipa items_received como Json, que exige que cada objeto
// tenga firma de índice de tipo string. Item ya cumple esa forma en runtime
// (solo tiene claves string/number/boolean), así que este helper documenta
// la conversión explícita en el único lugar donde cruza el límite hacia la
// base de datos, en vez de forzar una firma de índice artificial en Item
// (eso rompía la inferencia de Partial<Item> en updateItem).
function itemsToJson(items: Item[]): { item: string; qty: number; ok: boolean }[] {
  return items.map((i) => ({ item: i.item, qty: i.qty, ok: i.ok }))
}

export function GuardDailyLog() {
  const { profile } = useAuthStore()
  const navigate = useNavigate()
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [logType, setLogType] = useState<'handover' | 'receipt'>('handover')
  const [postCondition, setPostCondition] = useState('')
  const [observations, setObservations] = useState('')
  const [items, setItems] = useState<Item[]>([{ item: '', qty: 1, ok: true }])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!profile) return
    supabase.from('guards').select('default_service_id').eq('id', profile.id).single().then(({ data }) => {
      setServiceId(data?.default_service_id ?? null)
    })
  }, [profile])

  function updateItem(i: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }

  async function submit() {
    if (!profile || !serviceId || !profile.company_id) return
    setSaving(true)
    const payload = {
      company_id: profile.company_id,
      service_id: serviceId,
      guard_id: profile.id,
      log_type: logType,
      post_condition: postCondition,
      items_received: itemsToJson(items.filter((i) => i.item.trim())),
      observations,
      signed_by_name: profile.full_name,
    }

    try {
      if (navigator.onLine) {
        const { error } = await supabase.from('daily_logs').insert({ ...payload, client_event_id: crypto.randomUUID() })
        if (error) throw error
      } else {
        await enqueueEvent('daily_log', payload)
      }
      setSaved(true)
    } catch {
      alert('No se pudo guardar la minuta. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 bg-ink-950 px-5 text-center">
        <p className="text-lg font-bold text-ink-50">Minuta guardada</p>
        <p className="text-sm text-ink-400">{navigator.onLine ? 'Registrada correctamente.' : 'Se sincronizará cuando recuperes conexión.'}</p>
        <Button className="mt-4" onClick={() => navigate('/guard')}>Volver al inicio</Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-ink-950 px-5 pb-8 pt-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-ink-400">
        <IconChevronLeft width={16} height={16} /> Volver
      </button>
      <h1 className="mt-4 text-lg font-bold text-ink-50">Minuta digital</h1>

      <div className="mt-5 flex gap-2 rounded-lg bg-ink-800 p-1">
        <button onClick={() => setLogType('handover')} className={`flex-1 rounded-md py-2 text-xs font-semibold ${logType === 'handover' ? 'bg-action-400 text-ink-950' : 'text-ink-300'}`}>Entrega de turno</button>
        <button onClick={() => setLogType('receipt')} className={`flex-1 rounded-md py-2 text-xs font-semibold ${logType === 'receipt' ? 'bg-action-400 text-ink-950' : 'text-ink-300'}`}>Recibo de turno</button>
      </div>

      <div className="mt-5">
        <label className="text-xs font-semibold text-ink-500">Estado del puesto</label>
        <textarea value={postCondition} onChange={(e) => setPostCondition(e.target.value)} rows={2} className="mt-2 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm text-ink-50 outline-none focus:border-action-400" />
      </div>

      <div className="mt-5">
        <label className="text-xs font-semibold text-ink-500">Elementos recibidos</label>
        {items.map((it, i) => (
          <div key={i} className="mt-2 flex gap-2">
            <input value={it.item} onChange={(e) => updateItem(i, { item: e.target.value })} placeholder="Radio, linterna…" className="flex-1 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-50 outline-none focus:border-action-400" />
            <input type="number" value={it.qty} onChange={(e) => updateItem(i, { qty: Number(e.target.value) })} className="w-16 rounded-lg border border-ink-700 bg-ink-900 px-2 py-2 text-sm text-ink-50 outline-none focus:border-action-400" />
          </div>
        ))}
        <button onClick={() => setItems((p) => [...p, { item: '', qty: 1, ok: true }])} className="mt-2 text-xs text-action-400">+ Agregar elemento</button>
      </div>

      <div className="mt-5">
        <label className="text-xs font-semibold text-ink-500">Observaciones</label>
        <textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm text-ink-50 outline-none focus:border-action-400" />
      </div>

      <div className="mt-5 rounded-xl border border-ink-700 bg-ink-900 px-4 py-3">
        <p className="text-xs text-ink-500">Firma / confirmación digital</p>
        <p className="mt-1 text-sm font-semibold text-ink-100">{profile?.full_name}</p>
      </div>

      <Button size="lg" className="mt-8 w-full" onClick={submit} loading={saving} disabled={!serviceId}>
        Guardar minuta
      </Button>
    </div>
  )
}
