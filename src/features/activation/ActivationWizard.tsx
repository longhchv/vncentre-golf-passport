import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { PartyPopper } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useTable } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox, Field, FormError, Input, Select } from '@/components/ui/form'
import { Mascot } from '@/components/Mascot'
import { FullPageSpinner } from '@/auth/RequireWorkspace'
import { GOLF_GOALS, type School } from '@/lib/types'
import { activationErrorText, rpc, type ActivationResult, type ActivationStart } from './api'

type Relationship = 'father' | 'mother' | 'guardian' | 'other'
type Step = 'identity' | 'relationship' | 'consents' | 'child' | 'done'

interface ChildForm {
  full_name: string
  date_of_birth: string
  school_id: string
  school_text: string
  grade_class: string
  gender: string
  golf_goals: string[]
  golf_goals_other: string
}

/**
 * Trình tự kích hoạt sau khi đã đăng nhập (D30): [xác nhận ngày sinh/họ tên] → quan hệ → đồng ý →
 * thông tin con → hoàn tất (F2 luồng A và B). Mọi kiểm tra thật nằm ở CSDL (activation_complete).
 */
export function ActivationWizard({ code, maskedName, schoolName }: { code: string; maskedName?: string | null; schoolName?: string | null }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { refreshAccount } = useAuth()
  const schools = useTable<School>('schools', { order: 'name' })

  const start = useQuery({
    queryKey: ['activation_start', code],
    queryFn: () => rpc<ActivationStart>('activation_start', { p_code: code }),
    retry: false,
    staleTime: Infinity,
  })

  const [step, setStep] = useState<Step>('relationship')
  const [identityAnswer, setIdentityAnswer] = useState('')
  const [relationship, setRelationship] = useState<Relationship | null>(null)
  const [consents, setConsents] = useState({ terms: false, privacy: false, leaderboard_name: false, photo: false })
  const [child, setChild] = useState<ChildForm>({
    full_name: '', date_of_birth: '', school_id: '', school_text: '', grade_class: '', gender: '', golf_goals: [], golf_goals_other: '',
  })
  const [result, setResult] = useState<ActivationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const s = start.data
  useEffect(() => {
    if (!s) return
    if (s.flow === 'A' && !s.trusted && s.identity) setStep('identity')
    if (s.child) {
      setChild((c) => ({ ...c, gender: s.child!.gender ?? '', golf_goals: s.child!.golf_goals ?? [], golf_goals_other: s.child!.golf_goals_other ?? '' }))
    }
  }, [s])

  if (start.isPending) return <FullPageSpinner />
  if (start.isError) return <Notice mascot title={activationErrorText(t, start.error)} />
  if (!s) return null
  if (s.blocked === 'other_guardian') return <Notice mascot title={t('activation.blockedOtherGuardian')} body={t('activation.blockedOtherGuardianBody')} />
  if (s.blocked === 'identity_locked') return <Notice mascot title={t('activation.errors.identity_locked')} />

  const isB = s.flow === 'B'
  const photoAsked = isB ? Boolean(schools.data?.find((x) => x.id === child.school_id)?.requires_photo_consent) : Boolean(s.requires_photo_consent)
  const steps: Step[] = [...(s.flow === 'A' && !s.trusted ? (['identity'] as Step[]) : []), 'relationship', 'consents', 'child']
  const index = steps.indexOf(step)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const r = await rpc<ActivationResult>('activation_complete', {
        p_code: code,
        p_data: {
          identity_answer: identityAnswer || undefined,
          relationship,
          consents: { ...consents, photo: photoAsked ? consents.photo : undefined },
          child: {
            full_name: isB ? child.full_name : undefined,
            date_of_birth: child.date_of_birth || undefined,
            school_id: isB ? child.school_id || undefined : undefined,
            school_text: isB && !child.school_id ? child.school_text || undefined : undefined,
            grade_class: isB ? child.grade_class || undefined : undefined,
            gender: child.gender || undefined,
            golf_goals: child.golf_goals,
            golf_goals_other: child.golf_goals.includes('other') ? child.golf_goals_other : undefined,
          },
        },
      })
      setResult(r)
      setStep('done')
      await refreshAccount()
      qc.invalidateQueries({ queryKey: ['my_children'] })
    } catch (e) {
      setError(activationErrorText(t, e))
    } finally {
      setBusy(false)
    }
  }

  if (step === 'done' && result) return <Done result={result} />

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="flex items-center gap-3">
        <Mascot className="h-16 w-16 shrink-0" />
        <div>
          <p className="text-sm text-navy/60">{t('activation.title')}</p>
          <p className="font-bold">
            {isB ? t('activation.unassignedTitle') : t('activation.passportOf', { name: maskedName })}
          </p>
          {!isB && schoolName && <p className="text-sm text-navy/60">{schoolName}</p>}
        </div>
      </div>
      <p className="text-sm text-navy/55">{t('activation.stepOf', { n: index + 1, total: steps.length })}</p>

      {step === 'identity' && (
        <IdentityStep
          code={code}
          kind={s.identity!}
          onVerified={(answer) => {
            setIdentityAnswer(answer)
            setStep('relationship')
          }}
        />
      )}

      {step === 'relationship' && (
        <Section title={t('activation.relationshipTitle')}>
          <div className="grid grid-cols-2 gap-2">
            {(['mother', 'father', 'guardian', 'other'] as Relationship[]).map((r) => (
              <Button key={r} variant={relationship === r ? 'primary' : 'outline'} onClick={() => setRelationship(r)}>
                {t(`relationship.${r}`)}
              </Button>
            ))}
          </div>
          <Button size="full" disabled={!relationship} onClick={() => setStep('consents')}>
            {t('activation.next')}
          </Button>
        </Section>
      )}

      {step === 'consents' && (
        <Section title={t('activation.consentsTitle')}>
          <Checkbox
            label={t('activation.consent.terms')}
            checked={consents.terms && consents.privacy}
            onChange={(e) => setConsents((c) => ({ ...c, terms: e.target.checked, privacy: e.target.checked }))}
          />
          <p className="-mt-2 pl-8 text-sm">
            <Link to="/terms" target="_blank" className="text-bronze underline">{t('pages.terms')}</Link>
            {' · '}
            <Link to="/privacy" target="_blank" className="text-bronze underline">{t('pages.privacy')}</Link>
          </p>
          <Checkbox
            label={t('activation.consent.leaderboard')}
            checked={consents.leaderboard_name}
            onChange={(e) => setConsents((c) => ({ ...c, leaderboard_name: e.target.checked }))}
          />
          <p className="-mt-2 pl-8 text-sm text-navy/55">{t('activation.consent.leaderboardHint')}</p>
          {!isB && photoAsked && (
            <Checkbox label={t('activation.consent.photo')} checked={consents.photo} onChange={(e) => setConsents((c) => ({ ...c, photo: e.target.checked }))} />
          )}
          <Button size="full" disabled={!consents.terms || !consents.privacy} onClick={() => setStep('child')}>
            {t('activation.next')}
          </Button>
        </Section>
      )}

      {step === 'child' && (
        <ChildStep
          flow={s.flow}
          needsDob={Boolean(s.needs_dob)}
          child={child}
          setChild={setChild}
          schools={schools.data ?? []}
          photoAsked={isB && photoAsked}
          photo={consents.photo}
          setPhoto={(v) => setConsents((c) => ({ ...c, photo: v }))}
          busy={busy}
          error={error}
          onSubmit={submit}
        />
      )}

      {index > 0 && step !== 'identity' && (
        <button type="button" className="text-sm font-semibold text-bronze" onClick={() => setStep(steps[index - 1])}>
          {t('common.back')}
        </button>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="space-y-4 p-4">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </Card>
  )
}

