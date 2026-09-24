import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, ChevronRight, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useTable } from '@/lib/db'
import { formatCode } from '@/lib/codes'
import { formatDate, useLocalized } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { FormError, Textarea } from '@/components/ui/form'
import { Mascot } from '@/components/Mascot'
import { ComingSoon } from '@/components/ComingSoon'
import { useToast } from '@/components/ui/toast'
import { StageBar } from '@/features/parent/ParentHomePage'
import { PASSPORT_TONE } from '@/features/passports/PassportDetailDialog'
import type { Level, Program } from '@/lib/types'
import { useSignedPhoto, type StudentProfile } from './useStudentProfile'
import { ChildInfoForm } from './ChildInfoForm'
import { GuardiansTab } from '@/features/guardians/GuardiansTab'

type Tab = 'overview' | 'roadmap' | 'courses' | 'certificates' | 'passport' | 'guardians' | 'info'

/** Hồ sơ học viên (F8). Phụ huynh: đủ 7 mục; nhân viên (HLV, trường) và chính học viên (F7, chỉ xem): Tổng quan, Lộ trình, Khoá học, Chứng nhận, Passport. */
export function StudentProfileView({ profile }: { profile: StudentProfile }) {
  const { t } = useTranslation()
  const tabs: Tab[] =
    profile.viewer === 'guardian'
      ? ['overview', 'roadmap', 'courses', 'certificates', 'passport', 'guardians', 'info']
      : ['overview', 'roadmap', 'courses', 'certificates', 'passport']
  const [tab, setTab] = useState<Tab>('overview')

  if (profile.viewer === 'pending') return <PendingView profile={profile} />

  return (
    <div className="space-y-4">
      <Header profile={profile} />
      <div className="-mx-4 overflow-x-auto px-4" role="tablist">
        <div className="flex w-max gap-2 pb-1">
          {tabs.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold ${tab === k ? 'bg-navy text-white' : 'bg-white text-navy/70 ring-1 ring-navy/15'}`}
            >
              {t(`profile.tab.${k}`)}
            </button>
          ))}
        </div>
      </div>
      {tab === 'overview' && <Overview profile={profile} />}
      {tab === 'roadmap' && <Roadmap profile={profile} />}
      {tab === 'courses' && <Courses profile={profile} />}
      {tab === 'certificates' && <Certificates profile={profile} />}
      {tab === 'passport' && <PassportTab profile={profile} />}
      {tab === 'guardians' && <GuardiansTab profile={profile} />}
      {tab === 'info' && <ChildInfoForm profile={profile} />}
    </div>
  )
}

export function Avatar({ path, className = 'h-20 w-20' }: { path?: string | null; className?: string }) {
  const url = useSignedPhoto(path)
  return url.data ? (
    <img src={url.data} alt="" className={`${className} shrink-0 rounded-full object-cover`} />
  ) : (
    <span className={`${className} flex shrink-0 items-center justify-center rounded-full bg-gold/25`}>
      <Mascot className="h-3/4 w-3/4" />
    </span>
  )
}

function Header({ profile }: { profile: StudentProfile }) {
  const s = profile.student
  return (
    <div className="flex items-center gap-4">
      <Avatar path={s.avatar_path} />
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">{s.full_name}</h1>
        <p className="text-sm text-navy/60">{[s.student_code, s.school_name, s.grade_class].filter(Boolean).join(' · ')}</p>
      </div>
    </div>
  )
}

function PendingView({ profile }: { profile: StudentProfile }) {
  const { t } = useTranslation()
  return (
    <Card className="space-y-3 p-5 text-center">
      <Mascot className="mx-auto h-20 w-20" />
      <h1 className="text-2xl font-bold">{profile.student.full_name}</h1>
      <p className="text-3xl font-bold">Level {profile.level?.number ?? 1}</p>
      <Badge tone="warn">{t('parent.pendingLink')}</Badge>
      <p className="text-navy/70">{t('parent.pendingLinkHint')}</p>
    </Card>
  )
}

function Overview({ profile }: { profile: StudentProfile }) {
  const { t } = useTranslation()
  const loc = useLocalized()
  const lv = profile.level
  const goals = profile.student.golf_goals ?? []
  return (
    <div className="space-y-4">
      <Card className="space-y-3 bg-navy p-5 text-white">
        <p className="text-sm text-white/70">{t('parent.currentLevel')}</p>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-5xl font-bold text-gold">{lv?.number ?? 1}</p>
            <p className="text-lg font-semibold">{loc(lv, 'name')}</p>
            <p className="text-sm text-white/70">{loc(lv, 'group_name')}</p>
          </div>
          {lv?.tier && <Badge className="bg-gold/25 text-gold">{loc(lv.tier, 'name')}</Badge>}
        </div>
      </Card>

      <Card className="space-y-2 p-4">
        <p className="text-sm font-semibold text-navy/70">{t('profile.stages')}</p>
        <StageBar current={lv?.stage?.number ?? null} />
        {lv?.stage && (
          <p className="font-semibold">
            {t('parent.stage', { n: lv.stage.number })}: {loc(lv.stage, 'name')}
          </p>
        )}
      </Card>

      <Card className="space-y-2 p-4">
        <p className="text-sm font-semibold text-navy/70">{t('fields.golfGoals')}</p>
        {goals.length === 0 ? (
          <p className="text-navy/55">{t('profile.noGoals')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {goals.map((g) => (
              <Badge key={g}>{g === 'other' && profile.student.golf_goals_other ? profile.student.golf_goals_other : t(`golfGoals.${g}`)}</Badge>
            ))}
          </div>
        )}
      </Card>

      {!profile.has_history && profile.viewer === 'guardian' && <HistoryRequest profile={profile} />}
    </div>
  )
}

/** "Con đang bắt đầu Level 1" + "Con đã từng học golf? Báo cho Trung tâm" (F8). */
function HistoryRequest({ profile }: { profile: StudentProfile }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const send = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!.rpc('request_history_update', { p_student_id: profile.student.id, p_body: body })
      if (error) throw error
    },
    onSuccess: () => {
      toast(t('profile.historySent'))
      setOpen(false)
      qc.invalidateQueries({ queryKey: ['student_profile', profile.student.id] })
    },
  })
  return (
    <Card className="space-y-3 border-gold bg-gold/10 p-4">
      <p className="font-semibold">{t('profile.startingLevel1')}</p>
      {profile.history_request_pending ? (
        <p className="text-sm text-brown">{t('profile.historyPending')}</p>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          {t('profile.historyAsk')}
        </Button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={t('profile.historyAsk')}>
        <div className="space-y-3">
          <p className="text-navy/75">{t('profile.historyHint')}</p>
          <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
          <FormError message={send.isError ? t('errors.generic') : null} />
          <Button size="full" disabled={!body.trim() || send.isPending} onClick={() => send.mutate()}>
            {t('profile.historySend')}
          </Button>
        </div>
      </Dialog>
    </Card>
  )
}

/** Sơ đồ 20 level chia 5 nhóm: đã hoàn thành (dấu tích + ngày), đang học (nổi bật), level sau (mờ) — F8. */
function Roadmap({ profile }: { profile: StudentProfile }) {
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  const programs = useTable<Program>('programs', { order: 'code' })
  const levels = useTable<Level>('levels', { order: 'number' })
  const [openLevel, setOpenLevel] = useState<Level | null>(null)
  const core = programs.data?.find((p) => p.code === 'core20')
  const done = new Map((profile.completed_levels ?? []).filter((c) => c.program === 'core20').map((c) => [c.number, c.completed_at]))
  const current = profile.level?.number ?? 1

  const groups = useMemo(() => {
    const list = (levels.data ?? []).filter((l) => l.program_id === core?.id)
    const out: { name: string; levels: Level[] }[] = []
    for (const l of list) {
      const name = loc(l, 'group_name')
      if (!out.length || out[out.length - 1].name !== name) out.push({ name, levels: [] })
      out[out.length - 1].levels.push(l)
    }
    return out
  }, [levels.data, core, loc])

  if (levels.isPending) return <p className="text-navy/60">{t('common.loading')}</p>

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.name} className="space-y-2">
          <h3 className="text-sm font-bold tracking-wide text-bronze uppercase">{g.name}</h3>
          <ul className="space-y-2">
            {g.levels.map((l) => {
              const isDone = done.has(l.number)
              const isCurrent = !isDone && l.number === current
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => setOpenLevel(l)}
                    className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 py-2 text-left ${
                      isCurrent ? 'border-bronze bg-gold/15 shadow-sm' : isDone ? 'border-navy/10 bg-white' : 'border-navy/10 bg-white opacity-55'
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold ${
                        isDone ? 'bg-emerald-600 text-white' : isCurrent ? 'bg-bronze text-white' : 'bg-navy/10 text-navy/60'
                      }`}
                    >
                      {isDone ? <Check className="h-5 w-5" /> : l.number}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{loc(l, 'name')}</span>
                      <span className="block text-sm text-navy/60">
                        {isDone
                          ? t('profile.completedOn', { date: done.get(l.number) ? formatDate(done.get(l.number)!, i18n.language) : '—' })
                          : isCurrent
                            ? t('profile.learningNow')
                            : l.target_handicap
                              ? t('profile.targetHandicap', { h: l.target_handicap })
                              : ''}
                      </span>
                    </span>
                    {!isDone && !isCurrent ? <Lock className="h-4 w-4 text-navy/35" /> : <ChevronRight className="h-4 w-4 text-bronze" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      <LevelDetailDialog level={openLevel} onClose={() => setOpenLevel(null)} />
    </div>
  )
}

const CONTENT_GROUPS = ['technique', 'culture', 'rules', 'knowledge', 'life_skills', 'other'] as const

/** Chi tiết level: mục tiêu nhóm, handicap mục tiêu; Level 1–3 có đủ nội dung theo mảng (phụ lục B). */
function LevelDetailDialog({ level, onClose }: { level: Level | null; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  const rows = level?.content_detail?.rows ?? []
  const lang = i18n.language === 'en' ? 'en' : 'vi'
  return (
    <Dialog open={level !== null} onClose={onClose} title={level ? loc(level, 'name') : ''}>
      {level && (
        <div className="space-y-4">
          <Card className="space-y-1 p-4">
            <p className="text-sm text-navy/60">{loc(level, 'group_name')}</p>
            <p>{loc(level, 'summary')}</p>
            {level.target_handicap && <p className="font-semibold">{t('profile.targetHandicap', { h: level.target_handicap })}</p>}
          </Card>
          {rows.length === 0 ? (
            <p className="text-navy/60">{t('profile.noLevelDetail')}</p>
          ) : (
            CONTENT_GROUPS.map((g) => {
              const items = rows.filter((r) => r.group === g)
              if (!items.length) return null
              return (
                <section key={g} className="space-y-2">
                  <h3 className="font-bold text-bronze">{t(`profile.contentGroup.${g}`)}</h3>
                  <ul className="space-y-2">
                    {items.map((r) => (
                      <li key={r.key} className="rounded-xl bg-white p-3 shadow-sm">
                        <p className="text-sm font-semibold text-navy/65">{lang === 'en' ? r.label_en : r.label_vi}</p>
                        <p>{lang === 'en' ? r.en : r.vi}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })
          )}
          {level.content_detail?.draft && <p className="text-xs text-navy/45">{t('profile.draftContent')}</p>}
        </div>
      )}
    </Dialog>
  )
}

function Courses({ profile }: { profile: StudentProfile }) {
  const { t } = useTranslation()
  const loc = useLocalized()
  const list = profile.courses ?? []
  if (!list.length) return <Empty text={t('profile.noCourses')} />
  return (
    <ul className="space-y-3">
      {list.map((c) => (
        <li key={c.id}>
          <Card className="space-y-1 p-4">
            <p className="text-sm font-semibold text-bronze">{c.academic_year ?? '—'}</p>
            <p className="font-semibold">{c.course_name}</p>
            <p className="text-sm text-navy/65">{[c.school, c.grade_class].filter(Boolean).join(' · ')}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {c.program_code && <Badge>{loc({ name_vi: c.program_vi, name_en: c.program_en }, 'name')}</Badge>}
              {c.sessions_count && <Badge>{t('profile.sessions', { count: c.sessions_count })}</Badge>}
              {c.level_number && (
                <Badge tone="good">{c.level_program === 'core20' ? t('profile.levelAchieved', { n: c.level_number }) : t('profile.journeyAchieved', { n: c.level_number })}</Badge>
              )}
            </div>
          </Card>
        </li>
      ))}
    </ul>
  )
}

function Certificates({ profile }: { profile: StudentProfile }) {
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  const list = profile.certificates ?? []
  return (
    <div className="space-y-3">
      {list.length === 0 ? (
        <Empty text={t('profile.noCertificates')} />
      ) : (
        <ul className="space-y-3">
          {list.map((c) => (
            <li key={c.id}>
              <Card className="p-4">
                <p className="font-semibold">{loc(c, 'title')}</p>
                <p className="text-sm text-navy/60">{formatDate(c.issued_at, i18n.language)}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {/* Xem ảnh, tải PDF, chia sẻ link xác thực: Bước 12 */}
      <ComingSoon title={t('profile.certificateActions')} />
    </div>
  )
}

function PassportTab({ profile }: { profile: StudentProfile }) {
  const { t, i18n } = useTranslation()
  const list = profile.passports ?? []
  const current = list.find((p) => p.status === 'active') ?? list.find((p) => p.status === 'assigned')
  const fmt = (d: string | null) => (d ? formatDate(d, i18n.language) : '—')
  const tier = (p: (typeof list)[number]) => (i18n.language === 'en' ? p.tier_en : p.tier_vi)
  return (
    <div className="space-y-4">
      {current ? (
        <Card className="space-y-2 p-4">
          <p className="text-sm font-semibold text-navy/60">{t('profile.currentPassport')}</p>
          <p className="font-mono text-2xl font-bold">{formatCode(current.code)}</p>
          <p className="font-semibold">{tier(current)}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-navy/60">{t('passports.issuedAt')}</dt>
            <dd>{fmt(current.issued_at)}</dd>
            <dt className="text-navy/60">{t('passports.expiresAt')}</dt>
            <dd>{fmt(current.expires_at)}</dd>
          </dl>
          {profile.viewer === 'guardian' && (
            <Button variant="outline" size="sm" disabled>
              {t('profile.reportLost')} · {t('common.comingSoon')}
            </Button>
          )}
        </Card>
      ) : (
        <Empty text={t('passports.none')} />
      )}
      {list.length > 1 && (
        <section className="space-y-2">
          <h3 className="font-bold">{t('profile.passportHistory')}</h3>
          <ul className="space-y-2">
            {list.filter((p) => p !== current).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono font-semibold">{formatCode(p.code)}</span>
                <Badge tone={PASSPORT_TONE[p.status]}>{t(`passportStatus.${p.status}`)}</Badge>
                <span className="text-navy/60">{tier(p)} · {fmt(p.issued_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Empty({ text }: { text: string }): ReactNode {
  return (
    <Card className="flex flex-col items-center gap-2 p-6 text-center">
      <Mascot className="h-16 w-16" />
      <p className="text-navy/65">{text}</p>
    </Card>
  )
}
