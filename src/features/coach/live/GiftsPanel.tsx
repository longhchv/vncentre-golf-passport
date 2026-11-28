import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Gift } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { useLocalized } from '@/lib/i18nField'
import { callRpc } from '@/features/partners/shared'

// Đổi quà trên lớp (việc 6): quà chung + quà riêng của lớp, điểm hiện có, còn thiếu bao nhiêu cho món kế tiếp.
// Đổi quà trừ điểm hiện có; tổng tích luỹ (xếp hạng) giữ nguyên. Cần mạng.

interface GiftItem {
  id: string
  name_vi: string
  name_en: string | null
  points: number
  stock: number
  class_only: boolean
  gap: number
}
interface GiftsData {
  available: number
  total: number
  next_gap: number | null
  items: GiftItem[]
  orders: { id: string; gift_vi: string; points: number; status: string; created_at: string }[]
}

const ERRORS = ['insufficient_points', 'out_of_stock', 'limit_reached', 'gift_unavailable', 'name_required', 'points_out_of_range', 'invalid_qty']

export function GiftsPanel({ classId, studentId, onChanged }: { classId: string; studentId: string; onChanged: () => Promise<unknown> }) {
  const { t } = useTranslation()
  const loc = useLocalized()
  const qc = useQueryClient()
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [points, setPoints] = useState('')
  const [qty, setQty] = useState('1')
  const key = ['live-gifts', classId, studentId]
  const data = useQuery({ queryKey: key, queryFn: () => callRpc<GiftsData>('class_live_gifts', { p_class_id: classId, p_student_id: studentId }) })
  const err = (e: unknown) => {
    const m = (e as { message?: string } | null)?.message ?? ''
    return ERRORS.includes(m) ? t(`classLive.gifts.errors.${m}`) : navigator.onLine ? t('errors.generic') : t('classLive.needOnline')
  }
  const redeem = useMutation({
    mutationFn: (giftId: string) => callRpc('gift_order_place', { p_student_id: studentId, p_gift_id: giftId, p_qty: 1, p_pickup: 'school' }),
    onSuccess: async () => {
      toast(t('classLive.gifts.redeemed'))
      await Promise.all([qc.invalidateQueries({ queryKey: key }), onChanged()])
    },
    onError: (e) => toast(err(e), 'error'),
  })
  const add = useMutation({
    mutationFn: () => callRpc('class_live_gift_add', { p_class_id: classId, p_name: name, p_points: Number(points), p_qty: Number(qty) }),
    onSuccess: async () => {
      setAdding(false)
      setName('')
      setPoints('')
      setQty('1')
      await qc.invalidateQueries({ queryKey: ['live-gifts', classId] })
    },
    onError: (e) => toast(err(e), 'error'),
  })

  if (data.isPending) return <p className="py-4 text-navy/60">{t('common.loading')}</p>
  if (data.isError) return <p className="py-4 text-red-700">{navigator.onLine ? t('errors.loadFailed') : t('classLive.needOnline')}</p>
  const d = data.data
  return (
    <div className="space-y-3 pt-1">
      <div className="rounded-2xl bg-gold/20 p-3 text-center">
        <p className="text-sm text-navy/70">{t('classLive.card.available')}</p>
        <p className="text-4xl font-extrabold tabular-nums">{d.available}</p>
        {d.next_gap != null && d.next_gap > 0 && <p className="text-sm font-semibold">{t('classLive.gifts.nextGap', { n: d.next_gap })}</p>}
      </div>
      {d.items.length === 0 && <p className="text-sm text-navy/60">{t('classLive.gifts.none')}</p>}
      <ul className="space-y-2">
        {d.items.map((g) => (
          <li key={g.id} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-navy/10">
            <Gift className="h-5 w-5 shrink-0 text-bronze" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{loc({ name_vi: g.name_vi, name_en: g.name_en ?? g.name_vi }, 'name')}</span>
              <span className="block text-sm text-navy/60">
                {t('classLive.gifts.points', { n: g.points })}
                {g.gap > 0 ? ` · ${t('classLive.gifts.gap', { n: g.gap })}` : ''}
                {g.stock <= 0 ? ` · ${t('classLive.gifts.outOfStock')}` : ''}
              </span>
            </span>
            <Button size="sm" disabled={g.gap > 0 || g.stock <= 0 || redeem.isPending}
              onClick={() => window.confirm(t('classLive.gifts.confirm', { gift: g.name_vi, n: g.points })) && redeem.mutate(g.id)}>
              {t('classLive.gifts.redeem')}
            </Button>
          </li>
        ))}
      </ul>
      {d.orders.length > 0 && (
        <p className="text-sm text-navy/60">
          {t('classLive.gifts.history')}: {d.orders.slice(0, 5).map((o) => `${o.gift_vi} (−${o.points})`).join(', ')}
        </p>
      )}
      {adding ? (
        <div className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-navy/10">
          <p className="font-semibold">{t('classLive.gifts.addTitle')}</p>
          <Input placeholder={t('classLive.gifts.name')} value={name} onChange={(e) => setName(e.target.value)} className="select-text" />
          <div className="grid grid-cols-2 gap-2">
            <Input inputMode="numeric" placeholder={t('classLive.gifts.pointsLabel')} value={points} onChange={(e) => setPoints(e.target.value.replace(/\D/g, ''))} />
            <Input inputMode="numeric" placeholder={t('classLive.gifts.qty')} value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} />
          </div>
          <Button size="full" disabled={!name.trim() || !points || !qty || add.isPending} onClick={() => add.mutate()}>
            {t('common.save')}
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>{t('classLive.gifts.add')}</Button>
      )}
    </div>
  )
}
