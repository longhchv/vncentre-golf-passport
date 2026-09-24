import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage, useTable } from '@/lib/db'
import { formatDate, useLocalized } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Checkbox, Field, FormError, Select } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import type { Program, School } from '@/lib/types'
import { normalizeHistoryRow } from './normalize'
import { downloadHistoryTemplate, readHistoryFile } from './excel'

interface Candidate {
  id: string
  student_code: string
  full_name: string
  date_of_birth: string | null
  school: string | null
}

interface HistoryImportRow {
  id: string
  row_number: number
  normalized: {
    full_name: string | null
    date_of_birth: string | null
    grade_class: string | null
    academic_year: string | null
    course_name: string | null
    level_number: number | null
  }
  status: 'ok' | 'warning' | 'error' | 'duplicate_suspect'
  messages: { code: string; params?: Record<string, string | number>; candidates?: Candidate[] }[]
  matched_student_id: string | null
  decision: 'use_existing' | 'create_new' | 'skip' | null
}

interface Batch {
  id: string
  file_name: string | null
  status: string
  totals: Record<string, number | boolean> | null
}

/**
 * Nhập lịch sử khoá học (F12, F13, phụ lục A2).
 * mode 'center': admin / HLV trưởng — được chọn "Duyệt luôn khi nhập".
 * mode 'school': quản lý trường — chỉ trường mình, mọi dòng chờ duyệt (R6).
 */
export function HistoryImport({ mode, schoolIds }: { mode: 'center' | 'school'; schoolIds?: string[] }) {
  const [batch, setBatch] = useState<Batch | null>(null)
  if (!batch) return <Setup mode={mode} schoolIds={schoolIds} onUploaded={setBatch} />
  if (batch.status === 'committed') return <Result batch={batch} onNew={() => setBatch(null)} />
  return <Preview mode={mode} batch={batch} onCommitted={setBatch} onCancel={() => setBatch(null)} />
}

function Setup({ mode, schoolIds, onUploaded }: { mode: 'center' | 'school'; schoolIds?: string[]; onUploaded: (b: Batch) => void }) {
  const { t } = useTranslation()
  const loc = useLocalized()
  const toast = useToast()
  const schools = useTable<School>('schools', { order: 'name' })
  const programs = useTable<Program>('programs', { order: 'code' })
  const allowed = (schools.data ?? []).filter((s) => mode === 'center' || schoolIds?.includes(s.id))
  const [schoolId, setSchoolId] = useState('')
  const [programId, setProgramId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const school = schoolId || (allowed.length === 1 ? allowed[0].id : '')
  const program = programId || programs.data?.find((p) => p.code === 'core20')?.id || ''

  const upload = useMutation({
    mutationFn: async () => {
      if (!school || !program) throw new Error(t('import.chooseSetup'))
      if (!file) throw new Error(t('import.chooseFile'))
      setProgress(t('import.reading'))
      const read = await readHistoryFile(file)
      if (!read.headerLooksRight) throw new Error(t('history.wrongTemplate'))
      if (!read.rows.length) throw new Error(t('import.emptyFile'))
      const results = read.rows.map((r) => normalizeHistoryRow(r.raw, { selectedSchoolId: school, schools: schools.data ?? [] }))
      const { data: b, error: be } = await supabase!
        .from('import_batches')
        .insert({ type: 'course_history', file_name: file.name, school_id: school, program_id: program })
        .select()
        .single()
      if (be) throw be
      const rows = read.rows.map((r, i) => ({
        batch_id: b.id,
        row_number: r.rowNumber,
        raw: r.raw,
        normalized: results[i].normalized,
        status: results[i].status,
        messages: results[i].messages,
      }))
      for (let i = 0; i < rows.length; i += 500) {
        setProgress(t('import.saving', { done: Math.min(i + 500, rows.length), total: rows.length }))
        const { error: re } = await supabase!.from('import_rows').insert(rows.slice(i, i + 500))
        if (re) throw re
      }
      setProgress(t('history.matching'))
      const { error: ve } = await supabase!.rpc('history_import_validate', { p_batch_id: b.id })
      if (ve) throw ve
      const { data: fresh } = await supabase!.from('import_batches').select('*').eq('id', b.id).single()
      return fresh as Batch
    },
    onSuccess: (b) => {
      setProgress(null)
      onUploaded(b)
    },
    onError: (e) => {
      setProgress(null)
      setError(e instanceof Error && !('code' in e) ? e.message : errorMessage(e, t))
    },
  })

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-8 w-8 shrink-0 text-bronze" />
          <div>
            <p className="font-semibold">{t('history.templateTitle')}</p>
            <p className="text-sm text-navy/60">{t('history.templateHint')}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadHistoryTemplate().catch((e) => toast(String(e), 'error'))}>
          <Download className="h-4 w-4" /> {t('import.downloadTemplate')}
        </Button>
      </Card>
      <Card className="grid gap-4 p-4 sm:grid-cols-2">
        <Field label={t('fields.school') + ' *'}>
          <Select value={school} onChange={(e) => setSchoolId(e.target.value)}>
            {allowed.length !== 1 && <option value="">—</option>}
            {allowed.map((s) => (
              <option key={s.id} value={s.id}>{s.short_name || s.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('fields.program') + ' *'}>
          <Select value={program} onChange={(e) => setProgramId(e.target.value)}>
            {programs.data?.map((p) => (
              <option key={p.id} value={p.id}>{loc(p, 'name')}</option>
            ))}
          </Select>
        </Field>
      </Card>
      {mode === 'school' && <p className="rounded-xl bg-navy/5 p-3 text-sm text-navy/75">{t('history.schoolPendingNote')}</p>}
      <Card className="space-y-3 p-4">
        <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-navy/20 p-4 text-center hover:border-bronze">
          <Upload className="h-6 w-6 text-bronze" />
          <span className="font-semibold">{file ? file.name : t('import.pickFile')}</span>
          <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null) }} />
        </label>
        <FormError message={error} />
        {progress && <p className="text-sm text-navy/70">{progress}</p>}
        <Button size="full" disabled={upload.isPending || !file || !school} onClick={() => { setError(null); upload.mutate() }}>
          {upload.isPending ? t('common.loading') : t('import.readAndPreview')}
        </Button>
      </Card>
    </div>
  )
}

