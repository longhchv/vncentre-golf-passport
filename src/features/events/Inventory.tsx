import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { PackageCheck, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Checkbox, Field, FormError, Input, Select } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'

export interface InvItem {
  id: string; category: 'equipment' | 'gift' | 'supply'; box: string | null; name: string; unit: string | null
  qty_out: number; qty_returned: number | null; qty_damaged: number; points: number | null; role_code: string | null
  packed: boolean; note: string | null; given: number; remaining: number; missing: number | null; surplus: number | null
}

const rpc = async <T,>(fn: string, args: Record<string, unknown>) => {
  const { data, error } = await supabase!.rpc(fn, args)
  if (error) throw error
  return data as T
}
const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.floor(Number(v)) || 0))

/**
 * Kho sự kiện: xuất kho (gậy, thảm, bóng…, quà), đóng thùng, quà đã phát / còn lại (trừ tự động ở quầy),
 * kiểm kê khi trả về kho: trả, hỏng, thiếu.
 */
export function InventoryPanel({ eventId }: { eventId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const key = ['inv_list', eventId]
  const list = useQuery({ queryKey: key, refetchInterval: 30_000, queryFn: () => rpc<InvItem[]>('inv_list', { p_event_id: eventId }) })
  const seed = useMutation({
    mutationFn: () => rpc<number>('inv_seed_from_template', { p_event_id: eventId }),
    onSuccess: (n) => { toast(t('inv.seeded', { n })); qc.invalidateQueries({ queryKey: key }) },
  })
  const [adding, setAdding] = useState(false)
  const items = list.data ?? []
  const groups: InvItem['category'][] = ['gift', 'equipment', 'supply']
  const missing = items.reduce((s, i) => s + (i.missing ?? 0), 0)
  const notChecked = items.filter((i) => i.qty_out > 0 && i.qty_returned == null).length

  return (
    <div className="space-y-4">
      <Card className="space-y-2 p-4 text-sm">
        <p>{t('inv.hint')}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={seed.isPending} onClick={() => seed.mutate()}><PackageCheck className="h-4 w-4" /> {t('inv.seed')}</Button>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('inv.add')}</Button>
        </div>
        {items.length > 0 && (
          <p className="font-semibold">
            {t('inv.summary', { n: items.length, packed: items.filter((i) => i.packed).length, notChecked })}
            {missing > 0 && <span className="text-red-700"> · {t('inv.missingTotal', { n: missing })}</span>}
          </p>
        )}
      </Card>
      {adding && <AddItem eventId={eventId} onDone={() => { setAdding(false); qc.invalidateQueries({ queryKey: key }) }} />}
      {groups.map((g) => {
        const rows = items.filter((i) => i.category === g)
        if (!rows.length) return null
        return (
          <Card key={g} className="space-y-2 p-4">
            <p className="font-bold">{t(`inv.category.${g}`)}</p>
            <ul className="divide-y divide-navy/10">{rows.map((i) => <ItemRow key={i.id} item={i} eventId={eventId} />)}</ul>
          </Card>
        )
      })}
      <FormError message={list.isError ? (list.error as Error).message : null} />
    </div>
  )
}

