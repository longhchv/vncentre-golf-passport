import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Download, Search, Undo2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { formatDateTime, useLocalized } from '@/lib/i18nField'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Badge, Card, TableWrap, td, th } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, FormError, Input, Select, Textarea } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { downloadBlob } from '@/features/passports/exports'
import { callRpc } from '@/features/partners/shared'
import { GiftItemsPanel, GiftOrdersPanel } from './GiftPages'
import { OpeningImportPanel } from './OpeningImport'

// Spec 19 mục 4 (bước 4): màn "Ghi điểm thưởng" cho admin, HLV trưởng, HLV lớp; huỷ lần ghi sai;
// admin: sổ điểm theo học viên / nguồn / tháng (CSV) và danh mục nguồn điểm. Máy chủ kiểm quyền từng con (reward_record).

interface ManualRule {
  id: string
  code: string
  name_vi: string
  name_en: string
  default_points: number
  min_points: number
  max_points: number
  note_required: boolean
  photo_allowed: boolean
  first_pass_only: boolean
  class_only: boolean
}
interface RewardClass {
  id: string
  name: string
  school: string | null
  students: number
}
interface PickStudent {
  id: string
  full_name: string
  student_code: string
  birth_year?: number | null
}
interface RecentRecord {
  id: string
  created_at: string
  delta: number
  reason: string
  note: string | null
  full_name: string
  student_code: string
  rule_vi: string | null
  rule_en: string | null
  created_by_name: string | null
  mine: boolean
  voided: boolean
  void_reason: string | null
  can_void: boolean
}

const ERROR_CODES = [
  'note_required',
  'points_out_of_range',
  'forbidden',
  'already_passed',
  'students_required',
  'rule_unavailable',
  'attachment_not_allowed',
  'reason_required',
  'already_voided',
  'not_voidable',
  'too_many',
]

function useRewardError() {
  const { t } = useTranslation()
  return (e: unknown) => {
    const msg = (e as { message?: string } | null)?.message ?? ''
    return ERROR_CODES.includes(msg) ? t(`rewards.errors.${msg}`) : t('errors.generic')
  }
}

const tabClass = (on: boolean) =>
  cn('min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold', on ? 'bg-navy text-white' : 'bg-white text-navy/70 ring-1 ring-navy/15')

/** HLV: Ghi điểm thưởng (lớp mình; HLV trưởng thêm tìm một học viên bất kỳ). */
export function CoachRewardsPage() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold">{t('rewards.record.title')}</h1>
      <RecordPanel />
      <RecentRecords />
    </div>
  )
}

