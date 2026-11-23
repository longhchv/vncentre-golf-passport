/**
 * Spec 24 · Tập luyện đợt 2: thẻ thử thách theo level, bài về nhà, thư viện bài tập.
 * Phụ huynh nhập cho các con (≤ 10 tuổi), các con từ 11 tuổi tự nhập bằng tài khoản học viên,
 * HLV xác nhận và chấm thẻ tại lớp. Điểm chỉ ghi nhận mức điểm, đợt 3 mới cộng vào ví.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BookOpen, Check, ChevronLeft, Clock, ExternalLink, Minus, Plus, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, TableWrap, td, th } from '@/components/ui/card'
import { Checkbox, Field, FormError, Input, Select, Textarea } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { ComingSoon } from '@/components/ComingSoon'
import { useAuth } from '@/auth/AuthProvider'
import { useMyChildren } from '@/features/parent/ParentHomePage'
import { errorMessage } from '@/lib/db'
import { useSetting } from '@/lib/settings'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useMe, useTrainingEnabled } from './api'
import { cardState, partsMet, type CardState, type Challenge, type Part, type Result } from './junior'

const db = () => supabase!

// ---------------------------------------------------------------- kiểu dữ liệu

interface Assignment {
  id: string
  class_name: string
  title_vi: string
  body_vi: string | null
  due_date: string | null
  points: number
  in_class: boolean
  challenge_id: string | null
  done_at: string | null
  confirmed: boolean
}
interface Drill {
  id: string
  code: string
  title_vi: string
  skill: string
  form: string
  contexts: string[]
  minutes: number | null
  attempts: number | null
  target: number | null
  unit_vi: string | null
  goal_vi: string | null
  steps: string[]
  easier_vi: string | null
  harder_vi: string | null
  safety_vi: string | null
  video_url: string | null
  level_from: number | null
  level_to: number | null
}

const SKILLS = ['fitness', 'basics', 'putt', 'chip', 'pitch', 'bunker', 'full_swing', 'on_course', 'mental', 'rules'] as const

function jrError(err: unknown, t: (k: string) => string) {
  const msg = (err as { message?: string })?.message ?? ''
  const known = ['coach_only', 'invalid_made', 'not_pending', 'not_in_class', 'challenge_not_found', 'assignment_not_found', 'forbidden']
  if ((err as { code?: string })?.code === '42501') return t('training.jr.err.forbidden')
  return known.includes(msg) ? t(`training.jr.err.${msg}`) : errorMessage(err, t)
}

// ---------------------------------------------------------------- truy vấn

function useStudent(studentId: string) {
  return useQuery({
    queryKey: ['training_jr_student', studentId],
    enabled: Boolean(studentId),
    queryFn: async () => {
      const [s, lv, enter] = await Promise.all([
        db().from('students').select('id, full_name, student_code').eq('id', studentId).single(),
        db().rpc('training_current_level', { p_student_id: studentId }),
        db().rpc('training_can_enter', { p_student_id: studentId }),
      ])
      if (s.error) throw s.error
      if (lv.error) throw lv.error
      return { ...(s.data as { id: string; full_name: string; student_code: string | null }), level: Number(lv.data ?? 1), canEnter: Boolean(enter.data) }
    },
  })
}

export function useChallenges() {
  return useQuery({
    queryKey: ['training_challenges'],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await db()
        .from('training_challenges')
        .select('id, level_number, code, kind, area, title_vi, title_en, how_vi, parts, verify, points_rank, points_reward, is_provisional, sort_order')
        .eq('is_active', true)
        .order('level_number')
        .order('sort_order')
      if (error) throw error
      return data as Challenge[]
    },
  })
}

function useResults(studentId: string) {
  return useQuery({
    queryKey: ['training_jr_results', studentId],
    enabled: Boolean(studentId),
    queryFn: async () => {
      const { data, error } = await db()
        .from('training_challenge_results')
        .select('id, challenge_id, made, video_url, status, submitted_as, review_note, created_at')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return data as Result[]
    },
  })
}

function useStudentAssignments(studentId: string) {
  return useQuery({
    queryKey: ['training_jr_assignments', studentId],
    enabled: Boolean(studentId),
    queryFn: async () => {
      const { data, error } = await db().rpc('training_student_assignments', { p_student_id: studentId })
      if (error) throw error
      return data as Assignment[]
    },
  })
}

function useJrRpc<A extends Record<string, unknown>, R = unknown>(fn: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: A) => {
      const { data, error } = await db().rpc(fn, args)
      if (error) throw error
      return data as R
    },
    onSuccess: () => {
      for (const k of ['training_jr_results', 'training_jr_assignments', 'training_jr_student', 'training_coach_progress', 'training_coach_pending', 'training_coach_assignments'])
        qc.invalidateQueries({ queryKey: [k] })
    },
  })
}

export function useTrainingPoints() {
  return useSetting<{ practice: number; level_up: number; assignment: number; in_class: number }>('training.points', {
    practice: 10, level_up: 30, assignment: 20, in_class: 50,
  }).value
}

// ---------------------------------------------------------------- khung trang

function Back({ to, label }: { to: string; label?: string }) {
  const { t } = useTranslation()
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-sm font-semibold text-bronze">
      <ChevronLeft className="h-4 w-4" /> {label ?? t('training.back')}
    </Link>
  )
}

function Page({ title, back, children }: { title: string; back?: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-lg space-y-5">
      {back && <Back to={back} />}
      <h1 className="text-2xl font-bold">{title}</h1>
      {children}
    </div>
  )
}

function Loading() {
  const { t } = useTranslation()
  return <p className="text-navy/60">{t('common.loading')}</p>
}

function StateBadge({ state }: { state: CardState }) {
  const { t } = useTranslation()
  const tone = { done: 'bg-emerald-100 text-emerald-800', pending: 'bg-gold/30 text-navy', tried: 'bg-navy/10 text-navy/70', todo: 'bg-white text-navy/50 border border-navy/15' }[state]
  return <span className={cn('inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', tone)}>{t(`training.jr.state.${state}`)}</span>
}

/** Thanh chọn người: "Tôi" (người lớn tự tập) và từng con. Chỉ hiện khi phụ huynh có con đang liên kết. */
export function PersonSwitcher({ current }: { current: 'me' | string }) {
  const { t } = useTranslation()
  const kids = useMyChildren()
  const me = useMe()
  // Bỏ hồ sơ golfer của chính người dùng (liên kết 'self'), đã có ở nút "Tôi"
  const list = (kids.data ?? []).filter((k) => k.link_status === 'active' && k.student_id !== me.data?.id)
  if (!list.length) return null
  const item = (to: string, label: string, on: boolean) => (
    <Link
      key={to}
      to={to}
      aria-current={on ? 'page' : undefined}
      className={cn(
        'min-h-10 rounded-full border-2 px-3 py-1.5 text-sm font-semibold',
        on ? 'border-bronze bg-gold/25 text-navy' : 'border-navy/15 bg-white text-navy/70 hover:bg-navy/5',
      )}
    >
      {label}
    </Link>
  )
  return (
    <nav aria-label={t('training.jr.switcher')} className="mx-auto flex max-w-lg flex-wrap gap-2">
      {item('/app/training', t('training.jr.me'), current === 'me')}
      {list.map((k) => item(`/app/training/kid/${k.student_id}`, k.full_name, current === k.student_id))}
    </nav>
  )
}