function Notice({ title, body, mascot }: { title: string; body?: string; mascot?: boolean }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-6 text-center">
      {mascot && <Mascot />}
      <h1 className="text-xl font-bold">{title}</h1>
      {body && <p className="text-navy/75">{body}</p>}
    </div>
  )
}

function IdentityStep({ code, kind, onVerified }: { code: string; kind: 'dob' | 'name'; onVerified: (answer: string) => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await rpc<{ ok: boolean; attempts_left?: number }>('activation_verify_identity', { p_code: code, p_answer: value })
      if (r.ok) onVerified(value)
      else setError(r.attempts_left ? t('activation.identityWrong', { count: r.attempts_left }) : t('activation.errors.identity_locked'))
    } catch (err) {
      setError(activationErrorText(t, err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <Section title={t('activation.identityTitle')}>
        <p className="text-navy/75">{kind === 'dob' ? t('activation.identityDobHint') : t('activation.identityNameHint')}</p>
        <Field label={kind === 'dob' ? t('fields.dateOfBirth') : t('fields.studentName')}>
          <Input type={kind === 'dob' ? 'date' : 'text'} required value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <FormError message={error} />
        <Button type="submit" size="full" disabled={busy || !value}>
          {busy ? t('common.loading') : t('activation.confirm')}
        </Button>
      </Section>
    </form>
  )
}

function ChildStep({
  flow,
  needsDob,
  child,
  setChild,
  schools,
  photoAsked,
  photo,
  setPhoto,
  busy,
  error,
  onSubmit,
}: {
  flow: 'A' | 'B'
  needsDob: boolean
  child: ChildForm
  setChild: (f: (c: ChildForm) => ChildForm) => void
  schools: School[]
  photoAsked: boolean
  photo: boolean
  setPhoto: (v: boolean) => void
  busy: boolean
  error: string | null
  onSubmit: () => void
}) {
  const { t } = useTranslation()
  const set = (k: keyof ChildForm, v: string | string[]) => setChild((c) => ({ ...c, [k]: v }))
  const isB = flow === 'B'
  const valid = !isB || (child.full_name.trim() && child.date_of_birth && (child.school_id || child.school_text.trim()))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <Section title={isB ? t('activation.childInfoTitleB') : t('activation.childInfoTitle')}>
        {isB && (
          <>
            <Field label={t('fields.studentName') + ' *'}>
              <Input required value={child.full_name} onChange={(e) => set('full_name', e.target.value)} />
            </Field>
            <Field label={t('fields.school') + ' *'}>
              <Select value={child.school_id} onChange={(e) => set('school_id', e.target.value)}>
                <option value="">{t('activation.otherSchool')}</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>{s.short_name || s.name}</option>
                ))}
              </Select>
            </Field>
            {!child.school_id && (
              <Field label={t('activation.schoolName') + ' *'}>
                <Input value={child.school_text} onChange={(e) => set('school_text', e.target.value)} />
              </Field>
            )}
            <Field label={t('fields.gradeClass')}>
              <Input value={child.grade_class} onChange={(e) => set('grade_class', e.target.value)} placeholder="3A2" />
            </Field>
          </>
        )}
        {(isB || needsDob) && (
          <Field label={t('fields.dateOfBirth') + (isB ? ' *' : '')}>
            <Input type="date" required={isB} value={child.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} />
          </Field>
        )}
        <Field label={t('fields.gender')}>
          <Select value={child.gender} onChange={(e) => set('gender', e.target.value)}>
            <option value="">—</option>
            {['male', 'female', 'other'].map((g) => (
              <option key={g} value={g}>{t(`gender.${g}`)}</option>
            ))}
          </Select>
        </Field>
        <fieldset className="space-y-1">
          <legend className="text-sm font-semibold text-navy/80">{t('fields.golfGoals')}</legend>
          {GOLF_GOALS.map((g) => (
            <Checkbox
              key={g}
              label={t(`golfGoals.${g}`)}
              checked={child.golf_goals.includes(g)}
              onChange={(e) => set('golf_goals', e.target.checked ? [...child.golf_goals, g] : child.golf_goals.filter((x) => x !== g))}
            />
          ))}
        </fieldset>
        {child.golf_goals.includes('other') && (
          <Field label={t('fields.golfGoalsOther')}>
            <Input value={child.golf_goals_other} onChange={(e) => set('golf_goals_other', e.target.value)} />
          </Field>
        )}
        {photoAsked && <Checkbox label={t('activation.consent.photo')} checked={photo} onChange={(e) => setPhoto(e.target.checked)} />}
        <p className="text-sm text-navy/55">{t('activation.photoLater')}</p>
        <FormError message={error} />
        <Button type="submit" size="full" disabled={busy || !valid}>
          {busy ? t('common.loading') : t('activation.finish')}
        </Button>
      </Section>
    </form>
  )
}

function Done({ result }: { result: ActivationResult }) {
  const { t } = useTranslation()
  const pending = result.link_status === 'pending_confirmation'
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-4 text-center">
      <Mascot className="h-32 w-32" />
      <PartyPopper className="h-8 w-8 text-bronze" />
      <h1 className="text-2xl font-bold">{t('activation.welcome')}</h1>
      {pending && <p className="rounded-xl bg-gold/20 p-3 text-brown">{t('activation.pendingNote')}</p>}
      {!pending && result.flow === 'B' && <p className="rounded-xl bg-gold/20 p-3 text-brown">{t('activation.newStudentNote')}</p>}
      <Button asChild size="full">
        <Link to={`/app/children/${result.student_id}`}>{t('activation.openChild')}</Link>
      </Button>
      <Button asChild variant="outline" size="full">
        <Link to="/activate">{t('activation.anotherChild')}</Link>
      </Button>
    </div>
  )
}
