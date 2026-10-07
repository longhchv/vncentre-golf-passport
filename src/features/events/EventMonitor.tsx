import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { formatCode } from '@/lib/codes'
import { formatDateTime, useLocalized } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Field, FormError, Input } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { eventErrorText } from './EventCard'

interface LiveStats {
  cards: number; registered: number; self_registered: number; staff_registered: number; players_self: number; players_child: number
  completed: number; completed_counter: number; completed_self_claim: number; pending_review: number; rejected: number
  activated: number; gift_cards: number; gift_points: number; last_15_min: number; updated_at: string
}

/** E8 · Bảng theo dõi trực tiếp: tự làm mới mỗi 15 giây. */
export function LiveBoard({ eventId }: { eventId: string }) {
  const { t, i18n } = useTranslation()
  const q = useQuery({
    queryKey: ['event_live_stats', eventId],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('event_live_stats', { p_event_id: eventId })
      if (error) throw error
      return data as LiveStats
    },
  })
  if (!q.data) return null
  const s = q.data
  const tiles: { label: string; value: number; sub?: string; tone?: string }[] = [
    { label: t('live.registered'), value: s.registered, sub: t('live.registeredSub', { cards: s.cards, self: s.self_registered, staff: s.staff_registered }) },
    { label: t('live.completed'), value: s.completed, sub: t('live.completedSub', { counter: s.completed_counter, claim: s.completed_self_claim }), tone: 'text-emerald-700' },
    { label: t('live.gifts'), value: s.gift_cards, sub: t('live.giftsSub', { points: s.gift_points }) },
    { label: t('live.pendingReview'), value: s.pending_review, sub: s.rejected ? t('live.rejectedSub', { n: s.rejected }) : undefined, tone: s.pending_review ? 'text-amber-700' : undefined },
    { label: t('live.activated'), value: s.activated },
    { label: t('live.last15'), value: s.last_15_min, sub: t('live.playersSub', { self: s.players_self, child: s.players_child }) },
  ]
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{t('live.title')}</p>
        <p className="text-xs text-navy/50">{t('live.updated', { time: formatDateTime(s.updated_at, i18n.language) })}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map((x) => (
          <div key={x.label} className="rounded-xl bg-navy/5 p-3">
            <p className="text-sm text-navy/60">{x.label}</p>
            <p className={`text-3xl font-bold ${x.tone ?? ''}`}>{x.value}</p>
            {x.sub && <p className="text-xs text-navy/55">{x.sub}</p>}
          </div>
        ))}
      </div>
    </Card>
  )
}

interface Claim {
  id: string; status: 'pending' | 'approved' | 'rejected'; photo_path: string; submitted_at: string; reviewed_at: string | null
  reject_reason: string | null; code: string; full_name: string; player_type: 'self' | 'child'; completion_status: string; claims_count: number
}
interface StationLite { code: string; name_vi: string; name_en: string; score_step: number; min_score_to_complete: number; sort_order: number }

/** Hàng chờ xác nhận ảnh của sự kiện (E5 bước 4–5; tách khỏi F12). Chỉ admin. */
export function ClaimsQueue({ eventId }: { eventId: string }) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<'pending' | 'rejected' | 'approved'>('pending')
  const q = useQuery({
    queryKey: ['event_claims', eventId, status],
    refetchInterval: status === 'pending' ? 30_000 : false,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('event_claims_queue', { p_event_id: eventId, p_status: status })
      if (error) throw error
      return data as Claim[]
    },
  })
  const stations = useQuery({
    queryKey: ['event_stations', eventId],
    queryFn: async () => {
      const { data, error } = await supabase!.from('event_stations').select('*').eq('event_id', eventId).order('sort_order')
      if (error) throw error
      return data as StationLite[]
    },
  })
  return (
    <Card className="space-y-3 p-4">
      <p className="font-semibold">{t('claims.title')}</p>
      <div className="flex gap-2">
        {(['pending', 'rejected', 'approved'] as const).map((k) => (
          <Button key={k} size="sm" variant={status === k ? 'primary' : 'outline'} onClick={() => setStatus(k)}>{t(`claims.status.${k}`)}</Button>
        ))}
      </div>
      {q.isPending ? <p className="text-navy/60">{t('common.loading')}</p> : q.data?.length === 0 ? (
        <p className="text-navy/55">{t('claims.empty')}</p>
      ) : (
        <ul className="space-y-4">
          {q.data?.map((c) => <ClaimItem key={c.id} claim={c} stations={stations.data ?? []} eventId={eventId} />)}
        </ul>
      )}
      <p className="text-sm text-navy/55">{t('claims.hint')}</p>
    </Card>
  )
}