// ---------------------------------------------------------------- Trang chủ của các con

export function ParentKidTrainingPage() {
  const { studentId = '' } = useParams()
  const enabled = useTrainingEnabled()
  const { t } = useTranslation()
  if (enabled.isPending) return <Loading />
  if (!enabled.data) return <ComingSoon title={t('training.title')} />
  return (
    <div className="space-y-4">
      <PersonSwitcher current={studentId} />
      <JuniorHome studentId={studentId} base={`/app/training/kid/${studentId}`} libraryTo="/app/training/library" guardian />
    </div>
  )
}

export function StudentTrainingPage() {
  const { studentId } = useAuth()
  const { t } = useTranslation()
  if (!studentId) return <p className="text-navy/60">{t('errors.loadFailed')}</p>
  return <JuniorHome studentId={studentId} base="/me/training" libraryTo="/me/training/library" />
}

function JuniorHome({ studentId, base, libraryTo, guardian }: { studentId: string; base: string; libraryTo: string; guardian?: boolean }) {
  const { t } = useTranslation()
  const toast = useToast()
  const student = useStudent(studentId)
  const challenges = useChallenges()
  const results = useResults(studentId)
  const assignments = useStudentAssignments(studentId)
  const mark = useJrRpc<{ p_assignment_id: string; p_student_id: string; p_done: boolean }>('training_mark_assignment')
  const review = useJrRpc<{ p_result_id: string; p_approve: boolean }>('training_review_result')
  const [showLevel, setShowLevel] = useState<number | null>(null)

  const byChallenge = useMemo(() => {
    const m = new Map<string, Result[]>()
    for (const r of results.data ?? []) m.set(r.challenge_id, [...(m.get(r.challenge_id) ?? []), r])
    return m
  }, [results.data])

  if (student.isPending || challenges.isPending || results.isPending) return <Loading />
  if (student.isError || !student.data) return <p className="text-red-700">{t('errors.loadFailed')}</p>
  const s = student.data
  const level = showLevel ?? s.level
  const cards = (challenges.data ?? []).filter((c) => c.level_number === level)
  const levelUp = cards.filter((c) => c.kind === 'level_up')
  const done = levelUp.filter((c) => cardState(byChallenge.get(c.id) ?? []) === 'done').length
  const next = levelUp.find((c) => ['todo', 'tried'].includes(cardState(byChallenge.get(c.id) ?? [])) && c.verify !== 'coach')
  const challengeById = new Map((challenges.data ?? []).map((c) => [c.id, c]))
  const waiting = (results.data ?? []).filter((r) => r.status === 'pending')
  const openAsg = (assignments.data ?? []).filter((a) => !a.confirmed)

  return (
    <Page title={guardian ? s.full_name : t('training.title')}>
      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-navy/60">{t('training.jr.levelNow')}</p>
            <p className="text-3xl font-bold">{t('training.jr.level', { n: s.level })}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-navy/60">{t('training.jr.cardsDone')}</p>
            <p className="text-2xl font-bold">{levelUp.length ? `${done}/${levelUp.length}` : '—'}</p>
          </div>
        </div>
        {levelUp.length > 0 && (
          <div className="h-2 overflow-hidden rounded-full bg-navy/10" role="progressbar" aria-valuemin={0} aria-valuemax={levelUp.length} aria-valuenow={done}>
            <div className="h-full bg-bronze" style={{ width: `${(done / levelUp.length) * 100}%` }} />
          </div>
        )}
        {level === s.level && levelUp.length > 0 && done === levelUp.length && <p className="text-sm font-semibold text-emerald-800">{t('training.jr.allDone')}</p>}
        {next && level === s.level && (
          <Link to={`${base}/c/${next.id}`} className="block rounded-xl bg-gold/20 p-3">
            <p className="text-sm text-navy/60">{t('training.jr.next')}</p>
            <p className="font-semibold">{next.title_vi}</p>
          </Link>
        )}
        {!s.canEnter && <p className="text-sm text-navy/60">{t('training.jr.viewOnly')}</p>}
      </Card>

      {guardian && waiting.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">{t('training.jr.waiting')}</h2>
          {waiting.map((r) => {
            const c = challengeById.get(r.challenge_id)
            return (
              <Card key={r.id} className="space-y-2 p-4">
                <p className="font-semibold">{c?.title_vi}</p>
                <p className="text-sm text-navy/70">{c?.parts.map((p, i) => `${p.label_vi}: ${r.made[i]}/${p.attempts}`).join(' · ')}</p>
                {r.video_url && <VideoLink url={r.video_url} />}
                {c?.verify === 'video_or_adult' && (
                  <div className="flex gap-2">
                    <Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ p_result_id: r.id, p_approve: true }, { onSuccess: () => toast(t('training.jr.confirmed')), onError: (e) => toast(jrError(e, t)) })}>
                      {t('training.jr.confirmWatched')}
                    </Button>
                    <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate({ p_result_id: r.id, p_approve: false }, { onError: (e) => toast(jrError(e, t)) })}>
                      {t('training.jr.reject')}
                    </Button>
                  </div>
                )}
              </Card>
            )
          })}
        </section>
      )}

      {openAsg.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">{t('training.jr.homework')}</h2>
          {openAsg.map((a) => (
            <Card key={a.id} className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{a.title_vi}</p>
                  <p className="text-sm text-navy/60">
                    {a.class_name}
                    {a.due_date && ` · ${t('training.jr.due', { date: a.due_date })}`}
                    {` · ${t('training.jr.points', { n: a.points })}`}
                  </p>
                </div>
                {a.in_class && <Badge>{t('training.jr.inClass')}</Badge>}
              </div>
              {a.body_vi && <p className="whitespace-pre-line text-sm text-navy/75">{a.body_vi}</p>}
              {a.challenge_id && challengeById.get(a.challenge_id) && (
                <Link to={`${base}/c/${a.challenge_id}`} className="text-sm font-semibold text-bronze">{challengeById.get(a.challenge_id)!.title_vi}</Link>
              )}
              {!a.in_class && s.canEnter && (
                <Checkbox
                  label={a.done_at ? t('training.jr.markedDone') : t('training.jr.markDone')}
                  checked={Boolean(a.done_at)}
                  disabled={mark.isPending}
                  onChange={(e) => mark.mutate({ p_assignment_id: a.id, p_student_id: studentId, p_done: e.target.checked }, { onError: (err) => toast(jrError(err, t)) })}
                />
              )}
              {a.done_at && <p className="text-xs text-navy/50">{t('training.jr.waitCoach')}</p>}
            </Card>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{t('training.jr.cardsOf', { n: level })}</h2>
          <Select aria-label={t('training.jr.pickLevel')} className="w-36" value={level} onChange={(e) => setShowLevel(Number(e.target.value))}>
            {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{t('training.jr.level', { n })}</option>)}
          </Select>
        </div>
        {cards.length === 0 && <p className="text-navy/60">{t('training.jr.noCards')}</p>}
        {cards.map((c) => (
          <Link key={c.id} to={`${base}/c/${c.id}`} className="block">
            <Card className="flex items-center justify-between gap-3 p-4 hover:bg-navy/5">
              <div>
                <p className="font-semibold">{c.title_vi}</p>
                <p className="text-sm text-navy/60">
                  {c.parts.map((p) => t('training.jr.partGoal', { target: p.target, attempts: p.attempts })).join(' · ')}
                  {c.verify === 'coach' && ` · ${t('training.jr.verify.coach')}`}
                  {c.kind === 'practice' && ` · ${t('training.jr.practice')}`}
                </p>
              </div>
              <StateBadge state={cardState(byChallenge.get(c.id) ?? [])} />
            </Card>
          </Link>
        ))}
      </section>

      <Link to={libraryTo} className="flex items-center gap-2 font-semibold text-bronze">
        <BookOpen className="h-4 w-4" /> {t('training.jr.library')}
      </Link>
      <p className="text-sm text-navy/50">{t('training.jr.pointsNote')}</p>
    </Page>
  )
}

function VideoLink({ url }: { url: string }) {
  const { t } = useTranslation()
  return (
    <a href={url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm font-semibold text-bronze">
      <Video className="h-4 w-4" /> {t('training.jr.watchVideo')} <ExternalLink className="h-3 w-3" />
    </a>
  )
}

// ---------------------------------------------------------------- Thẻ thử thách: nhập kết quả

export function ParentKidChallengePage() {
  const { studentId = '', challengeId = '' } = useParams()
  return <ChallengeEntry studentId={studentId} challengeId={challengeId} back={`/app/training/kid/${studentId}`} guardian />
}

export function StudentChallengePage() {
  const { challengeId = '' } = useParams()
  const { studentId } = useAuth()
  return <ChallengeEntry studentId={studentId ?? ''} challengeId={challengeId} back="/me/training" />
}

function Stepper({ value, max, onChange, label }: { value: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <Button type="button" size="sm" variant="outline" aria-label="-" disabled={value <= 0} onClick={() => onChange(value - 1)}><Minus className="h-4 w-4" /></Button>
      <Input
        inputMode="numeric"
        className="w-16 text-center text-lg font-bold"
        aria-label={label}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, '') || 0)
          onChange(Math.min(max, Math.max(0, n)))
        }}
      />
      <Button type="button" size="sm" variant="outline" aria-label="+" disabled={value >= max} onClick={() => onChange(value + 1)}><Plus className="h-4 w-4" /></Button>
    </div>
  )
}

