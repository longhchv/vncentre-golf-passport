import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage, useTable } from '@/lib/db'
import { formatDate, useLocalized } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Field, FormError, Input, Select } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import type { AcademicYear, ClassRow, Program, School } from '@/lib/types'
import { markInFileDuplicates, normalizeStudentRow, type RowMessage } from './normalize'
import { downloadErrorReport, downloadStudentListTemplate, readStudentListFile } from './excel'

type RowStatus = 'ok' | 'warning' | 'error' | 'duplicate_suspect'
type Decision = 'use_existing' | 'create_new' | 'skip'

interface Candidate {
  id: string
  student_code: string
  full_name: string
  date_of_birth: string | null
  school: string | null
}

export interface ImportRow {
  id: string
  row_number: number
  raw: Record<string, unknown>
  normalized: {
    full_name: string | null
    date_of_birth: string | null
    grade_class: string | null
    contact_name: string | null
    contact_phone: string | null
    contact_email: string | null
  }
  status: RowStatus
  messages: (RowMessage & { candidates?: Candidate[] })[]
  matched_student_id: string | null
  decision: Decision | null
}

export interface ImportBatch {
  id: string
  file_name: string | null
  school_id: string | null
  academic_year_id: string | null
  class_id: string | null
  program_id: string | null
  status: 'uploaded' | 'validated' | 'committed' | 'cancelled'
  totals: Record<string, number> | null
  created_at: string
}

const CHUNK = 500

/** Chuyển mã thông báo của dòng thành câu đọc được (song ngữ). */
export function useRowMessage() {
  const { t } = useTranslation()
  return (m: RowMessage) => t(`import.msg.${m.code}`, { ...(m.params ?? {}) })
}

/** F10 · Nhập danh sách học sinh: chọn trường/năm/lớp → tải file → xem trước → nhập → kết quả. */
export function StudentListImport({ resumeBatch, onFinished }: { resumeBatch?: ImportBatch; onFinished: () => void }) {
  const { t } = useTranslation()
  const [batch, setBatch] = useState<ImportBatch | null>(resumeBatch ?? null)

  if (!batch) return <SetupStep onUploaded={setBatch} />
  if (batch.status === 'committed') return <ResultStep batch={batch} onDone={onFinished} />
  if (batch.status === 'cancelled') return <p className="text-navy/60">{t('import.cancelled')}</p>
  return <PreviewStep batch={batch} onCommitted={setBatch} onCancel={onFinished} />
}

