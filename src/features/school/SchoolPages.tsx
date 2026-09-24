import { useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useTable } from '@/lib/db'
import { formatDate } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card, TableWrap, td, th } from '@/components/ui/card'
import { Field, FormError, Input, Select } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { HistoryImport } from '@/features/imports/HistoryImport'
import { downloadRowsAsXlsx } from '@/features/imports/excel'
import { useStudentProfile } from '@/features/profile/useStudentProfile'
import { StudentProfileView } from '@/features/profile/StudentProfileView'
import type { ClassRow, School } from '@/lib/types'

/** Trường mà tài khoản đang quản lý (F13). Nhiều trường thì có ô chọn. */
function useMySchools() {
  const schools = useTable<School>('schools', { order: 'name' })
  const ids = useQuery({
    queryKey: ['my_school_ids'],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('my_school_ids')
      if (error) throw error
      return (data ?? []) as string[]
    },
  })
  const list = (schools.data ?? []).filter((s) => ids.data?.includes(s.id))
  return { list, ids: ids.data ?? [], isPending: ids.isPending || schools.isPending }
}

function useSelectedSchool() {
  const { list, ids, isPending } = useMySchools()
  const [chosen, setChosen] = useState('')
  const school = list.find((s) => s.id === chosen) ?? list[0]
  const picker =
    list.length > 1 ? (
      <Select value={school?.id ?? ''} onChange={(e) => setChosen(e.target.value)} className="max-w-xs">
        {list.map((s) => (
          <option key={s.id} value={s.id}>{s.short_name || s.name}</option>
        ))}
      </Select>
    ) : null
  return { school, ids, picker, isPending }
}

interface Overview {
  students: number
  activated: number
  levels: { level: number; count: number }[]
  classes: { id: string; name: string; students: number; activated: number }[]
  pending_history: number
}

interface SchoolStudent {
  student_id: string
  student_code: string
  full_name: string
  date_of_birth: string | null
  grade_class: string | null
  class_names: string | null
  level_number: number | null
  activated: boolean
  pending_history: number
}

/** Tổng quan trường: số học sinh, số đã kích hoạt, phân bổ level, theo lớp; xuất Excel (F13). */
export function SchoolHomePage() {
  const { t } = useTranslation()
  const { school, picker, isPending } = useSelectedSchool()
  const q = useQuery({
    queryKey: ['school_overview', school?.id],
    enabled: Boolean(school),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('school_overview', { p_school_id: school!.id })
      if (error) throw error
      return data as Overview
    },
  })

  if (isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  if (!school) return <Card className="p-6 text-center text-navy/70">{t('school.noSchool')}</Card>
  const o = q.data
  const max = Math.max(1, ...(o?.levels.map((l) => l.count) ?? [1]))
  const rate = o && o.students ? Math.round((o.activated / o.students) * 100) : 0

  async function exportReport() {
    const { data } = await supabase!.rpc('school_students', { p_school_id: school!.id, p_class_id: null })
    const rows = (data ?? []) as SchoolStudent[]
    await downloadRowsAsXlsx(
      [t('fields.studentName'), t('school.code'), t('fields.dateOfBirth'), t('fields.gradeClass'), t('school.classes'), 'Level', t('fields.parentActivation')],
      rows.map((r) => [r.full_name, r.student_code, r.date_of_birth ?? '', r.grade_class ?? '', r.class_names ?? '', r.level_number ?? '', r.activated ? t('roster.activated') : t('roster.notActivated')]),
      'Hoc sinh',
      `bao-cao-${(school!.short_name || school!.name).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^\w]+/g, '-').toLowerCase()}.xlsx`,
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{school.name}</h1>
        {picker}
      </div>
      {o && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-sm text-navy/60">{t('school.students')}</p>
              <p className="text-3xl font-bold">{o.students}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-navy/60">{t('school.activated')}</p>
              <p className="text-3xl font-bold">{o.activated} <span className="text-lg text-navy/55">({rate}%)</span></p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-navy/60">{t('school.pendingHistory')}</p>
              <p className="text-3xl font-bold">{o.pending_history}</p>
            </Card>
          </div>
          <Card className="space-y-2 p-4">
            <h2 className="font-bold">{t('school.levelDistribution')}</h2>
            {o.levels.map((l) => (
              <div key={l.level} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-sm font-semibold">Level {l.level}</span>
                <span className="h-4 rounded-full bg-bronze" style={{ width: `${(l.count / max) * 100}%`, minWidth: 6 }} />
                <span className="text-sm">{l.count}</span>
              </div>
            ))}
          </Card>
          <Card className="space-y-2 p-4">
            <h2 className="font-bold">{t('school.byClass')}</h2>
            <ul className="divide-y divide-navy/10">
              {o.classes.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                  <Link to={`/school/students?class=${c.id}`} className="font-semibold underline-offset-4 hover:underline">{c.name}</Link>
                  <span className="text-sm text-navy/65">{t('school.classStat', { students: c.students, activated: c.activated })}</span>
                </li>
              ))}
              {o.classes.length === 0 && <li className="py-2 text-navy/55">{t('common.empty')}</li>}
            </ul>
          </Card>
          <Button variant="outline" onClick={exportReport}>
            <Download className="h-4 w-4" /> {t('school.exportExcel')}
          </Button>
        </>
      )}
    </div>
  )
}