const YT = /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i

function ChallengeEntry({ studentId, challengeId, back, guardian }: { studentId: string; challengeId: string; back: string; guardian?: boolean }) {
  const { t } = useTranslation()
  const toast = useToast()
  const student = useStudent(studentId)
  const challenges = useChallenges()
  const results = useResults(studentId)
  const submit = useJrRpc<{ p_student_id: string; p_challenge_id: string; p_made: number[]; p_video_url: string | null; p_watched: boolean }, { status: Result['status']; level: { proposed: boolean } | null }>('training_submit_result')
  const c = challenges.data?.find((x) => x.id === challengeId)
  const [made, setMade] = useState<number[] | null>(null)
  const [video, setVideo] = useState('')
  const [watched, setWatched] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (student.isPending || challenges.isPending || results.isPending) return <Loading />
  if (!c || !student.data) return <Page title={t('training.title')} back={back}><p className="text-navy/60">{t('errors.loadFailed')}</p></Page>
  const values = made ?? c.parts.map(() => 0)
  const mine = (results.data ?? []).filter((r) => r.challenge_id === c.id)
  const state = cardState(mine)
  const met = partsMet(c.parts, values)
  const badVideo = video.trim() !== '' && !YT.test(video.trim())
  const canEnter = student.data.canEnter && c.verify !== 'coach'

  return (
    <Page title={c.title_vi} back={back}>
      <div className="flex flex-wrap items-center gap-2">
        <StateBadge state={state} />
        <Badge>{t('training.jr.level', { n: c.level_number })}</Badge>
        <Badge>{t(`training.jr.verify.${c.verify}`)}</Badge>
        {c.is_provisional && <Badge>{t('training.jr.provisional')}</Badge>}
      </div>
      {c.how_vi && <p className="whitespace-pre-line text-navy/80">{c.how_vi}</p>}
      <p className="text-sm text-navy/60">{t('training.jr.pointsLine', { n: c.points_reward })}</p>

      {c.verify === 'coach' ? (
        <Card className="p-4"><p className="text-navy/70">{t('training.jr.coachOnly')}</p></Card>
      ) : !canEnter ? (
        <Card className="p-4"><p className="text-navy/70">{t('training.jr.askParent')}</p></Card>
      ) : (
        <Card className="space-y-4 p-5">
          {c.parts.map((p, i) => (
            <div key={i} className="space-y-1">
              <p className="font-semibold">{p.label_vi}</p>
              <p className="text-sm text-navy/60">{t('training.jr.partGoal', { target: p.target, attempts: p.attempts })}{p.provisional && ` · ${t('training.jr.provisional')}`}</p>
              <Stepper label={p.label_vi} value={values[i]} max={p.attempts} onChange={(n) => setMade(values.map((v, j) => (j === i ? n : v)))} />
            </div>
          ))}
          <p className={cn('text-sm font-semibold', met ? 'text-emerald-800' : 'text-navy/60')}>{met ? t('training.jr.metYes') : t('training.jr.metNo')}</p>
          {c.verify === 'video_or_adult' && met && (
            <>
              <Field label={t('training.jr.video')} error={badVideo ? t('training.jr.videoBad') : null}>
                <Input type="url" inputMode="url" placeholder="https://youtu.be/…" value={video} onChange={(e) => setVideo(e.target.value)} />
              </Field>
              {guardian && <Checkbox label={t('training.jr.watched')} checked={watched} onChange={(e) => setWatched(e.target.checked)} />}
              <p className="text-sm text-navy/60">{guardian ? t('training.jr.verifyHintGuardian') : t('training.jr.verifyHintStudent')}</p>
            </>
          )}
          <FormError message={err} />
          <Button
            size="full"
            disabled={submit.isPending || badVideo}
            onClick={() => {
              setErr(null)
              submit.mutate(
                { p_student_id: studentId, p_challenge_id: c.id, p_made: values, p_video_url: video.trim() || null, p_watched: Boolean(guardian && watched) },
                {
                  onSuccess: (r) => {
                    toast(t(`training.jr.saved.${r.status}`))
                    if (r.level?.proposed) toast(t('training.jr.proposed'))
                    setMade(null); setVideo(''); setWatched(false)
                  },
                  onError: (e) => setErr(jrError(e, t)),
                },
              )
            }}
          >
            {t('training.jr.save')}
          </Button>
        </Card>
      )}

      {mine.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">{t('training.jr.history')}</h2>
          {mine.map((r) => (
            <Card key={r.id} className="space-y-1 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-navy/60"><Clock className="mr-1 inline h-3.5 w-3.5" />{new Date(r.created_at).toLocaleDateString('vi-VN')}</span>
                <span className="text-sm font-semibold">{t(`training.jr.status.${r.status}`)}</span>
              </div>
              <p className="text-sm">{c.parts.map((p, i) => `${r.made[i]}/${p.attempts}`).join(' · ')} · {t(`training.jr.by.${r.submitted_as}`)}</p>
              {r.video_url && <VideoLink url={r.video_url} />}
              {r.review_note && <p className="text-sm text-navy/70">{r.review_note}</p>}
            </Card>
          ))}
        </section>
      )}
    </Page>
  )
}

