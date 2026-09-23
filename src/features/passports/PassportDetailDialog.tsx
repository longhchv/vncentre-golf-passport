import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { formatCode } from '@/lib/codes'
import { formatDateTime, useLocalized } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Field, FormError, Textarea } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { usePassportError } from './AssignPassportDialog'

export type PassportStatus = 'unassigned' | 'assigned' | 'active' | 'lost' | 'void' | 'retired'

export const PASSPORT_TONE: Record<PassportStatus, 'good' | 'warn' | 'bad' | 'neutral'> = {
  unassigned: 'neutral',
  assigned: 'warn',
  active: 'good',
  lost: 'bad',
  void: 'bad',
  retired: 'neutral',
}

interface PassportFull {
  id: string
  passport_code: string
  status: PassportStatus
  issued_at: string | null
  expires_at: string | null
  activated_at: string | null
  void_reason: string | null
  batch: { name: string } | null
  tier: { name_vi: string; name_en: string } | null
  student: { id: string; full_name: string; student_code: string } | null
}

interface HistoryRow {
  id: string
  action: string
  created_at: string
  before: { status?: string } | null
  after: { status?: string } | null
  reason: string | null
  actor: { full_name: string | null; email: string | null } | null
}

/** Chi tiết sổ: trạng thái, học viên, lịch sử thay đổi, huỷ sổ (bắt buộc lý do) — F11. */
export function PassportDetailDialog({ passportId, onClose }: { passportId: string | null; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  const qc = useQueryClient()
  const toast = useToast()
  const passportError = usePassportError()
  const [reason, setReason] = useState('')
  const [voidOpen, setVoidOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const q = useQuery({
    queryKey: ['passports', 'detail', passportId],
    enabled: Boolean(passportId),
    queryFn: async () => {
      const [p, h] = await Promise.all([
        supabase!
          .from('passports')
          .select('id, passport_code, status, issued_at, expires_at, activated_at, void_reason, batch:passport_batches(name), tier:passport_tiers(name_vi, name_en), student:students(id, full_name, student_code)')
          .eq('id', passportId!)
          .single(),
        supabase!
          .from('audit_logs')
          .select('id, action, created_at, before, after, reason, actor:profiles!audit_logs_actor_user_id_fkey(full_name, email)')
          .eq('entity_type', 'passports')
          .eq('entity_id', passportId!)
          .order('created_at', { ascending: false }),
      ])
      if (p.error) throw p.error
      return { passport: p.data as unknown as PassportFull, history: (h.data ?? []) as unknown as HistoryRow[] }
    },
  })

  const voidIt = useMutation({
    mutationFn: async () => {
      const { error: e } = await supabase!.rpc('void_passport', { p_passport_id: passportId, p_reason: reason })
      if (e) throw e
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['passports'] })
      toast(t('passports.voided'))
      setVoidOpen(false)
      setReason('')
    },
    onError: (e) => setError(passportError(e)),
  })

  const p = q.data?.passport
  const fmt = (iso: string | null) => (iso ? formatDateTime(iso, i18n.language) : '—')

  return (
    <Dialog open={passportId !== null} onClose={onClose} title={p ? formatCode(p.passport_code) : t('common.loading')}>
      {p && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge tone={PASSPORT_TONE[p.status]}>{t(`passportStatus.${p.status}`)}</Badge>
            <Badge>{loc(p.tier, 'name')}</Badge>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base">
            <dt className="text-navy/60">{t('passports.student')}</dt>
            <dd className="font-semibold">{p.student ? `${p.student.full_name} · ${p.student.student_code}` : '—'}</dd>
            <dt className="text-navy/60">{t('passports.batch')}</dt>
            <dd>{p.batch?.name ?? '—'}</dd>
            <dt className="text-navy/60">{t('passports.issuedAt')}</dt>
            <dd>{fmt(p.issued_at)}</dd>
            <dt className="text-navy/60">{t('passports.expiresAt')}</dt>
            <dd>{fmt(p.expires_at)}</dd>
            <dt className="text-navy/60">{t('passports.activatedAt')}</dt>
            <dd>{fmt(p.activated_at)}</dd>
            {p.void_reason && (
              <>
                <dt className="text-navy/60">{t('passports.voidReason')}</dt>
                <dd>{p.void_reason}</dd>
              </>
            )}
          </dl>

          <section className="space-y-2">
            <h3 className="font-bold">{t('passports.history')}</h3>
            <ul className="space-y-1 text-sm">
              {q.data?.history.map((h) => (
                <li key={h.id}>
                  {fmt(h.created_at)} · {h.actor?.full_name || h.actor?.email || t('audit.system')} ·{' '}
                  {h.action === 'insert'
                    ? t('passports.created')
                    : `${t(`passportStatus.${h.before?.status}`, { defaultValue: h.before?.status ?? '' })} → ${t(`passportStatus.${h.after?.status}`, { defaultValue: h.after?.status ?? '' })}`}
                  {h.reason ? ` (${h.reason})` : ''}
                </li>
              ))}
            </ul>
          </section>

          {(p.status === 'unassigned' || p.status === 'assigned') &&
            (voidOpen ? (
              <div className="space-y-3 rounded-2xl bg-red-50 p-4">
                <Field label={t('passports.voidReason') + ' *'}>
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
                </Field>
                <FormError message={error} />
                <div className="flex gap-2">
                  <Button disabled={!reason.trim() || voidIt.isPending} onClick={() => voidIt.mutate()}>
                    {t('passports.confirmVoid')}
                  </Button>
                  <Button variant="ghost" onClick={() => setVoidOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setVoidOpen(true)}>
                {t('passports.void')}
              </Button>
            ))}
        </div>
      )}
    </Dialog>
  )
}