function ItemRow({ item: i, eventId }: { item: InvItem; eventId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) => rpc('inv_save_item', { p_event_id: eventId, p_item: { id: i.id, ...patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv_list', eventId] }),
    onError: (e) => toast(t(`inv.errors.${(e as Error).message.split(':')[0]}`, { defaultValue: (e as Error).message, n: (e as Error).message.split(':')[1] }), 'error'),
  })
  const del = useMutation({
    mutationFn: () => rpc('inv_delete_item', { p_item_id: i.id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv_list', eventId] }),
    onError: (e) => toast(t(`inv.errors.${(e as Error).message}`, { defaultValue: (e as Error).message }), 'error'),
  })
  const box = (label: string, field: string, value: number | null) => (
    <label className="block">
      <span className="block text-xs text-navy/55">{label}</span>
      <Input key={`${field}-${value}`} inputMode="numeric" defaultValue={value ?? ''} className="h-10 px-2"
        onBlur={(e) => { const v = num(e.target.value); if (v !== value) save.mutate({ [field]: v ?? '' }) }} />
    </label>
  )
  const short = i.missing != null && i.missing > 0
  return (
    <li className={`space-y-2 py-3 ${short ? 'bg-red-50' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{i.name}{i.unit ? <span className="font-normal text-navy/55"> ({i.unit})</span> : null}</p>
          <p className="text-xs text-navy/55">{[i.box, i.role_code && t('inv.preparedBy', { role: i.role_code })].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Checkbox label={t('inv.packed')} checked={i.packed} onChange={(e) => save.mutate({ packed: e.target.checked })} className="min-h-10" />
          <Button size="sm" variant="ghost" aria-label={t('common.remove')} disabled={del.isPending} onClick={() => del.mutate()}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {box(t('inv.out'), 'qty_out', i.qty_out)}
        {i.category === 'gift' ? (
          <>
            {box(t('inv.points'), 'points', i.points)}
            <div><span className="block text-xs text-navy/55">{t('inv.given')}</span><p className="py-2 font-semibold">{i.given}</p></div>
            <div><span className="block text-xs text-navy/55">{t('inv.remaining')}</span>
              <p className={`py-2 font-bold ${i.remaining <= 0 ? 'text-red-700' : 'text-emerald-700'}`}>{i.remaining}</p></div>
          </>
        ) : (
          <>
            {box(t('inv.returned'), 'qty_returned', i.qty_returned)}
            {box(t('inv.damaged'), 'qty_damaged', i.qty_damaged)}
            <div><span className="block text-xs text-navy/55">{t('inv.missing')}</span>
              <p className={`py-2 font-bold ${short ? 'text-red-700' : ''}`}>{i.missing ?? '—'}</p></div>
          </>
        )}
      </div>
      {i.category === 'gift' && (
        <div className="grid grid-cols-4 gap-2">
          {box(t('inv.returned'), 'qty_returned', i.qty_returned)}
          {box(t('inv.damaged'), 'qty_damaged', i.qty_damaged)}
          <div className="col-span-2"><span className="block text-xs text-navy/55">{t('inv.missing')}</span>
            <p className={`py-2 font-bold ${short ? 'text-red-700' : ''}`}>{i.missing ?? '—'}{i.surplus ? <Badge className="ml-1">{t('inv.surplus', { n: i.surplus })}</Badge> : null}</p></div>
        </div>
      )}
    </li>
  )
}

function AddItem({ eventId, onDone }: { eventId: string; onDone: () => void }) {
  const { t } = useTranslation()
  const [category, setCategory] = useState<InvItem['category']>('equipment')
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [box, setBox] = useState('')
  const [qty, setQty] = useState('')
  const [points, setPoints] = useState('')
  const add = useMutation({
    mutationFn: () => rpc('inv_save_item', { p_event_id: eventId, p_item: { category, name, unit, box, qty_out: num(qty) ?? 0, points: category === 'gift' ? num(points) ?? '' : '' } }),
    onSuccess: onDone,
  })
  return (
    <Card className="space-y-3 p-4">
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('inv.categoryLabel')}>
          <Select value={category} onChange={(e) => setCategory(e.target.value as InvItem['category'])}>
            {(['equipment', 'gift', 'supply'] as const).map((c) => <option key={c} value={c}>{t(`inv.category.${c}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('inv.box')}><Input value={box} onChange={(e) => setBox(e.target.value)} placeholder="THI ĐẤU" /></Field>
      </div>
      <Field label={t('inv.name')}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('inv.namePlaceholder')} /></Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label={t('inv.unit')}><Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="cây" /></Field>
        <Field label={t('inv.out')}><Input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        {category === 'gift' && <Field label={t('inv.points')}><Input inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} /></Field>}
      </div>
      <FormError message={add.isError ? (add.error as Error).message : null} />
      <div className="flex gap-2">
        <Button variant="outline" onClick={onDone}>{t('common.cancel')}</Button>
        <Button disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}>{t('common.add')}</Button>
      </div>
    </Card>
  )
}