// ---------------------------------------------------------------- Thư viện bài tập

export function ParentLibraryPage() {
  return <Library back="/app/training" />
}
export function StudentLibraryPage() {
  return <Library back="/me/training" />
}

function Library({ back }: { back: string }) {
  const { t } = useTranslation()
  const [skill, setSkill] = useState<string>('')
  const [homeOnly, setHomeOnly] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const q = useQuery({
    queryKey: ['training_drills'],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await db()
        .from('training_drills')
        .select('id, code, title_vi, skill, form, contexts, minutes, attempts, target, unit_vi, goal_vi, steps, easier_vi, harder_vi, safety_vi, video_url, level_from, level_to')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return data as Drill[]
    },
  })
  const list = (q.data ?? []).filter((d) => (!skill || d.skill === skill) && (!homeOnly || d.contexts.includes('home')))
  return (
    <Page title={t('training.jr.library')} back={back}>
      <div className="flex flex-wrap gap-2">
        {['', ...SKILLS].map((k) => (
          <button
            key={k || 'all'}
            type="button"
            aria-pressed={skill === k}
            onClick={() => setSkill(k)}
            className={cn('min-h-9 rounded-full border-2 px-3 text-sm font-semibold', skill === k ? 'border-bronze bg-gold/25' : 'border-navy/15 bg-white text-navy/70')}
          >
            {k ? t(`training.jr.skill.${k}`) : t('training.jr.all')}
          </button>
        ))}
      </div>
      <Checkbox label={t('training.jr.homeOnly')} checked={homeOnly} onChange={(e) => setHomeOnly(e.target.checked)} />
      {q.isPending && <Loading />}
      {list.map((d) => (
        <Card key={d.id} className="p-4">
          <button type="button" className="flex w-full items-start justify-between gap-2 text-left" aria-expanded={open === d.id} onClick={() => setOpen(open === d.id ? null : d.id)}>
            <div>
              <p className="font-semibold">{d.title_vi}</p>
              <p className="text-sm text-navy/60">
                {t(`training.jr.skill.${d.skill}`)}
                {d.minutes && ` · ${t('training.fmt.min', { n: d.minutes })}`}
                {d.attempts != null && d.target != null && ` · ${d.target}/${d.attempts} ${d.unit_vi ?? ''}`}
              </p>
            </div>
            {d.contexts.includes('home') && <Badge>{t('training.jr.atHome')}</Badge>}
          </button>
          {open === d.id && (
            <div className="mt-3 space-y-2 text-sm">
              {d.goal_vi && <p>{d.goal_vi}</p>}
              <ol className="list-decimal space-y-1 pl-5">{d.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
              {d.easier_vi && <p><b>{t('training.jr.easier')}:</b> {d.easier_vi}</p>}
              {d.harder_vi && <p><b>{t('training.jr.harder')}:</b> {d.harder_vi}</p>}
              {d.safety_vi && <p className="text-red-800"><b>{t('training.jr.safety')}:</b> {d.safety_vi}</p>}
              {d.video_url && <VideoLink url={d.video_url} />}
            </div>
          )}
        </Card>
      ))}
      {!q.isPending && list.length === 0 && <p className="text-navy/60">{t('training.jr.noDrills')}</p>}
    </Page>
  )
}

