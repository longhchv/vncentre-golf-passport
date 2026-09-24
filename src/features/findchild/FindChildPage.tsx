import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useTable } from '@/lib/db'
import { formatDateTime } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Checkbox, Field, FormError, Input } from '@/components/ui/form'
import { Mascot } from '@/components/Mascot'
import { activationErrorText } from '@/features/activation/api'
import type { School } from '@/lib/types'

const RELATIONSHIPS = ['mother', 'father', 'guardian', 'other'] as const

type FindResult = { result: 'linked'; student_id: string } | { result: 'pending' } | { result: 'wrong_code'; remaining: number } | { result: 'locked' }

interface MyRequest {
  id: string
  submitted_child_name: string
  status: 'pending' | 'approved' | 'rejected'
  reject_reason: string | null
  created_at: string
}

/**
 * F5 · "Tôi không có mã": phụ huynh khai tên, ngày sinh, trường, lớp của con.
 * Có mã lớp và khớp đúng 1 em → nối ngay; còn lại → yêu cầu chờ duyệt.
 * Không bao giờ hiện danh sách học viên (R3).
 */
export function FindChildPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const schools = useTable<School>('schools', { order: 'name' })
  const [form, setForm] = useState({ child_name: '', dob: '', school: '', grade_class: '', class_code: '' })
  const [hasCode, setHasCode] = useState(true)
  const [relationship, setRelationship] = useState<string | null>(null)
  const [consents, setConsents] = useState({ terms: false, leaderboard_name: false })
  const [outcome, setOutcome] = useState<FindResult | null>(null)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const requests = useQuery({
    queryKey: ['my_link_requests'],
    queryFn: async () => {
      const { data, error } = await supabase!.from('link_requests')
        .select('id, submitted_child_name, status, reject_reason, created_at').order('created_at', { ascending: false }).limit(10)
      if (error) throw error
      return data as MyRequest[]
    },
  })

  const submit = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase!.rpc('find_child_request', {
        p_data: {
          ...form,
          class_code: hasCode ? form.class_code : '',
          relationship,
          consents: { terms: consents.terms, privacy: consents.terms, leaderboard_name: consents.leaderboard_name },
        },
      })
      if (error) throw error
      return data as FindResult
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['my_children'] })
      qc.invalidateQueries({ queryKey: ['my_link_requests'] })
      if (r.result === 'linked') navigate(`/app/children/${r.student_id}`, { replace: true })
      else setOutcome(r)
    },
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setOutcome(null)
    submit.mutate()
  }

  if (outcome?.result === 'pending') {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <Card className="flex flex-col items-center gap-3 p-6 text-center">
          <Mascot className="h-20 w-20" />
          <h1 className="text-xl font-bold">{t('findChild.pendingTitle')}</h1>
          <p className="text-navy/70">{t('findChild.pendingBody')}</p>
          <Button asChild size="full">
            <Link to="/app">{t('parent.nav.home')}</Link>
          </Button>
        </Card>
      </div>
    )
  }

  const locked = outcome?.result === 'locked'
  const codeError =
    outcome?.result === 'wrong_code' ? t('findChild.wrongCode', { count: outcome.remaining }) : locked ? t('findChild.locked') : null

  return (
    <div className="mx-auto max-w-md space-y-5">
      <Link to="/app" className="inline-flex items-center gap-1 text-sm font-semibold text-bronze">
        <ArrowLeft className="h-4 w-4" /> {t('parent.nav.home')}
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{t('findChild.title')}</h1>
        <p className="text-navy/65">{t('findChild.intro')}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <Card className="space-y-4 p-4">
          <p className="font-semibold">{t('findChild.childInfo')}</p>
          <Field label={t('findChild.childName') + ' *'}>
            <Input required value={form.child_name} onChange={set('child_name')} autoComplete="off" />
          </Field>
          <Field label={t('fields.dateOfBirth') + ' *'}>
            <Input type="date" required value={form.dob} onChange={set('dob')} max={new Date().toISOString().slice(0, 10)} />
          </Field>
          <Field label={t('fields.school')}>
            <Input list="find-child-schools" value={form.school} onChange={set('school')} />
            <datalist id="find-child-schools">
              {schools.data?.map((s) => <option key={s.id} value={s.name} />)}
            </datalist>
          </Field>
          <Field label={t('fields.gradeClass')}>
            <Input value={form.grade_class} onChange={set('grade_class')} placeholder="3A" />
          </Field>
        </Card>

        <Card className="space-y-3 p-4">
          <p className="font-semibold">{t('findChild.classCodeTitle')}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={hasCode ? 'primary' : 'outline'} onClick={() => setHasCode(true)}>
              {t('findChild.haveCode')}
            </Button>
            <Button type="button" variant={!hasCode ? 'primary' : 'outline'} onClick={() => setHasCode(false)}>
              {t('findChild.noClassCode')}
            </Button>
          </div>
          {hasCode ? (
            <>
              <Field label={t('findChild.classCode')} hint={t('findChild.classCodeHint')}>
                <Input required value={form.class_code} onChange={set('class_code')} autoCapitalize="characters" autoComplete="off"
                  className="font-mono text-lg tracking-widest uppercase" disabled={locked} />
              </Field>
              <FormError message={codeError} />
            </>
          ) : (
            <p className="text-sm text-navy/65">{t('findChild.noClassCodeHint')}</p>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <p className="font-semibold">{t('activation.relationshipTitle')}</p>
          <div className="grid grid-cols-2 gap-2">
            {RELATIONSHIPS.map((r) => (
              <Button key={r} type="button" variant={relationship === r ? 'primary' : 'outline'} onClick={() => setRelationship(r)}>
                {t(`relationship.${r}`)}
              </Button>
            ))}
          </div>
          <Checkbox label={t('activation.consent.terms')} checked={consents.terms} onChange={(e) => setConsents((c) => ({ ...c, terms: e.target.checked }))} />
          <p className="-mt-2 pl-8 text-sm">
            <Link to="/terms" target="_blank" className="text-bronze underline">{t('pages.terms')}</Link>
            {' · '}
            <Link to="/privacy" target="_blank" className="text-bronze underline">{t('pages.privacy')}</Link>
          </p>
          <Checkbox label={t('activation.consent.leaderboard')} checked={consents.leaderboard_name}
            onChange={(e) => setConsents((c) => ({ ...c, leaderboard_name: e.target.checked }))} />
        </Card>

        <FormError message={submit.isError ? activationErrorText(t, submit.error) : null} />
        <Button type="submit" size="full" disabled={submit.isPending || !relationship || !consents.terms || (hasCode && locked)}>
          {submit.isPending ? t('common.loading') : hasCode ? t('findChild.submitCode') : t('findChild.submitRequest')}
        </Button>
      </form>

      {(requests.data?.length ?? 0) > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold">{t('findChild.myRequests')}</h2>
          <ul className="space-y-2">
            {requests.data!.map((r) => (
              <li key={r.id}>
                <Card className="space-y-1 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{r.submitted_child_name}</span>
                    <Badge tone={r.status === 'approved' ? 'good' : r.status === 'rejected' ? 'bad' : 'warn'}>{t(`findChild.status.${r.status}`)}</Badge>
                  </div>
                  <p className="text-xs text-navy/50">{formatDateTime(r.created_at, i18n.language)}</p>
                  {r.reject_reason && <p className="text-sm text-navy/70">{r.reject_reason}</p>}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