/** Admin: Ghi điểm · Sổ điểm · Nguồn điểm. */
export function AdminRewardsPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'record' | 'import' | 'ledger' | 'rules' | 'gifts' | 'orders'>('record')
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('rewards.admin.title')}</h1>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['record', 'import', 'ledger', 'rules', 'gifts', 'orders'] as const).map((k) => (
          <button key={k} type="button" className={tabClass(tab === k)} onClick={() => setTab(k)}>
            {t(`rewards.admin.tab.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'record' && (
        <div className="max-w-3xl space-y-5">
          <RecordPanel />
          <RecentRecords />
        </div>
      )}
      {tab === 'import' && <OpeningImportPanel />}
      {tab === 'ledger' && <LedgerPanel />}
      {tab === 'rules' && <RulesPanel />}
      {tab === 'gifts' && <GiftItemsPanel />}
      {tab === 'orders' && <GiftOrdersPanel />}
    </div>
  )
}

function StudentSearch({ onPick }: { onPick: (s: PickStudent) => void }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const found = useQuery({
    queryKey: ['reward_find_students', term],
    enabled: term.length >= 2,
    queryFn: () => callRpc<PickStudent[]>('reward_find_students', { p_query: term }),
  })
  return (
    <div className="space-y-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setTerm(q.trim())
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('rewards.record.searchPlaceholder')} />
        <Button type="submit" variant="outline" aria-label={t('rewards.record.search')}>
          <Search className="h-4 w-4" />
        </Button>
      </form>
      {found.data && found.data.length === 0 && <p className="text-sm text-navy/60">{t('rewards.record.noStudents')}</p>}
      {found.data && found.data.length > 0 && (
        <ul className="divide-y divide-navy/10 rounded-xl ring-1 ring-navy/10">
          {found.data.map((s) => (
            <li key={s.id}>
              <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-navy/5" onClick={() => onPick(s)}>
                <span className="font-semibold">{s.full_name}</span> <span className="text-navy/60">· {s.student_code}</span>
                {s.birth_year ? <span className="text-navy/60"> · {s.birth_year}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RecordPanel() {
  const { t } = useTranslation()
  const loc = useLocalized()
  const toast = useToast()
  const errorText = useRewardError()
  const qc = useQueryClient()
  const { hasRole } = useAuth()
  const canSearch = hasRole('admin') || hasRole('head_coach')

  const rules = useQuery({ queryKey: ['reward_rules_manual'], queryFn: () => callRpc<ManualRule[]>('reward_rules_manual') })
  const classes = useQuery({ queryKey: ['reward_classes'], queryFn: () => callRpc<RewardClass[]>('reward_classes') })

  const [mode, setMode] = useState<'class' | 'student'>('class')
  const [classId, setClassId] = useState('')
  const roster = useQuery({
    queryKey: ['reward_class_roster', classId],
    enabled: Boolean(classId),
    queryFn: () => callRpc<PickStudent[]>('reward_class_roster', { p_class_id: classId }),
  })
  const [picked, setPicked] = useState<Record<string, PickStudent>>({})
  const [single, setSingle] = useState<PickStudent | null>(null)
  const [code, setCode] = useState('')
  const rule = rules.data?.find((r) => r.code === code) ?? null
  const [points, setPoints] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (rule) setPoints(String(rule.default_points))
  }, [rule])
  useEffect(() => {
    // Mặc định chọn cả lớp khi đổi lớp
    setPicked(Object.fromEntries((roster.data ?? []).map((s) => [s.id, s])))
  }, [roster.data])

  const targets: PickStudent[] = mode === 'student' ? (single ? [single] : []) : Object.values(picked)
  const wholeClass = mode === 'class' && roster.data && targets.length === roster.data.length && targets.length > 0
  const photoOk = Boolean(rule?.photo_allowed && targets.length === 1)

  const save = useMutation({
    mutationFn: async () => {
      let path: string | null = null
      if (file && photoOk) {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
        path = `${targets[0].id}/${crypto.randomUUID()}.${ext}`
        const { error: e } = await supabase!.storage.from('reward-proofs').upload(path, file, { contentType: file.type })
        if (e) throw e
      }
      return callRpc<{ count: number; points: number }>('reward_record', {
        p_student_ids: wholeClass ? null : targets.map((s) => s.id),
        p_class_id: wholeClass ? classId : null,
        p_rule_code: code,
        p_points: Number(points),
        p_note: note,
        p_attachment_path: path,
      })
    },
    onSuccess: (r) => {
      toast(t('rewards.record.saved', { count: r.count, points: r.points }))
      setNote('')
      setFile(null)
      setError(null)
      void qc.invalidateQueries({ queryKey: ['reward_recent_records'] })
    },
    onError: (e) => setError(errorText(e)),
  })

  const ptsNum = Number(points)
  const ptsBad = !rule || !Number.isInteger(ptsNum) || ptsNum < rule.min_points || ptsNum > rule.max_points
  const noteBad = Boolean(rule?.note_required && !note.trim())

  return (
    <Card className="space-y-4 p-4">
      <div className="flex gap-2">
        <button type="button" className={tabClass(mode === 'class')} onClick={() => setMode('class')}>
          {t('rewards.record.byClass')}
        </button>
        {canSearch && (
          <button type="button" className={tabClass(mode === 'student')} onClick={() => setMode('student')}>
            {t('rewards.record.byStudent')}
          </button>
        )}
      </div>

      {mode === 'class' ? (
        <div className="space-y-3">
          <Field label={t('rewards.record.class')}>
            <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">{t('rewards.record.pickClass')}</option>
              {(classes.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.school ? ` · ${c.school}` : ''} ({c.students})
                </option>
              ))}
            </Select>
          </Field>
          {classes.data && classes.data.length === 0 && <p className="text-sm text-navy/60">{t('rewards.record.noClasses')}</p>}
          {roster.data && roster.data.length > 0 && (
            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{t('rewards.record.selected', { count: targets.length, total: roster.data.length })}</p>
                <button
                  type="button"
                  className="text-sm font-semibold text-bronze"
                  onClick={() =>
                    setPicked(wholeClass ? {} : Object.fromEntries(roster.data!.map((s) => [s.id, s])))
                  }
                >
                  {wholeClass ? t('rewards.record.clearAll') : t('rewards.record.selectAll')}
                </button>
              </div>
              <div className="grid gap-x-4 sm:grid-cols-2">
                {roster.data.map((s) => (
                  <Checkbox
                    key={s.id}
                    label={`${s.full_name} · ${s.student_code}`}
                    checked={Boolean(picked[s.id])}
                    onChange={(e) =>
                      setPicked((p) => {
                        const n = { ...p }
                        if (e.target.checked) n[s.id] = s
                        else delete n[s.id]
                        return n
                      })
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : single ? (
        <div className="flex items-center justify-between rounded-xl bg-navy/5 px-3 py-2 text-sm">
          <span>
            <span className="font-semibold">{single.full_name}</span> · {single.student_code}
          </span>
          <button type="button" className="font-semibold text-bronze" onClick={() => setSingle(null)}>
            {t('rewards.record.change')}
          </button>
        </div>
      ) : (
        <StudentSearch onPick={setSingle} />
      )}

      <Field label={t('rewards.record.rule')}>
        <Select value={code} onChange={(e) => setCode(e.target.value)}>
          <option value="">{t('rewards.record.pickRule')}</option>
          {(rules.data ?? []).map((r) => (
            <option key={r.code} value={r.code}>
              {loc(r, 'name')}
            </option>
          ))}
        </Select>
      </Field>
      {rule && (
        <>
          <Field
            label={t('rewards.record.points')}
            hint={rule.min_points === rule.max_points ? undefined : t('rewards.record.pointsRange', { min: rule.min_points, max: rule.max_points })}
            error={points && ptsBad ? t('rewards.errors.points_out_of_range') : null}
          >
            <Input
              type="number"
              inputMode="numeric"
              min={rule.min_points}
              max={rule.max_points}
              value={points}
              disabled={rule.min_points === rule.max_points}
              onChange={(e) => setPoints(e.target.value)}
            />
          </Field>
          <Field
            label={rule.note_required ? t('rewards.record.noteRequired') : t('rewards.record.note')}
            hint={rule.code === 'school_award' ? t('rewards.record.schoolAwardHint') : undefined}
          >
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </Field>
          {photoOk && (
            <Field label={t('rewards.record.photo')} hint={t('rewards.record.photoHint')}>
              <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Field>
          )}
          {rule.first_pass_only && <p className="text-sm text-navy/60">{t('rewards.record.firstPassHint')}</p>}
        </>
      )}
      <FormError message={error} />
      <Button
        size="full"
        disabled={!rule || ptsBad || noteBad || targets.length === 0 || save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? t('rewards.record.saving') : t('rewards.record.submit', { count: targets.length })}
      </Button>
    </Card>
  )
}

function RecentRecords() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const errorText = useRewardError()
  const recent = useQuery({ queryKey: ['reward_recent_records'], queryFn: () => callRpc<RecentRecord[]>('reward_recent_records', { p_days: 7 }) })
  const [target, setTarget] = useState<RecentRecord | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const voidIt = useMutation({
    mutationFn: () => callRpc('reward_void', { p_ledger_id: target!.id, p_reason: reason }),
    onSuccess: () => {
      toast(t('rewards.void.done'))
      setTarget(null)
      setReason('')
      void qc.invalidateQueries({ queryKey: ['reward_recent_records'] })
    },
    onError: (e) => setError(errorText(e)),
  })

  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-lg font-bold">{t('rewards.recent.title')}</h2>
      {recent.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : recent.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : recent.data.length === 0 ? (
        <p className="text-sm text-navy/60">{t('rewards.recent.empty')}</p>
      ) : (
        <ul className="divide-y divide-navy/10">
          {recent.data.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className={cn('font-medium', r.voided && 'line-through text-navy/50')}>
                  {r.full_name} · {i18n.language === 'en' ? r.rule_en || r.rule_vi : r.rule_vi} · +{r.delta}
                </p>
                <p className="text-xs text-navy/60">
                  {formatDateTime(r.created_at, i18n.language)}
                  {!r.mine && r.created_by_name ? ` · ${r.created_by_name}` : ''}
                  {r.note ? ` · ${r.note}` : ''}
                </p>
                {r.voided && (
                  <Badge tone="warn">
                    {t('rewards.void.voided')}
                    {r.void_reason ? `: ${r.void_reason}` : ''}
                  </Badge>
                )}
              </div>
              {r.can_void && (
                <Button size="sm" variant="outline" onClick={() => setTarget(r)}>
                  <Undo2 className="h-4 w-4" /> {t('rewards.void.action')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={Boolean(target)} onClose={() => setTarget(null)} title={t('rewards.void.title')}>
        {target && (
          <div className="space-y-3">
            <p className="text-sm">{t('rewards.void.confirm', { name: target.full_name, points: target.delta })}</p>
            <Field label={t('rewards.void.reason')}>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
            </Field>
            <FormError message={error} />
            <Button size="full" disabled={!reason.trim() || voidIt.isPending} onClick={() => voidIt.mutate()}>
              {t('rewards.void.submit')}
            </Button>
          </div>
        )}
      </Dialog>
    </Card>
  )
}

interface LedgerRow {
  id: string
  created_at: string
  student_id: string
  full_name: string
  student_code: string
  delta: number
  reason: string
  note: string | null
  is_frozen: boolean
  created_by_name: string | null
  source_vi: string | null
  source_en: string | null
}

const LEDGER_REASONS = [
  'tournament_result',
  'tournament_result_adjust',
  'school_award',
  'conduct',
  'theory_test',
  'practice_test',
  'level_up',
  'level_up_adjust',
  'manual_void',
  'partner_visit',
  'partner_visit_void',
  'admin_adjust',
  'gift_order',
  'gift_order_refund',
  'merge_transfer',
  'event_points',
  'event_redemption',
  'opening_balance',
  'opening_balance_adjust',
]

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function LedgerPanel() {
  const { t, i18n } = useTranslation()
  const [student, setStudent] = useState<PickStudent | null>(null)
  const [reason, setReason] = useState('')
  const [month, setMonth] = useState('')
  const ledger = useQuery({
    queryKey: ['reward_admin_ledger', student?.id, reason, month],
    queryFn: () =>
      callRpc<{ total: number; rows: LedgerRow[] }>('reward_admin_ledger', {
        p_student_id: student?.id ?? null,
        p_reason: reason || null,
        p_month: month ? `${month}-01` : null,
        p_limit: 2000,
      }),
  })
  const reasonLabel = (r: string) => t(`rewards.ledgerReason.${r}`, { defaultValue: r })
  const source = (r: LedgerRow) => (i18n.language === 'en' ? r.source_en || r.source_vi : r.source_vi) || ''
  const rows = useMemo(() => ledger.data?.rows ?? [], [ledger.data])

  function exportCsv() {
    const head = ['created_at', 'student_code', 'full_name', 'delta', 'reason', 'source', 'note', 'frozen', 'created_by']
    const lines = [head.join(','), ...rows.map((r) =>
      [r.created_at, r.student_code, r.full_name, r.delta, r.reason, source(r), r.note, r.is_frozen ? 1 : 0, r.created_by_name].map(csvCell).join(','),
    )]
    downloadBlob('﻿' + lines.join('\r\n'), `so-diem-thuong${month ? '-' + month : ''}.csv`, 'text/csv;charset=utf-8')
  }

  return (
    <div className="space-y-4">
      <Card className="grid gap-3 p-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <span className="text-sm font-semibold text-navy/80">{t('rewards.ledger.student')}</span>
          {student ? (
            <div className="flex items-center justify-between rounded-xl bg-navy/5 px-3 py-2 text-sm">
              <span className="truncate">{student.full_name} · {student.student_code}</span>
              <button type="button" className="font-semibold text-bronze" onClick={() => setStudent(null)}>
                {t('rewards.ledger.all')}
              </button>
            </div>
          ) : (
            <StudentSearch onPick={setStudent} />
          )}
        </div>
        <Field label={t('rewards.ledger.reason')}>
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">{t('rewards.ledger.all')}</option>
            {LEDGER_REASONS.map((r) => (
              <option key={r} value={r}>
                {reasonLabel(r)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('rewards.ledger.month')}>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {t('rewards.ledger.summary', { count: rows.length, total: ledger.data?.total ?? 0 })}
        </p>
        <Button size="sm" variant="outline" disabled={!rows.length} onClick={exportCsv}>
          <Download className="h-4 w-4" /> CSV
        </Button>
      </div>
      {ledger.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : ledger.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : (
        <TableWrap>
          <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                <th className={th}>{t('rewards.ledger.time')}</th>
                <th className={th}>{t('rewards.ledger.student')}</th>
                <th className={th}>{t('rewards.ledger.reason')}</th>
                <th className={th}>{t('rewards.ledger.source')}</th>
                <th className={cn(th, 'text-right')}>{t('rewards.ledger.points')}</th>
                <th className={th}>{t('rewards.ledger.by')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-navy/10">
                  <td className={cn(td, 'whitespace-nowrap text-sm')}>{formatDateTime(r.created_at, i18n.language)}</td>
                  <td className={cn(td, 'text-sm')}>
                    {r.full_name}
                    <div className="text-xs text-navy/60">{r.student_code}</div>
                  </td>
                  <td className={cn(td, 'text-sm')}>
                    {reasonLabel(r.reason)}
                    {r.is_frozen && <Badge className="ml-1">{t('rewards.wallet.frozenTag')}</Badge>}
                  </td>
                  <td className={cn(td, 'text-sm')}>
                    {source(r)}
                    {r.note && <div className="text-xs text-navy/60">{r.note}</div>}
                  </td>
                  <td className={cn(td, 'text-right font-semibold tabular-nums', r.delta < 0 ? 'text-red-700' : 'text-green-700')}>
                    {r.delta > 0 ? `+${r.delta}` : r.delta}
                  </td>
                  <td className={cn(td, 'text-sm')}>{r.created_by_name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  )
}

interface RuleRow {
  id: string
  code: string
  name_vi: string
  name_en: string
  default_points: number
  min_points: number
  max_points: number
  note_required: boolean
  mode: string
  is_active: boolean
  sort_order: number
}

function RulesPanel() {
  const { t } = useTranslation()
  const rules = useQuery({
    queryKey: ['reward_rules_admin'],
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('reward_rules')
        .select('id, code, name_vi, name_en, default_points, min_points, max_points, note_required, mode, is_active, sort_order')
        .order('sort_order')
      if (error) throw error
      return data as RuleRow[]
    },
  })
  return (
    <div className="space-y-3">
      <p className="text-sm text-navy/60">{t('rewards.rules.hint')}</p>
      {rules.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : rules.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : (
        rules.data.map((r) => <RuleEditor key={r.id} rule={r} />)
      )}
    </div>
  )
}

function RuleEditor({ rule }: { rule: RuleRow }) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const [f, setF] = useState(rule)
  const [error, setError] = useState<string | null>(null)
  const dirty = JSON.stringify(f) !== JSON.stringify(rule)
  const bad = !(f.min_points > 0 && f.min_points <= f.default_points && f.default_points <= f.max_points) || !f.name_vi.trim() || !f.name_en.trim()
  const save = useMutation({
    mutationFn: async () => {
      const { error: e } = await supabase!
        .from('reward_rules')
        .update({
          name_vi: f.name_vi.trim(),
          name_en: f.name_en.trim(),
          default_points: f.default_points,
          min_points: f.min_points,
          max_points: f.max_points,
          note_required: f.note_required,
          is_active: f.is_active,
        })
        .eq('id', rule.id)
      if (e) throw e
    },
    onSuccess: () => {
      toast(t('common.saved'))
      setError(null)
      void qc.invalidateQueries({ queryKey: ['reward_rules_admin'] })
      void qc.invalidateQueries({ queryKey: ['reward_rules_manual'] })
    },
    onError: () => setError(t('errors.generic')),
  })
  const num = (k: 'default_points' | 'min_points' | 'max_points') => (
    <Field label={t(`rewards.rules.${k}`)}>
      <Input type="number" inputMode="numeric" value={f[k]} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} />
    </Field>
  )
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-navy/5 px-2 py-0.5 text-sm">{rule.code}</code>
        <Badge tone={rule.mode === 'manual' ? 'neutral' : 'good'}>{t(`rewards.rules.mode.${rule.mode}`)}</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('rewards.rules.nameVi')}>
          <Input value={f.name_vi} onChange={(e) => setF({ ...f, name_vi: e.target.value })} />
        </Field>
        <Field label={t('rewards.rules.nameEn')}>
          <Input value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {num('default_points')}
        {num('min_points')}
        {num('max_points')}
      </div>
      <div className="flex flex-wrap gap-x-6">
        <Checkbox label={t('rewards.rules.noteRequired')} checked={f.note_required} onChange={(e) => setF({ ...f, note_required: e.target.checked })} />
        <Checkbox label={t('rewards.rules.active')} checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />
      </div>
      {bad && <FormError message={t('rewards.rules.invalid')} />}
      <FormError message={error} />
      <Button size="sm" disabled={!dirty || bad || save.isPending} onClick={() => save.mutate()}>
        {t('common.save')}
      </Button>
    </Card>
  )
}