// ---------------------------------------------------------------- HLV: tập luyện của lớp

interface ProgressRow { student_id: string; full_name: string; student_code: string | null; level: number; total: number; done: number; pending: number; proposed: boolean }
interface PendingRow { id: string; student_id: string; full_name: string; title_vi: string; level: number; parts: Part[]; made: number[]; video_url: string | null; submitted_as: Result['submitted_as']; created_at: string }
interface CoachAssignment { id: string; title_vi: string; body_vi: string | null; due_date: string | null; points: number; in_class: boolean; challenge_id: string | null; created_at: string; marks: { student_id: string; confirmed_at: string | null }[] }

export function CoachClassTrainingPage() {
  const { classId = '' } = useParams()
  const { t } = useTranslation()
  const cls = useQuery({
    queryKey: ['training_coach_class', classId],
    queryFn: async () => {
      const { data, error } = await db().from('classes').select('id, name').eq('id', classId).maybeSingle()
      if (error) throw error
      return data as { id: string; name: string } | null
    },
  })
  const [tab, setTab] = useState<'progress' | 'pending' | 'mark' | 'homework'>('progress')
  if (cls.isPending) return <Loading />
  if (!cls.data) return <p className="text-navy/60">{t('coach.noAccessClass')}</p>
  return (
    <div className="space-y-5">
      <Back to={`/coach/classes/${classId}`} label={cls.data.name} />
      <h1 className="text-2xl font-bold">{t('training.title')} · {cls.data.name}</h1>
      <div className="flex flex-wrap gap-2">
        {(['progress', 'pending', 'mark', 'homework'] as const).map((k) => (
          <Button key={k} size="sm" variant={tab === k ? 'primary' : 'outline'} onClick={() => setTab(k)}>{t(`training.coach.tab.${k}`)}</Button>
        ))}
      </div>
      {tab === 'progress' && <CoachProgress classId={classId} />}
      {tab === 'pending' && <CoachPending classId={classId} />}
      {tab === 'mark' && <CoachMark classId={classId} />}
      {tab === 'homework' && <CoachHomework classId={classId} />}
    </div>
  )
}

