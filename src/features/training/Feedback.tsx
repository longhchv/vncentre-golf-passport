/** Spec 25 · chạy thử: nút "Góp ý" trong mục Tập luyện và danh sách góp ý cho admin. */
import { useState } from 'react'
import { useLocation } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Field, FormError, Select, Textarea } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { errorMessage } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const CATS = ['bug', 'idea', 'content', 'other'] as const
const STATUSES = ['new', 'in_progress', 'done', 'wont_fix'] as const

function fbError(err: unknown, t: (k: string) => string) {
  const msg = (err as { message?: string })?.message ?? ''
  return ['feedback_too_short', 'feedback_rate_limited'].includes(msg) ? t(`training.feedback.err.${msg}`) : errorMessage(err, t)
}

/** Nút góp ý. Gửi kèm đường dẫn trang đang xem và (nếu có) học viên đang xem. */
export function FeedbackButton({ studentId, className }: { studentId?: string | null; className?: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [cat, setCat] = useState<(typeof CATS)[number]>('idea')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const send = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!.rpc('training_send_feedback', {
        p_page: location.pathname, p_category: cat, p_message: msg, p_student_id: studentId ?? null,
        p_user_agent: typeof navigator === 'undefined' ? null : navigator.userAgent,
      })
      if (error) throw error
    },
    onSuccess: () => { toast(t('training.feedback.thanks')); setMsg(''); setOpen(false) },
    onError: (e) => setErr(fbError(e, t)),
  })
  return (
    <>
      <Button type="button" size="sm" variant="outline" className={className} onClick={() => { setErr(null); setOpen(true) }}>
        <MessageSquarePlus className="h-4 w-4" /> {t('training.feedback.button')}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('training.feedback.title')}>
        <div className="space-y-4 p-4">
          <p className="text-sm text-navy/70">{t('training.feedback.intro')}</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('training.feedback.category')}>
            {CATS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={cat === c} onClick={() => setCat(c)}
                className={cn('min-h-10 rounded-full border-2 px-3 text-sm font-semibold', cat === c ? 'border-bronze bg-gold/25' : 'border-navy/15 bg-white text-navy/70')}>
                {t(`training.feedback.cat.${c}`)}
              </button>
            ))}
          </div>
          <Field label={t('training.feedback.message')}>
            <Textarea rows={5} maxLength={2000} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={t('training.feedback.placeholder')} />
          </Field>
          <p className="text-xs text-navy/50">{t('training.feedback.pageNote', { page: location.pathname })}</p>
          <FormError message={err} />
          <Button size="full" disabled={msg.trim().length < 3 || send.isPending} onClick={() => { setErr(null); send.mutate() }}>
            {t('training.feedback.send')}
          </Button>
        </div>
      </Dialog>
    </>
  )
}

interface FeedbackRow {
  id: string; created_at: string; page: string; category: string; message: string; status: (typeof STATUSES)[number]
  admin_note: string | null; user_agent: string | null; sender: string | null; email: string | null; student: string | null
}

/** Admin: danh sách góp ý, đổi trạng thái, ghi chú xử lý. */
export function FeedbackAdmin() {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const [status, setStatus] = useState<string>('new')
  const q = useQuery({
    queryKey: ['training_feedback_admin', status],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('training_feedback_admin_list', { p_status: status || null })
      if (error) throw error
      return data as FeedbackRow[]
    },
  })
  const [notes, setNotes] = useState<Record<string, string>>({})
  const save = useMutation({
    mutationFn: async (v: { id: string; status?: string; admin_note?: string }) => {
      const { id, ...patch } = v
      const { error } = await supabase!.from('training_feedback').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['training_feedback_admin'] }); toast(t('common.saved')) },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })
  return (
    <div className="space-y-3">
      <p className="text-sm text-navy/70">{t('training.feedback.adminHint')}</p>
      <Field label={t('fields.status')} className="max-w-48">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('common.all')}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`training.feedback.status.${s}`)}</option>)}
        </Select>
      </Field>
      {q.isPending && <p className="text-navy/60">{t('common.loading')}</p>}
      {q.data?.length === 0 && <p className="text-navy/60">{t('training.feedback.none')}</p>}
      {q.data?.map((f) => (
        <Card key={f.id} className="space-y-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={f.category === 'bug' ? 'bad' : 'neutral'}>{t(`training.feedback.cat.${f.category}`)}</Badge>
              <span className="text-sm font-semibold">{f.sender ?? '—'}</span>
              {f.student && <span className="text-sm text-navy/60">· {f.student}</span>}
            </div>
            <span className="text-xs text-navy/55">{new Date(f.created_at).toLocaleString('vi-VN')}</span>
          </div>
          <p className="whitespace-pre-line">{f.message}</p>
          <p className="text-xs text-navy/55">{f.page}{f.email && ` · ${f.email}`}</p>
          <div className="flex flex-wrap items-end gap-2">
            <Select aria-label={t('fields.status')} className="w-44" value={f.status} onChange={(e) => save.mutate({ id: f.id, status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{t(`training.feedback.status.${s}`)}</option>)}
            </Select>
            <Textarea rows={1} className="min-w-56 flex-1" placeholder={t('training.feedback.note')} value={notes[f.id] ?? f.admin_note ?? ''}
              onChange={(e) => setNotes({ ...notes, [f.id]: e.target.value })} />
            <Button size="sm" variant="outline" disabled={save.isPending || notes[f.id] === undefined} onClick={() => save.mutate({ id: f.id, admin_note: notes[f.id] })}>
              {t('common.save')}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  )
}