/** Học sinh của trường: lọc theo lớp, xem hồ sơ (không có liên hệ phụ huynh — F13). */
export function SchoolStudentsPage() {
  const { t, i18n } = useTranslation()
  const { school, picker } = useSelectedSchool()
  const params = new URLSearchParams(window.location.search)
  const [classId, setClassId] = useState(params.get('class') ?? '')
  const [search, setSearch] = useState('')
  const classes = useTable<ClassRow>('classes', { order: 'name' })
  const q = useQuery({
    queryKey: ['school_students', school?.id, classId],
    enabled: Boolean(school),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('school_students', { p_school_id: school!.id, p_class_id: classId || null })
      if (error) throw error
      return data as SchoolStudent[]
    },
  })
  const s = search.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
  const rows = useMemo(
    () => (q.data ?? []).filter((r) => !s || `${r.full_name} ${r.student_code}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').includes(s)),
    [q.data, s],
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('school.nav.students')}</h1>
        {picker}
      </div>
      <Card className="grid gap-3 p-4 sm:grid-cols-2">
        <Select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label={t('school.classes')}>
          <option value="">{t('school.allClasses')}</option>
          {classes.data?.filter((c) => c.school_id === school?.id && !c.deleted_at).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('school.searchPlaceholder')} />
      </Card>
      <p className="text-sm text-navy/60">{t('students.resultCount', { count: rows.length })}</p>
      <TableWrap>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>{t('fields.studentName')}</th>
              <th className={th}>{t('fields.dateOfBirth')}</th>
              <th className={th}>{t('school.classes')}</th>
              <th className={th}>Level</th>
              <th className={th}>{t('fields.parentActivation')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy/10">
            {rows.map((r) => (
              <tr key={r.student_id}>
                <td className={td}>
                  <Link to={`/school/students/${r.student_id}`} className="font-semibold underline-offset-4 hover:underline">{r.full_name}</Link>
                  <div className="text-sm text-navy/55">{r.student_code}{r.grade_class ? ` · ${r.grade_class}` : ''}</div>
                </td>
                <td className={`${td} whitespace-nowrap`}>{r.date_of_birth ? formatDate(r.date_of_birth, i18n.language) : '—'}</td>
                <td className={td}>{r.class_names ?? '—'}</td>
                <td className={td}>{r.level_number ?? '—'}</td>
                <td className={td}>
                  {r.activated ? <Badge tone="good">{t('roster.activated')}</Badge> : <Badge>{t('roster.notActivated')}</Badge>}
                  {r.pending_history > 0 && <Badge tone="warn" className="ml-1">{t('school.pendingN', { count: r.pending_history })}</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </div>
  )
}

/** Hồ sơ học sinh (nhà trường) + nhập tay lịch sử khoá học cho em này (chờ duyệt). */
export function SchoolStudentPage() {
  const { studentId = '' } = useParams()
  const { t } = useTranslation()
  const q = useStudentProfile(studentId)
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to="/school/students" className="inline-flex items-center gap-1 text-sm font-semibold text-bronze">
        <ArrowLeft className="h-4 w-4" /> {t('school.nav.students')}
      </Link>
      {q.isPending ? <p className="text-navy/60">{t('common.loading')}</p> : q.isError ? (
        <Card className="p-6 text-center">{t('coach.noAccessStudent')}</Card>
      ) : (
        <>
          <StudentProfileView profile={q.data} />
          <ManualHistoryForm studentId={studentId} />
        </>
      )}
    </div>
  )
}

/** Nhập tay một khoá cho một học sinh (F13). Nhà trường: luôn chờ duyệt. */
export function ManualHistoryForm({ studentId, center }: { studentId: string; center?: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const [year, setYear] = useState('')
  const [course, setCourse] = useState('')
  const [grade, setGrade] = useState('')
  const [sessions, setSessions] = useState('')
  const [level, setLevel] = useState('')
  const [approveNow, setApproveNow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const add = useMutation({
    mutationFn: async () => {
      const { error: e } = await supabase!.rpc('add_course_history', {
        p_student_id: studentId,
        p_data: { academic_year: year.trim(), course_name: course, grade_class: grade, sessions_count: sessions || null, level_number: level || null, approve_now: center && approveNow },
      })
      if (e) throw e
    },
    onSuccess: () => {
      toast(center && approveNow ? t('common.saved') : t('school.historySubmitted'))
      setCourse('')
      setSessions('')
      setLevel('')
      qc.invalidateQueries({ queryKey: ['student_profile', studentId] })
      qc.invalidateQueries({ queryKey: ['review_queue'] })
    },
    onError: () => setError(t('school.historyInvalid')),
  })
  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-bold">{t('school.addHistory')}</h2>
      {!center && <p className="text-sm text-navy/65">{t('history.schoolPendingNote')}</p>}
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          setError(null)
          add.mutate()
        }}
      >
        <Field label={t('history.year') + ' *'} hint="2024-2025">
          <Input required value={year} onChange={(e) => setYear(e.target.value)} pattern="\d{4}-\d{4}" />
        </Field>
        <Field label={t('history.course') + ' *'}>
          <Input required value={course} onChange={(e) => setCourse(e.target.value)} />
        </Field>
        <Field label={t('fields.gradeClass')}>
          <Input value={grade} onChange={(e) => setGrade(e.target.value)} />
        </Field>
        <Field label={t('history.sessions')}>
          <Input inputMode="numeric" value={sessions} onChange={(e) => setSessions(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label={t('history.levelAchieved')}>
          <Select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">—</option>
            {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Level {n}</option>)}
          </Select>
        </Field>
        {center && (
          <label className="flex items-center gap-2 self-end pb-3 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-bronze" checked={approveNow} onChange={(e) => setApproveNow(e.target.checked)} />
            {t('history.approveNow')}
          </label>
        )}
        <div className="sm:col-span-2 space-y-2">
          <FormError message={error} />
          <Button type="submit" disabled={add.isPending}>{t('school.submitHistory')}</Button>
        </div>
      </form>
    </Card>
  )
}

/** Nhập lịch sử khoá học bằng file (F13) — chỉ trường của mình, chờ duyệt. */
export function SchoolHistoryPage() {
  const { t } = useTranslation()
  const { ids, isPending } = useMySchools()
  if (isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('school.nav.history')}</h1>
      <p className="text-navy/70">{t('school.historyIntro')}</p>
      <HistoryImport mode="school" schoolIds={ids} />
    </div>
  )
}

/** HLV trưởng: nhập lịch sử khoá học (F12). */
export function CenterHistoryImportPage() {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('import.tab.course_history')}</h1>
      <HistoryImport mode="center" />
    </div>
  )
}