function useProgress(classId: string) {
  return useQuery({
    queryKey: ['training_coach_progress', classId],
    queryFn: async () => {
      const { data, error } = await db().rpc('training_class_progress', { p_class_id: classId })
      if (error) throw error
      return data as ProgressRow[]
    },
  })
}

function CoachProgress({ classId }: { classId: string }) {
  const { t } = useTranslation()
  const q = useProgress(classId)
  if (q.isPending) return <Loading />
  if (q.isError) return <p className="text-red-700">{t('errors.loadFailed')}</p>
  return (
    <TableWrap>
      <table className="w-full">
        <thead><tr><th className={th}>{t('fields.fullName')}</th><th className={th}>{t('training.coach.level')}</th><th className={th}>{t('training.jr.cardsDone')}</th><th className={th}>{t('training.coach.pendingCol')}</th><th className={th}></th></tr></thead>
        <tbody>
          {q.data.map((r) => (
            <tr key={r.student_id}>
              <td className={td}><Link to={`/coach/students/${r.student_id}`} className="font-semibold">{r.full_name}</Link></td>
              <td className={td}>{r.level}</td>
              <td className={td}>{r.total ? `${r.done}/${r.total}` : '—'}</td>
              <td className={td}>{r.pending || ''}</td>
              <td className={td}>{r.proposed && <Badge>{t('training.coach.proposed')}</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {q.data.length === 0 && <p className="p-4 text-navy/60">{t('training.coach.empty')}</p>}
    </TableWrap>
  )
}

function CoachPending({ classId }: { classId: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const q = useQuery({
    queryKey: ['training_coach_pending', classId],
    queryFn: async () => {
      const { data, error } = await db().rpc('training_class_pending', { p_class_id: classId })
      if (error) throw error
      return data as PendingRow[]
    },
  })
  const review = useJrRpc<{ p_result_id: string; p_approve: boolean; p_note: string | null }>('training_review_result')
  const [note, setNote] = useState<Record<string, string>>({})
  if (q.isPending) return <Loading />
  if (q.isError) return <p className="text-red-700">{t('errors.loadFailed')}</p>
  if (!q.data.length) return <p className="text-navy/60">{t('training.coach.noPending')}</p>
  return (
    <div className="space-y-3">
      {q.data.map((r) => (
        <Card key={r.id} className="space-y-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{r.full_name}</p>
            <span className="text-sm text-navy/60">{t('training.jr.level', { n: r.level })} · {t(`training.jr.by.${r.submitted_as}`)}</span>
          </div>
          <p>{r.title_vi}</p>
          <p className="text-sm text-navy/70">{r.parts.map((p, i) => `${p.label_vi}: ${r.made[i]}/${p.attempts} (${t('training.coach.need', { n: p.target })})`).join(' · ')}</p>
          {r.video_url ? <VideoLink url={r.video_url} /> : <p className="text-sm text-navy/50">{t('training.coach.noVideo')}</p>}
          <Input placeholder={t('training.coach.note')} value={note[r.id] ?? ''} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} />
          <div className="flex gap-2">
            <Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ p_result_id: r.id, p_approve: true, p_note: note[r.id] || null }, { onSuccess: () => toast(t('training.jr.confirmed')), onError: (e) => toast(jrError(e, t)) })}>
              <Check className="h-4 w-4" /> {t('training.coach.approve')}
            </Button>
            <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate({ p_result_id: r.id, p_approve: false, p_note: note[r.id] || null }, { onError: (e) => toast(jrError(e, t)) })}>
              {t('training.jr.reject')}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  )
}

function CoachMark({ classId }: { classId: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const progress = useProgress(classId)
  const challenges = useChallenges()
  const mark = useJrRpc<{ p_challenge_id: string; p_student_ids: string[]; p_passed: boolean; p_note: string | null }, number>('training_coach_mark')
  const [pickedLevel, setLevel] = useState<number | null>(null)
  const [challengeId, setChallengeId] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  if (progress.isPending || challenges.isPending) return <Loading />
  const level = pickedLevel ?? Math.min(20, ...(progress.data ?? []).map((s) => s.level))
  const list = (challenges.data ?? []).filter((c) => c.level_number === level)
  const students = (progress.data ?? []).filter((s) => s.level === level)
  const others = (progress.data ?? []).filter((s) => s.level !== level)
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])
  const run = (passed: boolean) =>
    mark.mutate(
      { p_challenge_id: challengeId, p_student_ids: picked, p_passed: passed, p_note: null },
      { onSuccess: (n) => { toast(t('training.coach.marked', { n })); setPicked([]) }, onError: (e) => toast(jrError(e, t)) },
    )
  return (
    <Card className="max-w-xl space-y-4 p-5">
      <p className="text-sm text-navy/70">{t('training.coach.markHint')}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('training.coach.level')}>
          <Select value={level} onChange={(e) => { setLevel(Number(e.target.value)); setChallengeId(''); setPicked([]) }}>
            {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{t('training.jr.level', { n })}</option>)}
          </Select>
        </Field>
        <Field label={t('training.coach.card')}>
          <Select value={challengeId} onChange={(e) => setChallengeId(e.target.value)}>
            <option value="">—</option>
            {list.map((c) => <option key={c.id} value={c.id}>{c.title_vi}</option>)}
          </Select>
        </Field>
      </div>
      <div className="space-y-1">
        {students.map((s) => <Checkbox key={s.student_id} label={s.full_name} checked={picked.includes(s.student_id)} onChange={() => toggle(s.student_id)} />)}
        {others.length > 0 && (
          <details className="pt-2">
            <summary className="cursor-pointer text-sm text-navy/60">{t('training.coach.otherLevels', { n: others.length })}</summary>
            {others.map((s) => <Checkbox key={s.student_id} label={`${s.full_name} (${t('training.jr.level', { n: s.level })})`} checked={picked.includes(s.student_id)} onChange={() => toggle(s.student_id)} />)}
          </details>
        )}
        {!students.length && !others.length && <p className="text-navy/60">{t('training.coach.empty')}</p>}
      </div>
      <div className="flex gap-2">
        <Button disabled={!challengeId || !picked.length || mark.isPending} onClick={() => run(true)}>{t('training.coach.markPass', { n: picked.length })}</Button>
        <Button variant="outline" disabled={!challengeId || !picked.length || mark.isPending} onClick={() => run(false)}>{t('training.coach.markFail')}</Button>
      </div>
    </Card>
  )
}

