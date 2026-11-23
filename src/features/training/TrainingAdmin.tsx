import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, TableWrap, td, th } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { CrudTable } from '@/features/admin/CrudTable'
import { errorMessage } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { PlanBlock, PlanLine } from './planner'
import type { Benchmark } from './stats'

const db = () => supabase!
const AREAS = ['fir', 'gir', 'scr', 'chip', 'putt'] as const
const LINE_TYPES: PlanLine['t'][] = ['p', 'o', 'h', 'b', 's', 'd']
const STATS: Benchmark['stat'][] = ['fir_pct', 'gir_pct', 'scramble_pct', 'putts_per_18', 'three_putt_pct']

interface ProgramRow {
  id: string
  code: string
  name_vi: string
  name_en: string
  target_hcp_min: number | null
  target_hcp_max: number | null
  weeks: number
  days_per_week: number
  summary_vi: string | null
  summary_en: string | null
  is_active: boolean
  version: number
}

function adminError(err: unknown, t: (k: string) => string) {
  const msg = (err as { message?: string })?.message ?? ''
  return ['block_in_use', 'last_block'].includes(msg) ? t(`training.admin.err.${msg}`) : errorMessage(err, t)
}

/** Admin · Tập luyện: tổng quan, chương trình, giáo án từng buổi, chuẩn thống kê (spec 23 bước 4). */
export function TrainingAdminPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'overview' | 'programs' | 'plans' | 'benchmarks' | 'challenges' | 'drills'>('overview')
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('training.title')}</h1>
      <div className="flex flex-wrap gap-2">
        {(['overview', 'programs', 'plans', 'benchmarks', 'challenges', 'drills'] as const).map((k) => (
          <Button key={k} size="sm" variant={tab === k ? 'primary' : 'outline'} onClick={() => setTab(k)}>
            {t(`training.admin.tab.${k}`)}
          </Button>
        ))}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'programs' && <Programs />}
      {tab === 'plans' && <Plans />}
      {tab === 'benchmarks' && <Benchmarks />}
      {tab === 'challenges' && <Challenges />}
      {tab === 'drills' && <Drills />}
    </div>
  )
}

// ---------------------------------------------------------------- Tổng quan