function ClaimItem({ claim, stations, eventId }: { claim: Claim; stations: StationLite[]; eventId: string }) {
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  const qc = useQueryClient()
  const toast = useToast()
  const [scores, setScores] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const photo = useQuery({
    queryKey: ['claim-photo', claim.photo_path],
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase!.storage.from('event-claims').createSignedUrl(claim.photo_path, 3600)
      if (error) throw error
      return data.signedUrl
    },
  })
  const review = useMutation({
    mutationFn: async (approve: boolean) => {
      const { error } = await supabase!.rpc('event_review_claim', { p_claim_id: claim.id, p_approve: approve, p_scores: scores, p_reason: approve ? null : reason })
      if (error) throw error
      return approve
    },
    onSuccess: (approve) => {
      toast(approve ? t('claims.approved') : t('claims.rejected'))
      qc.invalidateQueries({ queryKey: ['event_claims', eventId] })
      qc.invalidateQueries({ queryKey: ['event_live_stats', eventId] })
    },
  })
  const pending = claim.status === 'pending'
  return (
    <li className="grid gap-3 rounded-xl p-3 ring-1 ring-navy/10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <a href={photo.data} target="_blank" rel="noreferrer" className="block">
        {photo.data ? <img src={photo.data} alt="" className="max-h-[28rem] w-full rounded-lg bg-navy/5 object-contain" />
          : <div className="h-60 rounded-lg bg-navy/5" />}
      </a>
      <div className="space-y-3">
        <div>
          <p className="text-lg font-bold">{claim.full_name}</p>
          <p className="text-sm text-navy/60">
            {formatCode(claim.code)} · {t(`eventCard.playerType.${claim.player_type}`)} · {formatDateTime(claim.submitted_at, i18n.language)}
          </p>
          {claim.claims_count > 1 && <Badge tone="warn">{t('claims.attempt', { n: claim.claims_count })}</Badge>}
          {claim.status === 'rejected' && claim.reject_reason && <p className="text-sm text-red-800">{t('eventCard.rejectedReason', { reason: claim.reject_reason })}</p>}
        </div>
        {pending && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {stations.map((s) => (
                <Field key={s.code} label={loc(s, 'name')}>
                  <Input inputMode="numeric" value={scores[s.code] ?? ''} placeholder={`≥ ${s.min_score_to_complete}`}
                    onChange={(e) => setScores((x) => ({ ...x, [s.code]: e.target.value.replace(/[^0-9]/g, '') }))} />
                </Field>
              ))}
            </div>
            <p className="text-xs text-navy/55">{t('claims.stampHint')}</p>
            <Button size="full" disabled={review.isPending} onClick={() => review.mutate(true)}>{t('claims.approve')}</Button>
            <div className="flex gap-2">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('claims.reasonPlaceholder')} />
              <Button variant="outline" disabled={review.isPending || !reason.trim()} onClick={() => review.mutate(false)}>{t('claims.reject')}</Button>
            </div>
            <FormError message={review.isError ? eventErrorText(t, review.error) : null} />
          </>
        )}
      </div>
    </li>
  )
}