function useRows(batchId: string) {
  return useQuery({
    queryKey: ['import_rows', batchId],
    queryFn: async () => {
      const all: HistoryImportRow[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase!.from('import_rows').select('*').eq('batch_id', batchId).order('row_number').range(from, from + 999)
        if (error) throw error
        all.push(...(data as HistoryImportRow[]))
        if (data.length < 1000) break
      }
      return all
    },
  })
}

function Preview({ mode, batch, onCommitted, onCancel }: { mode: 'center' | 'school'; batch: Batch; onCommitted: (b: Batch) => void; onCancel: () => void }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const rows = useRows(batch.id)
  const [approveNow, setApproveNow] = useState(false)
  const [filter, setFilter] = useState<'all' | 'matched' | 'decide' | 'error'>('all')
  const msg = (m: { code: string; params?: Record<string, string | number> }) => t(`history.msg.${m.code}`, { defaultValue: t(`import.msg.${m.code}`, { ...(m.params ?? {}) }), ...(m.params ?? {}) })

  const groups = useMemo(() => {
    const d = rows.data ?? []
    return {
      matched: d.filter((r) => r.status !== 'error' && r.decision === 'use_existing'),
      decide: d.filter((r) => r.status !== 'error' && r.decision !== 'use_existing'),
      error: d.filter((r) => r.status === 'error'),
    }
  }, [rows.data])
  const undecided = groups.decide.filter((r) => !r.decision).length

  const decide = useMutation({
    mutationFn: async ({ ids, decision, matched }: { ids: string[]; decision: string; matched?: string }) => {
      const patch: Record<string, unknown> = { decision }
      if (matched) patch.matched_student_id = matched
      const { error } = await supabase!.from('import_rows').update(patch).in('id', ids)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['import_rows', batch.id] }),
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  const commit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!.rpc('history_import_commit', { p_batch_id: batch.id, p_approve_now: mode === 'center' && approveNow })
      if (error) throw error
      const { data } = await supabase!.from('import_batches').select('*').eq('id', batch.id).single()
      return data as Batch
    },
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ['review_queue'] })
      onCommitted(b)
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  if (rows.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  if (rows.isError) return <p className="text-red-700">{t('errors.loadFailed')}</p>
  const list = filter === 'all' ? rows.data : groups[filter]
  const willImport = groups.matched.length + groups.decide.filter((r) => r.decision && r.decision !== 'skip').length

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">{t('import.previewTitle')}</h2>
        <p className="text-navy/70">{batch.file_name} · {t('import.rowCount', { count: rows.data.length })}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(['all', 'matched', 'decide', 'error'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ${filter === f ? 'bg-navy text-white' : 'bg-white text-navy/70 ring-1 ring-navy/15'}`}
          >
            {t(`history.filter.${f}`)} ({f === 'all' ? rows.data.length : groups[f].length})
          </button>
        ))}
      </div>
      {groups.decide.length > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-gold bg-gold/10 p-4">
          <p className="flex items-center gap-2 font-semibold text-brown">
            <AlertTriangle className="h-5 w-5" /> {undecided ? t('history.undecided', { count: undecided }) : t('import.allDecided')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => decide.mutate({ ids: groups.decide.map((r) => r.id), decision: 'create_new' })}>
              {t('import.allCreateNew')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => decide.mutate({ ids: groups.decide.map((r) => r.id), decision: 'skip' })}>
              {t('history.allSkip')}
            </Button>
          </div>
        </Card>
      )}

      <ul className="space-y-2">
        {list.slice(0, 300).map((r) => {
          const n = r.normalized
          const matched = r.messages.find((m) => m.code === 'matched')?.candidates?.[0]
          const candidates = r.messages.find((m) => m.code === 'multiple_matches')?.candidates ?? []
          return (
            <li key={r.id}>
              <Card className="space-y-2 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      <span className="mr-2 text-sm text-navy/45">#{r.row_number}</span>
                      {n.full_name ?? '—'}
                    </p>
                    <p className="text-sm text-navy/65">
                      {[n.date_of_birth && formatDate(n.date_of_birth, i18n.language), n.academic_year, n.course_name, n.level_number ? `Level ${n.level_number}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <Badge tone={r.status === 'error' ? 'bad' : r.decision === 'use_existing' ? 'good' : 'warn'}>
                    {r.status === 'error' ? t('import.status.error') : r.decision === 'use_existing' ? t('history.matched') : t('history.needsDecision')}
                  </Badge>
                </div>
                {matched && r.decision === 'use_existing' && (
                  <p className="text-sm text-emerald-800">→ {matched.full_name} · {matched.student_code}{matched.school ? ` · ${matched.school}` : ''}</p>
                )}
                {r.messages.filter((m) => !['matched', 'multiple_matches'].includes(m.code)).map((m, i) => (
                  <p key={i} className="text-sm text-navy/70">• {msg(m)}</p>
                ))}
                {r.status !== 'error' && r.decision !== 'use_existing' && (
                  <fieldset className="space-y-1 rounded-xl bg-navy/5 p-3">
                    {candidates.map((c) => (
                      <label key={c.id} className="flex min-h-11 items-start gap-2">
                        <input type="radio" className="mt-1 h-5 w-5 accent-bronze" name={`d-${r.id}`}
                          onChange={() => decide.mutate({ ids: [r.id], decision: 'use_existing', matched: c.id })} />
                        <span>{t('import.sameStudent')}: <b>{c.full_name}</b> · {c.student_code}{c.date_of_birth ? ` · ${formatDate(c.date_of_birth, i18n.language)}` : ''}</span>
                      </label>
                    ))}
                    <label className="flex min-h-11 items-center gap-2">
                      <input type="radio" className="h-5 w-5 accent-bronze" name={`d-${r.id}`} checked={r.decision === 'create_new'}
                        onChange={() => decide.mutate({ ids: [r.id], decision: 'create_new' })} />
                      {t('history.createNew')}
                    </label>
                    <label className="flex min-h-11 items-center gap-2">
                      <input type="radio" className="h-5 w-5 accent-bronze" name={`d-${r.id}`} checked={r.decision === 'skip'}
                        onChange={() => decide.mutate({ ids: [r.id], decision: 'skip' })} />
                      {t('import.skipRow')}
                    </label>
                  </fieldset>
                )}
              </Card>
            </li>
          )
        })}
      </ul>

      <Card className="sticky space-y-3 p-4 shadow-lg" style={{ bottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}>
        <p className="font-semibold">{t('history.willImport', { count: willImport, errors: groups.error.length })}</p>
        {mode === 'center' ? (
          <Checkbox label={t('history.approveNow')} checked={approveNow} onChange={(e) => setApproveNow(e.target.checked)} />
        ) : (
          <p className="text-sm text-navy/65">{t('history.schoolPendingNote')}</p>
        )}
        {undecided > 0 && <p className="text-sm text-brown">{t('import.decideFirst')}</p>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={commit.isPending || undecided > 0 || willImport === 0} onClick={() => commit.mutate()}>
            {commit.isPending ? t('common.loading') : t('import.commit')}
          </Button>
          <Button variant="ghost" onClick={async () => {
            if (!window.confirm(t('import.confirmCancel'))) return
            await supabase!.from('import_batches').update({ status: 'cancelled' }).eq('id', batch.id)
            onCancel()
          }}>
            {t('import.cancel')}
          </Button>
        </div>
      </Card>
    </div>
  )
}

function Result({ batch, onNew }: { batch: Batch; onNew: () => void }) {
  const { t } = useTranslation()
  const tt = batch.totals ?? {}
  const items: [string, number][] = [
    [t('history.result.courses'), Number(tt.courses ?? 0)],
    [t('history.result.levels'), Number(tt.levels ?? 0)],
    [t('history.result.created'), Number(tt.created ?? 0)],
    [t('import.result.skipped'), Number(tt.skipped ?? 0)],
    [t('import.result.errors'), Number(tt.errors ?? 0)],
  ]
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-8 w-8 text-emerald-700" />
        <div>
          <h2 className="text-xl font-bold">{t('import.doneTitle')}</h2>
          <p className="text-navy/70">{tt.approved ? t('history.doneApproved') : t('history.donePending')}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-sm text-navy/60">{label}</p>
            <p className="text-3xl font-bold">{value}</p>
          </Card>
        ))}
      </div>
      <Button variant="ghost" onClick={onNew}>{t('import.newImport')}</Button>
    </div>
  )
}