function SetupStep({ onUploaded }: { onUploaded: (b: ImportBatch) => void }) {
  const { t } = useTranslation()
  const loc = useLocalized()
  const toast = useToast()
  const qc = useQueryClient()
  const schools = useTable<School>('schools', { order: 'name' })
  const years = useTable<AcademicYear>('academic_years', { order: 'start_date', ascending: false })
  const programs = useTable<Program>('programs', { order: 'code' })
  const classes = useTable<ClassRow>('classes', { order: 'name' })

  const [schoolId, setSchoolId] = useState('')
  const [yearId, setYearId] = useState('')
  const [programId, setProgramId] = useState('')
  const [classId, setClassId] = useState('')
  const [newClassName, setNewClassName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  const year = yearId || years.data?.find((y) => y.is_current)?.id || ''
  const program = programId || programs.data?.find((p) => p.code === 'core20')?.id || ''
  const classOptions = (classes.data ?? []).filter(
    (c) => !c.deleted_at && c.school_id === schoolId && (!year || c.academic_year_id === year),
  )

  const upload = useMutation({
    mutationFn: async () => {
      if (!schoolId || !year || !program) throw new Error(t('import.chooseSetup'))
      if (!file) throw new Error(t('import.chooseFile'))

      setProgress(t('import.reading'))
      const read = await readStudentListFile(file)
      if (!read.headerLooksRight) throw new Error(t('import.wrongTemplate'))
      if (read.rows.length === 0) throw new Error(t('import.emptyFile'))

      // Lớp: chọn có sẵn hoặc tạo mới ngay tại đây (F10 bước 1)
      let targetClass: string | null = classId === '__new__' ? null : classId || null
      if (classId === '__new__') {
        if (!newClassName.trim()) throw new Error(t('import.enterClassName'))
        const { data, error: e } = await supabase!
          .from('classes')
          .insert({ name: newClassName.trim(), school_id: schoolId, academic_year_id: year, program_id: program })
          .select('id')
          .single()
        if (e) throw e
        targetClass = data.id
        qc.invalidateQueries({ queryKey: ['classes'] })
      }

      const ctx = { selectedSchoolId: schoolId, schools: schools.data ?? [] }
      const results = read.rows.map((r) => normalizeStudentRow(r.raw, ctx))
      markInFileDuplicates(results)

      const { data: b, error: be } = await supabase!
        .from('import_batches')
        .insert({
          type: 'student_list',
          file_name: file.name,
          school_id: schoolId,
          academic_year_id: year,
          class_id: targetClass,
          program_id: program,
        })
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
      for (let i = 0; i < rows.length; i += CHUNK) {
        setProgress(t('import.saving', { done: Math.min(i + CHUNK, rows.length), total: rows.length }))
        const { error: re } = await supabase!.from('import_rows').insert(rows.slice(i, i + CHUNK))
        if (re) throw re
      }

      setProgress(t('import.checkingDuplicates'))
      const { error: ve } = await supabase!.rpc('import_validate_student_list', { p_batch_id: b.id })
      if (ve) throw ve
      const { data: fresh } = await supabase!.from('import_batches').select('*').eq('id', b.id).single()
      return fresh as ImportBatch
    },
    onSuccess: (b) => {
      setProgress(null)
      qc.invalidateQueries({ queryKey: ['import_batches'] })
      onUploaded(b)
    },
    onError: (e) => {
      setProgress(null)
      setError(e instanceof Error && !('code' in e) ? e.message : errorMessage(e, t))
    },
  })

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-8 w-8 shrink-0 text-bronze" />
          <div>
            <p className="font-semibold">{t('import.templateTitle')}</p>
            <p className="text-sm text-navy/60">{t('import.templateHint')}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadStudentListTemplate().catch((e) => toast(String(e), 'error'))}>
          <Download className="h-4 w-4" /> {t('import.downloadTemplate')}
        </Button>
      </Card>

      <Card className="grid gap-4 p-4 sm:grid-cols-2">
        <Field label={t('fields.school') + ' *'}>
          <Select value={schoolId} onChange={(e) => { setSchoolId(e.target.value); setClassId('') }}>
            <option value="">—</option>
            {schools.data?.map((s) => (
              <option key={s.id} value={s.id}>{s.short_name || s.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('fields.yearName') + ' *'}>
          <Select value={year} onChange={(e) => { setYearId(e.target.value); setClassId('') }}>
            {years.data?.map((y) => (
              <option key={y.id} value={y.id}>{y.name}</option>
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
        <Field label={t('import.class')} hint={t('import.classHint')}>
          <Select value={classId} onChange={(e) => setClassId(e.target.value)} disabled={!schoolId}>
            <option value="">{t('import.noClass')}</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            <option value="__new__">+ {t('import.newClass')}</option>
          </Select>
        </Field>
        {classId === '__new__' && (
          <Field label={t('fields.className') + ' *'} className="sm:col-span-2">
            <Input value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder={t('classes.nameHint')} />
          </Field>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-navy/20 p-4 text-center hover:border-bronze">
          <Upload className="h-6 w-6 text-bronze" />
          <span className="font-semibold">{file ? file.name : t('import.pickFile')}</span>
          <span className="text-sm text-navy/55">.xlsx, .xls, .csv</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null) }}
          />
        </label>
        <FormError message={error} />
        {progress && <p className="text-sm text-navy/70">{progress}</p>}
        <Button size="full" disabled={upload.isPending || !file || !schoolId} onClick={() => { setError(null); upload.mutate() }}>
          {upload.isPending ? t('common.loading') : t('import.readAndPreview')}
        </Button>
      </Card>
    </div>
  )
}

const STATUS_TONE: Record<RowStatus, 'good' | 'warn' | 'bad' | 'neutral'> = {
  ok: 'good',
  warning: 'warn',
  error: 'bad',
  duplicate_suspect: 'neutral',
}

function useBatchRows(batchId: string) {
  return useQuery({
    queryKey: ['import_rows', batchId],
    queryFn: async () => {
      const all: ImportRow[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase!
          .from('import_rows')
          .select('*')
          .eq('batch_id', batchId)
          .order('row_number')
          .range(from, from + 999)
        if (error) throw error
        all.push(...(data as ImportRow[]))
        if (data.length < 1000) break
      }
      return all
    },
  })
}

function PreviewStep({
  batch,
  onCommitted,
  onCancel,
}: {
  batch: ImportBatch
  onCommitted: (b: ImportBatch) => void
  onCancel: () => void
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const msg = useRowMessage()
  const rows = useBatchRows(batch.id)
  const [filter, setFilter] = useState<RowStatus | 'all'>('all')
  const [limit, setLimit] = useState(100)

  const counts = useMemo(() => {
    const c: Record<string, number> = { ok: 0, warning: 0, error: 0, duplicate_suspect: 0 }
    for (const r of rows.data ?? []) c[r.status]++
    return c
  }, [rows.data])
  const undecided = (rows.data ?? []).filter((r) => r.status === 'duplicate_suspect' && !r.decision).length
  const willImport = (rows.data ?? []).filter(
    (r) => r.status !== 'error' && r.decision !== 'skip' && !(r.status === 'duplicate_suspect' && !r.decision),
  ).length

  const decide = useMutation({
    mutationFn: async ({ ids, decision, matched }: { ids: string[]; decision: Decision; matched?: string }) => {
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
      const { error } = await supabase!.rpc('import_commit_student_list', { p_batch_id: batch.id })
      if (error) throw error
      const { data } = await supabase!.from('import_batches').select('*').eq('id', batch.id).single()
      return data as ImportBatch
    },
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ['import_batches'] })
      qc.invalidateQueries({ queryKey: ['admin_search_students'] })
      qc.invalidateQueries({ queryKey: ['class'] })
      onCommitted(b)
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  const cancel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!.from('import_batches').update({ status: 'cancelled' }).eq('id', batch.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['import_batches'] })
      onCancel()
    },
  })

  if (rows.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  if (rows.isError) return <p className="text-red-700">{t('errors.loadFailed')}</p>

  const visible = rows.data.filter((r) => filter === 'all' || r.status === filter)
  const dupIds = rows.data.filter((r) => r.status === 'duplicate_suspect').map((r) => r.id)

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-xl font-bold">{t('import.previewTitle')}</h2>
        <p className="text-navy/70">{batch.file_name} · {t('import.rowCount', { count: rows.data.length })}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'ok', 'warning', 'duplicate_suspect', 'error'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => { setFilter(s); setLimit(100) }}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ${filter === s ? 'bg-navy text-white' : 'bg-white text-navy/70 ring-1 ring-navy/15'}`}
          >
            {t(`import.status.${s}`)} ({s === 'all' ? rows.data.length : counts[s]})
          </button>
        ))}
      </div>

      {counts.duplicate_suspect > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-gold bg-gold/10 p-4">
          <p className="flex items-center gap-2 font-semibold text-brown">
            <AlertTriangle className="h-5 w-5" />
            {undecided > 0 ? t('import.undecided', { count: undecided }) : t('import.allDecided')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => decide.mutate({ ids: dupIds, decision: 'use_existing' })}>
              {t('import.allUseExisting')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => decide.mutate({ ids: dupIds, decision: 'create_new' })}>
              {t('import.allCreateNew')}
            </Button>
          </div>
        </Card>
      )}

      <ul className="space-y-2">
        {visible.slice(0, limit).map((r) => {
          const candidates = r.messages.find((m) => m.code === 'duplicate_existing')?.candidates ?? []
          return (
            <li key={r.id}>
              <Card className="space-y-2 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      <span className="mr-2 text-sm text-navy/45">#{r.row_number}</span>
                      {r.normalized.full_name ?? <span className="text-red-700">{t('import.noName')}</span>}
                    </p>
                    <p className="text-sm text-navy/65">
                      {[
                        r.normalized.date_of_birth && formatDate(r.normalized.date_of_birth, i18n.language),
                        r.normalized.grade_class,
                        r.normalized.contact_name,
                        r.normalized.contact_phone,
                        r.normalized.contact_email,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[r.status]}>{t(`import.status.${r.status}`)}</Badge>
                </div>
                {r.messages.filter((m) => m.code !== 'duplicate_existing').length > 0 && (
                  <ul className="text-sm text-navy/70">
                    {r.messages
                      .filter((m) => m.code !== 'duplicate_existing')
                      .map((m, i) => (
                        <li key={i}>• {msg(m)}</li>
                      ))}
                  </ul>
                )}
                {r.status === 'duplicate_suspect' && (
                  <fieldset className="space-y-1 rounded-xl bg-navy/5 p-3">
                    <legend className="sr-only">{t('import.decision')}</legend>
                    {candidates.map((c) => (
                      <label key={c.id} className="flex min-h-11 items-start gap-2">
                        <input
                          type="radio"
                          name={`d-${r.id}`}
                          className="mt-1 h-5 w-5 accent-bronze"
                          checked={r.decision === 'use_existing' && r.matched_student_id === c.id}
                          onChange={() => decide.mutate({ ids: [r.id], decision: 'use_existing', matched: c.id })}
                        />
                        <span>
                          {t('import.sameStudent')}: <b>{c.full_name}</b> · {c.student_code}
                          {c.date_of_birth ? ` · ${formatDate(c.date_of_birth, i18n.language)}` : ''}
                          {c.school ? ` · ${c.school}` : ''}
                        </span>
                      </label>
                    ))}
                    <label className="flex min-h-11 items-center gap-2">
                      <input
                        type="radio"
                        name={`d-${r.id}`}
                        className="h-5 w-5 accent-bronze"
                        checked={r.decision === 'create_new'}
                        onChange={() => decide.mutate({ ids: [r.id], decision: 'create_new' })}
                      />
                      {t('import.differentStudent')}
                    </label>
                    <label className="flex min-h-11 items-center gap-2">
                      <input
                        type="radio"
                        name={`d-${r.id}`}
                        className="h-5 w-5 accent-bronze"
                        checked={r.decision === 'skip'}
                        onChange={() => decide.mutate({ ids: [r.id], decision: 'skip' })}
                      />
                      {t('import.skipRow')}
                    </label>
                  </fieldset>
                )}
              </Card>
            </li>
          )
        })}
      </ul>
      {visible.length > limit && (
        <Button variant="outline" size="full" onClick={() => setLimit((l) => l + 200)}>
          {t('common.loadMore')} ({visible.length - limit})
        </Button>
      )}

      <Card className="sticky bottom-2 space-y-3 p-4 shadow-lg" style={{ bottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}>
        <p className="font-semibold">{t('import.willImport', { count: willImport, errors: counts.error })}</p>
        {undecided > 0 && <p className="text-sm text-brown">{t('import.decideFirst')}</p>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={commit.isPending || undecided > 0 || willImport === 0} onClick={() => commit.mutate()}>
            {commit.isPending ? t('common.loading') : t('import.commit')}
          </Button>
          <Button variant="ghost" disabled={cancel.isPending} onClick={() => window.confirm(t('import.confirmCancel')) && cancel.mutate()}>
            {t('import.cancel')}
          </Button>
        </div>
      </Card>
    </div>
  )
}

function ResultStep({ batch, onDone }: { batch: ImportBatch; onDone: () => void }) {
  const { t } = useTranslation()
  const msg = useRowMessage()
  const rows = useBatchRows(batch.id)
  const totals = batch.totals ?? {}
  const problemRows = (rows.data ?? []).filter(
    (r) => r.status === 'error' || r.decision === 'skip' || (r.status === 'duplicate_suspect' && !r.decision),
  )

  const items: [string, number, 'good' | 'warn' | 'bad' | 'neutral'][] = [
    [t('import.result.created'), totals.created ?? 0, 'good'],
    [t('import.result.updated'), totals.updated ?? 0, 'good'],
    [t('import.result.skipped'), totals.skipped ?? 0, 'warn'],
    [t('import.result.errors'), totals.errors ?? 0, 'bad'],
    [t('import.result.enrolled'), totals.enrolled ?? 0, 'neutral'],
    [t('import.result.guardians'), (totals.guardians_created ?? 0) + (totals.guardians_reused ?? 0), 'neutral'],
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-8 w-8 text-emerald-700" />
        <div>
          <h2 className="text-xl font-bold">{t('import.doneTitle')}</h2>
          <p className="text-navy/70">{batch.file_name}</p>
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

      {problemRows.length > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-700" /> {t('import.problemRows', { count: problemRows.length })}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadErrorReport(
                problemRows.map((r) => ({
                  rowNumber: r.row_number,
                  raw: r.raw,
                  status: t(`import.status.${r.decision === 'skip' ? 'skipped' : r.status}`),
                  reason: r.messages.filter((m) => m.code !== 'duplicate_existing').map(msg).join('; ') ||
                    (r.decision === 'skip' ? t('import.skipRow') : t('import.msg.duplicate_existing')),
                })),
                `bao-loi-${(batch.file_name ?? 'nhap').replace(/\.[^.]+$/, '')}.xlsx`,
              )
            }
          >
            <Download className="h-4 w-4" /> {t('import.downloadErrors')}
          </Button>
        </Card>
      )}

      <Card className="space-y-3 p-4">
        <p className="font-semibold">{t('import.nextSteps')}</p>
        <div className="flex flex-wrap gap-2">
          {batch.class_id && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/admin/classes/${batch.class_id}`}>{t('import.next.viewClass')}</Link>
            </Button>
          )}
          {/* Gán sổ và gửi lời mời làm trong trang lớp; phát hành chứng nhận ở mục Chứng nhận */}
          {batch.class_id && (['assignPassports', 'invite'] as const).map((k) => (
            <Button key={k} asChild variant="outline" size="sm">
              <Link to={`/admin/classes/${batch.class_id}`}>{t(`import.next.${k}`)}</Link>
            </Button>
          ))}
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/certificates">{t('import.next.certificates')}</Link>
          </Button>
        </div>
      </Card>

      <Button variant="ghost" onClick={onDone}>
        {t('import.newImport')}
      </Button>
    </div>
  )
}