function CoachHomework({ classId }: { classId: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const pts = useTrainingPoints()
  const progress = useProgress(classId)
  const challenges = useChallenges()
  const list = useQuery({
    queryKey: ['training_coach_assignments', classId],
    queryFn: async () => {
      const { data, error } = await db()
        .from('training_assignments')
        .select('id, title_vi, body_vi, due_date, points, in_class, challenge_id, created_at, marks:training_assignment_marks(student_id, confirmed_at)')
        .eq('class_id', classId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as CoachAssignment[]
    },
  })
  const [form, setForm] = useState({ title: '', body: '', due: '', inClass: false, challengeId: '', points: '' })
  const [err, setErr] = useState<string | null>(null)
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await db().from('training_assignments').insert({
        class_id: classId, title_vi: form.title.trim(), body_vi: form.body.trim() || null, due_date: form.due || null,
        in_class: form.inClass, challenge_id: form.challengeId || null,
        points: form.points ? Number(form.points) : form.inClass ? pts.in_class : pts.assignment, created_by: profile?.user_id,
      })
      if (error) throw error
    },
    onSuccess: () => { setForm({ title: '', body: '', due: '', inClass: false, challengeId: '', points: '' }); qc.invalidateQueries({ queryKey: ['training_coach_assignments'] }); toast(t('training.coach.created')) },
    onError: (e) => setErr(jrError(e, t)),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().from('training_assignments').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['training_coach_assignments'] }),
  })
  const confirm = useJrRpc<{ p_assignment_id: string; p_student_ids: string[] }, number>('training_confirm_marks')
  const markOne = useJrRpc<{ p_assignment_id: string; p_student_id: string; p_done: boolean }>('training_mark_assignment')
  const [openId, setOpenId] = useState<string | null>(null)
  const students = progress.data ?? []
  const levels = [...new Set(students.map((s) => s.level))].sort((a, b) => a - b)

  return (
    <div className="space-y-5">
      <Card className="max-w-xl space-y-3 p-5">
        <h2 className="text-lg font-bold">{t('training.coach.newHomework')}</h2>
        <Field label={t('training.coach.hwTitle')}><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label={t('training.coach.hwBody')}><Textarea rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('training.coach.hwDue')}><Input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} /></Field>
          <Field label={t('training.coach.hwPoints')}><Input inputMode="numeric" placeholder={String(form.inClass ? pts.in_class : pts.assignment)} value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value.replace(/\D/g, '') })} /></Field>
        </div>
        <Field label={t('training.coach.hwCard')}>
          <Select value={form.challengeId} onChange={(e) => setForm({ ...form, challengeId: e.target.value })}>
            <option value="">—</option>
            {(challenges.data ?? []).filter((c) => levels.includes(c.level_number) && c.verify !== 'coach').map((c) => (
              <option key={c.id} value={c.id}>{t('training.jr.level', { n: c.level_number })} · {c.title_vi}</option>
            ))}
          </Select>
        </Field>
        <Checkbox label={t('training.coach.hwInClass')} checked={form.inClass} onChange={(e) => setForm({ ...form, inClass: e.target.checked })} />
        <FormError message={err} />
        <Button disabled={!form.title.trim() || create.isPending} onClick={() => { setErr(null); create.mutate() }}>{t('training.coach.assign')}</Button>
        <p className="text-xs text-navy/50">{t('training.jr.pointsNote')}</p>
      </Card>

      {list.isPending ? <Loading /> : (list.data ?? []).map((a) => {
        const marked = a.marks.filter((m) => !m.confirmed_at)
        const confirmedCount = a.marks.filter((m) => m.confirmed_at).length
        return (
          <Card key={a.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{a.title_vi}</p>
                <p className="text-sm text-navy/60">
                  {a.due_date && `${t('training.jr.due', { date: a.due_date })} · `}
                  {t('training.jr.points', { n: a.points })} · {t('training.coach.counts', { marked: marked.length, confirmed: confirmedCount, total: students.length })}
                </p>
              </div>
              {a.in_class && <Badge>{t('training.jr.inClass')}</Badge>}
            </div>
            <div className="flex flex-wrap gap-2">
              {marked.length > 0 && (
                <Button size="sm" disabled={confirm.isPending} onClick={() => confirm.mutate({ p_assignment_id: a.id, p_student_ids: marked.map((m) => m.student_id) }, { onSuccess: (n) => toast(t('training.coach.confirmedN', { n })) })}>
                  {t('training.coach.confirmAll', { n: marked.length })}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setOpenId(openId === a.id ? null : a.id)}>{t('training.coach.perStudent')}</Button>
              <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(a.id)}>{t('common.remove')}</Button>
            </div>
            {openId === a.id && (
              <div className="space-y-1 border-t border-navy/10 pt-2">
                {students.map((s) => {
                  const m = a.marks.find((x) => x.student_id === s.student_id)
                  return (
                    <Checkbox
                      key={s.student_id}
                      label={`${s.full_name}${m && !m.confirmed_at ? ` · ${t('training.coach.markedByFamily')}` : ''}`}
                      checked={Boolean(m?.confirmed_at)}
                      disabled={markOne.isPending}
                      onChange={(e) => markOne.mutate({ p_assignment_id: a.id, p_student_id: s.student_id, p_done: e.target.checked }, { onError: (er) => toast(jrError(er, t)) })}
                    />
                  )
                })}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
