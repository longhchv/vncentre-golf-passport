import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { Card, TableWrap, td, th } from '@/components/ui/card'
import { Field, Select } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'

// Spec 22 mục 4 (D75): lớp hiện tại + cờ "không tự lên lớp" cho năm học sắp tới, theo trường.
// Quản lý trường của trường đó hoặc admin. Admin có thêm ô sửa hàng loạt theo lớp.
// Máy chủ kiểm quyền: school_grade_roster, set_student_grade, set_grade_promotion_hold, admin_bulk_set_grade.

interface RosterStudent {
  id: string
  student_code: string
  full_name: string
  current_grade: number | null
  grade_class: string | null
  hold: boolean
  hold_note: string | null
}
interface Roster {
  school_year: string
  students: RosterStudent[]
}

const GRADES = Array.from({ length: 13 }, (_, i) => i + 1)

export function useGradeLabel() {
  const { t } = useTranslation()
  return (g: number) => (g === 13 ? t('scholarship.grade13') : t('scholarship.gradeN', { n: g }))
}

export function GradeRoster({ schoolId, admin = false }: { schoolId: string; admin?: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const label = useGradeLabel()
  const q = useQuery({
    queryKey: ['school_grade_roster', schoolId],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('school_grade_roster', { p_school_id: schoolId })
      if (error) throw error
      return data as Roster
    },
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['school_grade_roster', schoolId] })
  const setGrade = useMutation({
    mutationFn: async (v: { id: string; grade: number }) => {
      const { error } = await supabase!.rpc('set_student_grade', { p_student_id: v.id, p_grade: v.grade })
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })
  const setHold = useMutation({
    mutationFn: async (v: { id: string; hold: boolean }) => {
      const { error } = await supabase!.rpc('set_grade_promotion_hold', {
        p_student_id: v.id,
        p_school_year: q.data!.school_year,
        p_hold: v.hold,
        p_note: null,
      })
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  if (q.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  if (q.isError || !q.data) return <Card className="p-4">{errorMessage(q.error, t)}</Card>
  const rows = q.data.students
  const missing = rows.filter((r) => r.current_grade == null).length

  return (
    <div className="space-y-3">
      <p className="text-sm text-navy/70">{t('grades.intro', { year: q.data.school_year })}</p>
      {missing > 0 && <p className="text-sm text-navy/80">{t('grades.missingCount', { count: missing })}</p>}
      {admin && <BulkGrade schoolId={schoolId} onDone={refresh} />}
      <TableWrap>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>{t('fields.studentName')}</th>
              <th className={th}>{t('scholarship.currentGrade')}</th>
              <th className={th}>{t('grades.holdCol', { year: q.data.school_year })}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy/10">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={td}>
                  <div className="font-semibold">{r.full_name}</div>
                  <div className="text-sm text-navy/55">
                    {r.student_code}
                    {r.grade_class ? ` · ${r.grade_class}` : ''}
                  </div>
                </td>
                <td className={td}>
                  <Select
                    value={r.current_grade ?? ''}
                    aria-label={`${t('scholarship.currentGrade')} · ${r.full_name}`}
                    disabled={setGrade.isPending}
                    onChange={(e) => e.target.value && setGrade.mutate({ id: r.id, grade: Number(e.target.value) })}
                    className="w-auto"
                  >
                    <option value="">—</option>
                    {GRADES.map((g) => (
                      <option key={g} value={g}>
                        {label(g)}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className={td}>
                  {r.current_grade != null && r.current_grade <= 8 ? (
                    <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={r.hold}
                        disabled={setHold.isPending}
                        onChange={(e) => setHold.mutate({ id: r.id, hold: e.target.checked })}
                      />
                      {t('grades.hold')}
                    </label>
                  ) : (
                    <span className="text-sm text-navy/55">{r.current_grade == null ? '—' : t('grades.noAuto')}</span>
                  )}
                  {r.hold_note && <div className="text-sm text-navy/60">{r.hold_note}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </div>
  )
}

function BulkGrade({ schoolId, onDone }: { schoolId: string; onDone: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const label = useGradeLabel()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const run = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase!.rpc('admin_bulk_set_grade', { p_school_id: schoolId, p_from: Number(from), p_to: Number(to) })
      if (error) throw error
      return data as number
    },
    onSuccess: (n) => {
      toast(t('grades.bulkDone', { count: n }), 'success')
      onDone()
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })
  return (
    <Card className="flex flex-wrap items-end gap-3 p-4">
      <Field label={t('grades.bulkFrom')}>
        <Select value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value="">—</option>
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {label(g)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t('grades.bulkTo')}>
        <Select value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">—</option>
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {label(g)}
            </option>
          ))}
        </Select>
      </Field>
      <Button disabled={!from || !to || from === to || run.isPending} onClick={() => run.mutate()}>
        {t('grades.bulkRun')}
      </Button>
    </Card>
  )
}
