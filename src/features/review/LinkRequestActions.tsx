import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/db'
import { formatDate, formatDateTime } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Field, Textarea } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'

interface Candidate {
  id: string
  student_code: string
  full_name: string
  date_of_birth: string | null
  school: string | null
  grade_class: string | null
  name_match: boolean
  dob_match: boolean | null
  has_guardian: boolean
}

/**
 * Duyệt yêu cầu nối con (F5): mở danh sách ứng viên (cùng tên, hoặc cả lớp khi phụ huynh nhập đúng mã lớp),
 * chọn đúng học viên → nối; hoặc từ chối kèm lý do (phụ huynh nhận thông báo).
 */
export function LinkRequestActions({ requestId, onDone }: { requestId: string; onDone: () => void }) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [filter, setFilter] = useState(true)

  const candidates = useQuery({
    queryKey: ['link_request_candidates', requestId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('link_request_candidates', { p_request_id: requestId })
      if (error) throw error
      return data as Candidate[]
    },
  })
  const approve = useMutation({
    mutationFn: async (studentId: string) => {
      const { error } = await supabase!.rpc('approve_link_request', { p_request_id: requestId, p_student_id: studentId })
      if (error) throw error
    },
    onSuccess: () => { toast(t('review.approvedN', { count: 1 })); setOpen(false); onDone() },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })
  const reject = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!.rpc('reject_link_request', { p_request_id: requestId, p_reason: reason.trim() })
      if (error) throw error
    },
    onSuccess: () => { toast(t('review.rejectedN', { count: 1 })); setRejecting(false); onDone() },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  const list = (candidates.data ?? []).filter((c) => !filter || c.name_match)

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Check className="h-4 w-4" /> {t('linkReq.pick')}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setRejecting(true)}>
        <X className="h-4 w-4" /> {t('review.reject')}
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title={t('linkReq.pick')}>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-bronze" checked={filter} onChange={(e) => setFilter(e.target.checked)} />
            {t('linkReq.onlySameName')}
          </label>
          {candidates.isPending ? (
            <p className="text-navy/60">{t('common.loading')}</p>
          ) : list.length === 0 ? (
            <p className="text-navy/60">{t('linkReq.noCandidates')}</p>
          ) : (
            <ul className="space-y-2">
              {list.map((c) => (
                <li key={c.id}>
                  <Card className="space-y-2 p-3">
                    <p className="font-semibold">{c.full_name} <span className="text-sm font-normal text-navy/55">{c.student_code}</span></p>
                    <p className="text-sm text-navy/65">
                      {[c.date_of_birth ? formatDate(c.date_of_birth, i18n.language) : null, c.school, c.grade_class].filter(Boolean).join(' · ')}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {c.name_match && <Badge tone="good">{t('linkReq.nameMatch')}</Badge>}
                      {c.dob_match && <Badge tone="good">{t('linkReq.dobMatch')}</Badge>}
                      {c.has_guardian && <Badge tone="warn">{t('linkReq.hasGuardian')}</Badge>}
                    </div>
                    <Button size="sm" disabled={approve.isPending}
                      onClick={() => window.confirm(t('linkReq.confirm', { name: c.full_name })) && approve.mutate(c.id)}>
                      {t('linkReq.linkThis')}
                    </Button>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>

      <Dialog open={rejecting} onClose={() => setRejecting(false)} title={t('review.rejectTitle', { count: 1 })}>
        <div className="space-y-3">
          <Field label={t('review.reason') + ' *'}>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Button size="full" disabled={!reason.trim() || reject.isPending} onClick={() => reject.mutate()}>
            {t('review.confirmReject')}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

interface CoachLinkRequest {
  id: string
  child_name: string
  dob: string | null
  school: string | null
  grade_class: string | null
  class_name: string
  requester: string | null
  created_at: string
}

/** HLV · Yêu cầu nối con của các lớp mình (phụ huynh nhập đúng mã lớp nhưng chưa khớp đúng 1 em). */
export function CoachLinkRequests() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['coach_link_requests'],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('coach_link_requests')
      if (error) throw error
      return data as CoachLinkRequest[]
    },
  })
  if (!q.data?.length) return null
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">{t('linkReq.coachTitle')} <Badge tone="warn">{q.data.length}</Badge></h2>
      <ul className="space-y-2">
        {q.data.map((r) => (
          <li key={r.id}>
            <Card className="space-y-2 p-4">
              <p className="font-semibold">{r.child_name} <span className="text-sm font-normal text-navy/55">· {r.class_name}</span></p>
              <p className="text-sm text-navy/65">
                {[r.dob ? formatDate(r.dob, i18n.language) : null, r.school, r.grade_class].filter(Boolean).join(' · ')}
              </p>
              <p className="text-sm text-navy/65">{t('linkReq.requester')}: {r.requester ?? '—'}</p>
              <p className="text-xs text-navy/45">{formatDateTime(r.created_at, i18n.language)}</p>
              <LinkRequestActions requestId={r.id} onDone={() => qc.invalidateQueries({ queryKey: ['coach_link_requests'] })} />
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}