function Overview() {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['training_admin_overview'],
    queryFn: async () => {
      const { data, error } = await db().rpc('training_admin_overview')
      if (error) throw error
      return data as Record<string, number> & { by_program: { code: string; name: string; active: number; completed: number }[] }
    },
  })
  if (q.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  if (!q.data) return null
  const d = q.data
  const tiles = ['profiles_self_created', 'profiles_pending', 'active_goals', 'completed_goals', 'sessions_7d', 'sessions_30d', 'active_users_7d', 'rounds_30d'] as const
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((k) => (
          <Card key={k} className="p-4">
            <p className="text-sm text-navy/60">{t(`training.admin.ov.${k}`)}</p>
            <p className="text-2xl font-bold">{d[k]}</p>
          </Card>
        ))}
      </div>
      <TableWrap>
        <table className="w-full">
          <thead><tr><th className={th}>{t('training.admin.program')}</th><th className={th}>{t('training.admin.ov.active_goals')}</th><th className={th}>{t('training.admin.ov.completed_goals')}</th></tr></thead>
          <tbody>
            {d.by_program.map((p) => (
              <tr key={p.code}><td className={td}>{p.name}</td><td className={td}>{p.active}</td><td className={td}>{p.completed}</td></tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <p className="text-sm text-navy/60">
        {t('training.admin.pendingHint')} <Link to="/admin/queue" className="font-semibold text-bronze">{t('admin.nav.queue')}</Link>
        {' · '}
        {t('training.admin.settingsHint')} <Link to="/admin/settings" className="font-semibold text-bronze">{t('admin.nav.settings')}</Link>
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- Chương trình

function Programs() {
  const { t } = useTranslation()
  return (
    <CrudTable<ProgramRow>
      table="training_programs"
      titleKey="training.admin.tab.programs"
      order="sort_order"
      canCreate={false}
      invalidate={['training_programs', 'training_program']}
      columns={[
        { key: 'name', labelKey: 'training.admin.program', render: (p) => <div><div className="font-semibold">{p.name_vi}</div><code className="text-xs text-navy/50">{p.code} · v{p.version}</code></div> },
        { key: 'hcp', labelKey: 'training.admin.hcpRange', render: (p) => `${p.target_hcp_min ?? '…'} – ${p.target_hcp_max ?? '…'}` },
        { key: 'weeks', labelKey: 'training.admin.weeks', render: (p) => `${p.weeks} × ${p.days_per_week}` },
        { key: 'is_active', labelKey: 'fields.status', render: (p) => (p.is_active ? t('common.active') : t('common.inactive')) },
      ]}
      fields={[
        { name: 'name_vi', labelKey: 'fields.nameVi', required: true },
        { name: 'name_en', labelKey: 'fields.nameEn' },
        { name: 'target_hcp_min', labelKey: 'training.admin.hcpMin', type: 'number', hintKey: 'training.admin.hcpHint' },
        { name: 'target_hcp_max', labelKey: 'training.admin.hcpMax', type: 'number' },
        { name: 'summary_vi', labelKey: 'training.admin.summaryVi', type: 'textarea' },
        { name: 'summary_en', labelKey: 'training.admin.summaryEn', type: 'textarea' },
        { name: 'is_active', labelKey: 'fields.isActive', type: 'checkbox' },
      ]}
    />
  )
}

// ---------------------------------------------------------------- Giáo án từng buổi

function Plans() {
  const { t } = useTranslation()
  const programs = useQuery({
    queryKey: ['training_programs_admin'],
    queryFn: async () => {
      const { data, error } = await db().from('training_programs').select('id, code, name_vi, weeks').order('sort_order')
      if (error) throw error
      return data as Pick<ProgramRow, 'id' | 'code' | 'name_vi' | 'weeks'>[]
    },
  })
  const [programId, setProgramId] = useState('')
  const [week, setWeek] = useState(1)
  const [sessionId, setSessionId] = useState('')
  useEffect(() => {
    if (!programId && programs.data?.length) setProgramId(programs.data[0].id)
  }, [programs.data, programId])
  const sessions = useQuery({
    queryKey: ['training_admin_sessions', programId, week],
    enabled: Boolean(programId),
    queryFn: async () => {
      const { data, error } = await db().from('training_program_sessions').select('id, day_no').eq('program_id', programId).eq('week_no', week).order('day_no')
      if (error) throw error
      return data as { id: string; day_no: number }[]
    },
  })
  useEffect(() => {
    const list = sessions.data ?? []
    if (!list.some((s) => s.id === sessionId)) setSessionId(list[0]?.id ?? '')
  }, [sessions.data, sessionId])
  const weeks = programs.data?.find((p) => p.id === programId)?.weeks ?? 12

  return (
    <div className="space-y-4">
      <Card className="grid gap-3 p-4 sm:grid-cols-3">
        <Field label={t('training.admin.program')}>
          <Select value={programId} onChange={(e) => setProgramId(e.target.value)}>
            {programs.data?.map((p) => <option key={p.id} value={p.id}>{p.name_vi}</option>)}
          </Select>
        </Field>
        <Field label={t('training.admin.week')}>
          <Select value={week} onChange={(e) => setWeek(Number(e.target.value))}>
            {Array.from({ length: weeks }, (_, i) => <option key={i + 1} value={i + 1}>{t('training.admin.weekN', { n: i + 1 })}</option>)}
          </Select>
        </Field>
        <Field label={t('training.admin.day')}>
          <Select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            {sessions.data?.map((s) => <option key={s.id} value={s.id}>{s.day_no === 0 ? t('training.admin.dayShared') : t('training.admin.dayN', { n: s.day_no })}</option>)}
          </Select>
        </Field>
      </Card>
      <p className="text-sm text-navy/60">{t('training.admin.planHint')}</p>
      {sessionId && <SessionBlocks sessionId={sessionId} />}
    </div>
  )
}

function SessionBlocks({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const key = ['training_admin_blocks', sessionId]
  const blocks = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await db().from('training_program_blocks').select('id, sort_order, area, title_vi, title_en, est_minutes, lines').eq('session_id', sessionId).order('sort_order')
      if (error) throw error
      return data as PlanBlock[]
    },
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key })
    qc.invalidateQueries({ queryKey: ['training_program'] })
  }
  const rpc = useMutation({
    mutationFn: async ({ fn, args }: { fn: string; args: Record<string, unknown> }) => {
      const { error } = await db().rpc(fn, args)
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (e) => toast(adminError(e, t), 'error'),
  })
  if (blocks.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  const list = blocks.data ?? []
  const total = list.reduce((a, b) => a + b.est_minutes, 0)
  return (
    <div className="space-y-4">
      <p className="font-semibold">{t('training.admin.sessionTotal', { n: list.length, mins: total })}</p>
      {list.map((b, i) => (
        <BlockEditor
          key={b.id}
          block={b}
          first={i === 0}
          last={i === list.length - 1}
          onSaved={refresh}
          onMove={(d) => rpc.mutate({ fn: 'training_admin_move_block', args: { p_block_id: b.id, p_delta: d } })}
          onDelete={() => rpc.mutate({ fn: 'training_admin_delete_block', args: { p_block_id: b.id } })}
          onAddAfter={() => rpc.mutate({ fn: 'training_admin_add_block', args: { p_session_id: sessionId, p_after: b.sort_order } })}
        />
      ))}
    </div>
  )
}

function BlockEditor({ block, first, last, onSaved, onMove, onDelete, onAddAfter }: {
  block: PlanBlock; first: boolean; last: boolean; onSaved: () => void
  onMove: (d: number) => void; onDelete: () => void; onAddAfter: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [b, setB] = useState(block)
  const [busy, setBusy] = useState(false)
  useEffect(() => setB(block), [block])
  const dirty = JSON.stringify(b) !== JSON.stringify(block)
  const setLine = (i: number, v: Partial<PlanLine>) => setB({ ...b, lines: b.lines.map((l, j) => (j === i ? { ...l, ...v } : l)) })
  const moveLine = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= b.lines.length) return
    const lines = [...b.lines]
    ;[lines[i], lines[j]] = [lines[j], lines[i]]
    setB({ ...b, lines })
  }

  return (
    <Card className={cn('space-y-3 p-4', dirty && 'border-bronze')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge>{t('training.admin.blockN', { n: block.sort_order + 1 })}</Badge>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" disabled={first} onClick={() => onMove(-1)} aria-label={t('training.admin.moveUp')}><ArrowUp className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" disabled={last} onClick={() => onMove(1)} aria-label={t('training.admin.moveDown')}><ArrowDown className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" onClick={onAddAfter}><Plus className="h-4 w-4" /> {t('training.admin.addBlock')}</Button>
          <Button size="sm" variant="ghost" className="text-red-700" onClick={onDelete} aria-label={t('training.admin.deleteBlock')}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label={t('fields.nameVi')} className="sm:col-span-2"><Input value={b.title_vi} onChange={(e) => setB({ ...b, title_vi: e.target.value })} /></Field>
        <Field label={t('training.admin.area')}>
          <Select value={b.area} onChange={(e) => setB({ ...b, area: e.target.value as PlanBlock['area'] })}>
            {AREAS.map((a) => <option key={a} value={a}>{t(`training.area.${a}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('training.admin.minutes')}>
          <Input type="number" min={1} value={b.est_minutes} onChange={(e) => setB({ ...b, est_minutes: Math.max(1, Number(e.target.value) || 1) })} />
        </Field>
        <Field label={t('fields.nameEn')} className="sm:col-span-4"><Input value={b.title_en} onChange={(e) => setB({ ...b, title_en: e.target.value })} /></Field>
      </div>
      <div className="space-y-2">
        {b.lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[7rem_1fr_auto] gap-2 rounded-xl border border-navy/10 p-2">
            <Select className="self-start" value={l.t} onChange={(e) => setLine(i, { t: e.target.value as PlanLine['t'] })}>
              {LINE_TYPES.map((x) => <option key={x} value={x}>{t(`training.admin.line.${x}`)}</option>)}
            </Select>
            <div className="space-y-1">
              <Textarea className="min-h-12" rows={2} value={l.vi} onChange={(e) => setLine(i, { vi: e.target.value })} />
              <Input placeholder={t('training.admin.enOptional')} value={l.en} onChange={(e) => setLine(i, { en: e.target.value })} />
            </div>
            <div className="flex flex-col">
              <Button size="sm" variant="ghost" onClick={() => moveLine(i, -1)} aria-label={t('training.admin.moveUp')}><ArrowUp className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => moveLine(i, 1)} aria-label={t('training.admin.moveDown')}><ArrowDown className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setB({ ...b, lines: b.lines.filter((_, j) => j !== i) })} aria-label={t('training.admin.deleteLine')}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setB({ ...b, lines: [...b.lines, { t: 'b', vi: '', en: '' }] })}><Plus className="h-4 w-4" /> {t('training.admin.addLine')}</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!dirty || busy || !b.title_vi.trim() || b.lines.some((l) => !l.vi.trim())}
          onClick={async () => {
            setBusy(true)
            const { error } = await db().from('training_program_blocks')
              .update({ title_vi: b.title_vi.trim(), title_en: b.title_en.trim(), area: b.area, est_minutes: b.est_minutes, lines: b.lines.map((l) => ({ t: l.t, vi: l.vi.trim(), en: l.en.trim() })) })
              .eq('id', b.id)
            setBusy(false)
            if (error) return toast(adminError(error, t), 'error')
            toast(t('common.saved'))
            onSaved()
          }}
        >
          {t('common.save')}
        </Button>
        {dirty && <Button size="sm" variant="ghost" onClick={() => setB(block)}>{t('common.cancel')}</Button>}
        {dirty && <span className="self-center text-sm text-brown">{t('training.admin.unsaved')}</span>}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- Chuẩn thống kê

type BenchRow = Benchmark & { id: string }

function Benchmarks() {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const rows = useQuery({
    queryKey: ['training_admin_bench'],
    queryFn: async () => {
      const { data, error } = await db().from('training_stat_benchmarks').select('id, stat, mode, hcp, value').order('stat').order('hcp')
      if (error) throw error
      return (data as BenchRow[]).map((r) => ({ ...r, hcp: Number(r.hcp), value: Number(r.value) }))
    },
  })
  const done = () => {
    qc.invalidateQueries({ queryKey: ['training_admin_bench'] })
    qc.invalidateQueries({ queryKey: ['training_stat_benchmarks'] })
  }
  const act = useMutation({
    mutationFn: async (op: { kind: 'save' | 'delete' | 'add'; row: Partial<BenchRow> }) => {
      const q = db().from('training_stat_benchmarks')
      const { id, ...v } = op.row
      const res = op.kind === 'delete' ? await q.delete().eq('id', id!) : op.kind === 'add' ? await q.insert(v) : await q.update(v).eq('id', id!)
      if (res.error) throw res.error
    },
    onSuccess: () => { done(); toast(t('common.saved')) },
    onError: (e) => toast(adminError(e, t), 'error'),
  })
  if (rows.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  return (
    <div className="space-y-4">
      <p className="text-sm text-navy/60">{t('training.admin.benchHint')}</p>
      {STATS.map((stat) => {
        const list = (rows.data ?? []).filter((r) => r.stat === stat)
        const mode = list[0]?.mode ?? (stat === 'putts_per_18' || stat === 'three_putt_pct' ? 'linear' : 'step')
        return (
          <Card key={stat} className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{t(`training.admin.stat.${stat}`)}</p>
              <Badge>{t(`training.admin.mode.${mode}`)}</Badge>
            </div>
            <TableWrap>
              <table className="w-full">
                <thead><tr><th className={th}>{t('training.admin.hcpCol')}</th><th className={th}>{t('training.admin.valueCol')}</th><th className={th} /></tr></thead>
                <tbody>
                  {list.map((r) => <BenchLine key={r.id} row={r} onSave={(v) => act.mutate({ kind: 'save', row: { id: r.id, ...v } })} onDelete={() => act.mutate({ kind: 'delete', row: { id: r.id } })} />)}
                </tbody>
              </table>
            </TableWrap>
            <Button size="sm" variant="outline" onClick={() => {
              const maxH = list.reduce((a, r) => Math.max(a, r.hcp), -1)
              act.mutate({ kind: 'add', row: { stat, mode, hcp: Math.min(54, maxH + 5), value: list[list.length - 1]?.value ?? 0 } })
            }}>
              <Plus className="h-4 w-4" /> {t('training.admin.addRow')}
            </Button>
          </Card>
        )
      })}
    </div>
  )
}

function BenchLine({ row, onSave, onDelete }: { row: BenchRow; onSave: (v: { hcp: number; value: number }) => void; onDelete: () => void }) {
  const { t } = useTranslation()
  const [hcp, setHcp] = useState(String(row.hcp))
  const [value, setValue] = useState(String(row.value))
  const dirty = Number(hcp) !== row.hcp || Number(value) !== row.value
  return (
    <tr>
      <td className={td}><Input className="min-h-10 w-24" inputMode="decimal" value={hcp} onChange={(e) => setHcp(e.target.value)} /></td>
      <td className={td}><Input className="min-h-10 w-24" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} /></td>
      <td className={cn(td, 'whitespace-nowrap')}>
        <Button size="sm" variant="ghost" disabled={!dirty || Number.isNaN(Number(hcp)) || Number.isNaN(Number(value))} onClick={() => onSave({ hcp: Number(hcp), value: Number(value) })}>{t('common.save')}</Button>
        <Button size="sm" variant="ghost" className="text-red-700" onClick={onDelete} aria-label={t('training.admin.deleteRow')}><Trash2 className="h-4 w-4" /></Button>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------- Spec 24: thẻ thử thách, thư viện bài tập

interface ChallengeRow {
  id: string
  level_number: number
  code: string
  kind: string
  area: string
  title_vi: string
  verify: string
  parts: { label_vi: string; attempts: number; target: number; provisional?: boolean }[]
  points_reward: number
  is_provisional: boolean
  is_active: boolean
}

const opts = (list: readonly string[], t: (k: string) => string, prefix: string) => list.map((v) => ({ value: v, label: t(`${prefix}.${v}`) }))
const CH_AREAS = ['tee', 'approach', 'pitch', 'bunker', 'chip', 'putt_short', 'putt_mid', 'putt_long', 'formula', 'culture', 'other'] as const
const DRILL_SKILLS = ['fitness', 'basics', 'putt', 'chip', 'pitch', 'bunker', 'full_swing', 'on_course', 'mental', 'rules'] as const

function Challenges() {
  const { t } = useTranslation()
  const [level, setLevel] = useState<number | ''>('')
  return (
    <div className="space-y-3">
      <p className="text-sm text-navy/70">{t('training.admin.chHint')}</p>
      <Field label={t('training.coach.level')} className="max-w-40">
        <Select value={level} onChange={(e) => setLevel(e.target.value ? Number(e.target.value) : '')}>
          <option value="">{t('common.all')}</option>
          {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
        </Select>
      </Field>
      <CrudTable<ChallengeRow>
        table="training_challenges"
        titleKey="training.admin.tab.challenges"
        order="sort_order"
        filter={(r) => level === '' || r.level_number === level}
        invalidate={['training_challenges']}
        newDefaults={{ kind: 'level_up', verify: 'video_or_adult', points_rank: 30, points_reward: 30, is_active: true, parts: [{ label_vi: '', attempts: 5, target: 3 }] }}
        columns={[
          { key: 'level_number', labelKey: 'training.coach.level' },
          { key: 'title', labelKey: 'training.admin.chTitle', render: (c) => <div><div className="font-semibold">{c.title_vi}</div><code className="text-xs text-navy/50">{c.code}</code></div> },
          { key: 'parts', labelKey: 'training.admin.chParts', render: (c) => c.parts.map((p) => `${p.target}/${p.attempts}${p.provisional ? '*' : ''}`).join(' · ') },
          { key: 'verify', labelKey: 'training.admin.chVerify', render: (c) => t(`training.jr.verify.${c.verify}`) },
          { key: 'is_active', labelKey: 'fields.status', render: (c) => <span>{c.is_active ? t('common.active') : t('common.inactive')}{c.is_provisional && <Badge className="ml-2">{t('training.jr.provisional')}</Badge>}</span> },
        ]}
        fields={[
          { name: 'level_number', labelKey: 'training.coach.level', type: 'number', required: true },
          { name: 'code', labelKey: 'fields.code', required: true, readOnlyOnEdit: true },
          { name: 'kind', labelKey: 'training.admin.chKind', type: 'select', options: opts(['level_up', 'practice'], t, 'training.admin.kind') },
          { name: 'area', labelKey: 'training.admin.chArea', type: 'select', required: true, options: opts(CH_AREAS, t, 'training.admin.chAreaOpt') },
          { name: 'title_vi', labelKey: 'fields.nameVi', required: true },
          { name: 'title_en', labelKey: 'fields.nameEn' },
          { name: 'how_vi', labelKey: 'training.admin.chHow', type: 'textarea' },
          { name: 'parts', labelKey: 'training.admin.chParts', type: 'json', required: true, hintKey: 'training.admin.chPartsHint' },
          { name: 'verify', labelKey: 'training.admin.chVerify', type: 'select', options: opts(['self', 'video_or_adult', 'coach'], t, 'training.jr.verify') },
          { name: 'points_reward', labelKey: 'training.admin.chPoints', type: 'number' },
          { name: 'points_rank', labelKey: 'training.admin.chRank', type: 'number' },
          { name: 'sort_order', labelKey: 'training.admin.sortOrder', type: 'number' },
          { name: 'is_provisional', labelKey: 'training.jr.provisional', type: 'checkbox' },
          { name: 'is_active', labelKey: 'fields.isActive', type: 'checkbox' },
        ]}
      />
    </div>
  )
}

interface DrillRow { id: string; code: string; title_vi: string; skill: string; contexts: string[]; minutes: number | null; is_active: boolean }

function Drills() {
  const { t } = useTranslation()
  return (
    <CrudTable<DrillRow>
      table="training_drills"
      titleKey="training.admin.tab.drills"
      order="sort_order"
      invalidate={['training_drills']}
      newDefaults={{ form: 'drill', audience: 'all', contexts: ['home'], steps: [], is_active: true }}
      columns={[
        { key: 'title', labelKey: 'training.admin.chTitle', render: (d) => <div><div className="font-semibold">{d.title_vi}</div><code className="text-xs text-navy/50">{d.code}</code></div> },
        { key: 'skill', labelKey: 'training.admin.drSkill', render: (d) => t(`training.jr.skill.${d.skill}`) },
        { key: 'contexts', labelKey: 'training.admin.drContexts', render: (d) => d.contexts.map((c) => t(`training.admin.ctx.${c}`)).join(', ') },
        { key: 'minutes', labelKey: 'training.admin.drMinutes' },
        { key: 'is_active', labelKey: 'fields.status', render: (d) => (d.is_active ? t('common.active') : t('common.inactive')) },
      ]}
      fields={[
        { name: 'code', labelKey: 'fields.code', required: true, readOnlyOnEdit: true },
        { name: 'title_vi', labelKey: 'fields.nameVi', required: true },
        { name: 'title_en', labelKey: 'fields.nameEn' },
        { name: 'skill', labelKey: 'training.admin.drSkill', type: 'select', required: true, options: opts(DRILL_SKILLS, t, 'training.jr.skill') },
        { name: 'form', labelKey: 'training.admin.drForm', type: 'select', options: opts(['game', 'drill', 'challenge', 'test', 'round'], t, 'training.admin.form') },
        { name: 'audience', labelKey: 'training.admin.drAudience', type: 'select', options: opts(['all', 'junior', 'adult'], t, 'training.admin.audience') },
        { name: 'contexts', labelKey: 'training.admin.drContexts', type: 'multicheck', options: opts(['home', 'club_only', 'small_room', 'range', 'course'], t, 'training.admin.ctx') },
        { name: 'level_from', labelKey: 'training.admin.drLevelFrom', type: 'number' },
        { name: 'level_to', labelKey: 'training.admin.drLevelTo', type: 'number' },
        { name: 'minutes', labelKey: 'training.admin.drMinutes', type: 'number' },
        { name: 'attempts', labelKey: 'training.admin.drAttempts', type: 'number' },
        { name: 'target', labelKey: 'training.admin.drTarget', type: 'number' },
        { name: 'unit_vi', labelKey: 'training.admin.drUnit' },
        { name: 'goal_vi', labelKey: 'training.admin.drGoal', type: 'textarea' },
        { name: 'steps', labelKey: 'training.admin.drSteps', type: 'json', hintKey: 'training.admin.drStepsHint' },
        { name: 'easier_vi', labelKey: 'training.jr.easier', type: 'textarea' },
        { name: 'harder_vi', labelKey: 'training.jr.harder', type: 'textarea' },
        { name: 'safety_vi', labelKey: 'training.jr.safety', type: 'textarea' },
        { name: 'video_url', labelKey: 'training.admin.drVideo' },
        { name: 'sort_order', labelKey: 'training.admin.sortOrder', type: 'number' },
        { name: 'is_active', labelKey: 'fields.isActive', type: 'checkbox' },
      ]}
    />
  )
}
