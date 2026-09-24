import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage, useTable } from '@/lib/db'
import { formatDate } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card, TableWrap, td, th } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Input, Select } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { EntityForm, type FieldSpec } from '@/features/admin/EntityForm'
import { StudentPassports } from '@/features/passports/StudentPassports'
import { AdminSetLevel } from '@/features/review/AdminSetLevel'
import { ManualHistoryForm } from '@/features/school/SchoolPages'
import { ClaimCodeCard } from '@/features/activation/ClaimCodeCard'
import { GOLF_GOALS, type School, type Student, type StudentSearchRow } from '@/lib/types'
import { useAuth } from '@/auth/AuthProvider'
import { MergeHistoryButton, MergeStudentsDialog } from './MergeStudents'

/** Học viên (admin/HLV trưởng): tìm theo tên, mã, trường, SĐT phụ huynh; xem và sửa hồ sơ (F16). */
export function StudentsPage() {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [schoolId, setSchoolId] = useState('')
  const [params] = useSearchParams()
  // Mở thẳng hồ sơ khi đến từ trang quét sổ (/admin/students?open=…)
  const [openId, setOpenId] = useState<string | 'new' | null>(params.get('open'))
  const schools = useTable<School>('schools', { order: 'name' })

  const results = useQuery({
    queryKey: ['admin_search_students', submitted, schoolId || null],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('admin_search_students', {
        p_query: submitted || null,
        p_school_id: schoolId || null,
        p_limit: 200,
      })
      if (error) throw error
      return data as StudentSearchRow[]
    },
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('admin.nav.students')}</h1>
        <div className="flex flex-wrap gap-2">
          <MergeHistoryButton />
          <Button size="sm" onClick={() => setOpenId('new')}>
            <Plus className="h-4 w-4" /> {t('students.add')}
          </Button>
        </div>
      </div>

      <Card className="grid gap-3 p-4 sm:grid-cols-[1fr_16rem]">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setSubmitted(query.trim())
          }}
        >
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('students.searchPlaceholder')} />
          <Button type="submit" aria-label={t('common.search')}>
            <Search className="h-5 w-5" />
          </Button>
        </form>
        <Select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} aria-label={t('fields.school')}>
          <option value="">{t('students.allSchools')}</option>
          {schools.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.short_name || s.name}
            </option>
          ))}
        </Select>
      </Card>

      {results.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : results.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : (
        <>
          <p className="text-sm text-navy/60">{t('students.resultCount', { count: results.data.length })}</p>
          <TableWrap>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>{t('fields.studentName')}</th>
                  <th className={th}>{t('fields.dateOfBirth')}</th>
                  <th className={th}>{t('fields.school')}</th>
                  <th className={th}>{t('fields.level')}</th>
                  <th className={th}>{t('fields.parentActivation')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy/10">
                {results.data.map((s) => (
                  <tr key={s.id} className="cursor-pointer hover:bg-navy/3" onClick={() => setOpenId(s.id)}>
                    <td className={td}>
                      <div className="font-semibold text-navy underline-offset-4 hover:underline">{s.full_name}</div>
                      <div className="text-sm text-navy/55">{s.student_code}</div>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{s.date_of_birth ? formatDate(s.date_of_birth, i18n.language) : '—'}</td>
                    <td className={td}>
                      {s.school_name ?? '—'}
                      {s.current_grade_class ? <span className="text-navy/55"> · {s.current_grade_class}</span> : null}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{s.level_number ? `Level ${s.level_number}` : '—'}</td>
                    <td className={td}>
                      {s.activated ? <Badge tone="good">{t('roster.activated')}</Badge> : <Badge>{t('roster.notActivated')}</Badge>}
                      {s.verification_status === 'pending_review' && (
                        <Badge tone="warn" className="ml-1">
                          {t('verification.pending_review')}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
                {results.data.length === 0 && (
                  <tr>
                    <td className={`${td} text-navy/50`} colSpan={5}>
                      {t('common.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableWrap>
        </>
      )}

      <StudentDialog id={openId} onClose={() => setOpenId(null)} onOpen={setOpenId} schools={schools.data ?? []} />
    </div>
  )
}

interface GuardianLink {
  id: string
  relationship: string | null
  is_primary: boolean
  can_manage: boolean
  status: string
  linked_via: string | null
  guardian: { full_name: string | null; phone: string | null; email: string | null; user_id: string | null } | null
}

interface EnrollmentRow {
  id: string
  status: string
  class: { id: string; name: string } | null
}

function StudentDialog({ id, onClose, onOpen, schools }: { id: string | 'new' | null; onClose: () => void; onOpen: (id: string) => void; schools: School[] }) {
  const { t } = useTranslation()
  const { hasRole } = useAuth()
  const [merging, setMerging] = useState(false)
  const qc = useQueryClient()
  const toast = useToast()
  const isNew = id === 'new'

  const student = useQuery({
    queryKey: ['student', id],
    enabled: Boolean(id) && !isNew,
    queryFn: async () => {
      const [s, g, e] = await Promise.all([
        supabase!.from('students').select('*').eq('id', id!).single(),
        supabase!
          .from('student_guardians')
          .select('id, relationship, is_primary, can_manage, status, linked_via, guardian:guardians(full_name, phone, email, user_id)')
          .eq('student_id', id!)
          .is('deleted_at', null),
        supabase!.from('enrollments').select('id, status, class:classes(id, name)').eq('student_id', id!),
      ])
      if (s.error) throw s.error
      return {
        student: s.data as Student,
        guardians: (g.data ?? []) as unknown as GuardianLink[],
        enrollments: (e.data ?? []) as unknown as EnrollmentRow[],
      }
    },
  })

  const save = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const res = isNew
        ? await supabase!.from('students').insert(values).select().single()
        : await supabase!.from('students').update(values).eq('id', id!).select().single()
      if (res.error) throw res.error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_search_students'] })
      qc.invalidateQueries({ queryKey: ['student', id] })
      toast(t('common.saved'))
      onClose()
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  const fields: FieldSpec[] = [
    { name: 'full_name', labelKey: 'fields.studentName', required: true },
    { name: 'date_of_birth', labelKey: 'fields.dateOfBirth', type: 'date' },
    {
      name: 'gender',
      labelKey: 'fields.gender',
      type: 'select',
      options: ['male', 'female', 'other'].map((v) => ({ value: v, label: t(`gender.${v}`) })),
    },
    { name: 'nationality', labelKey: 'fields.nationality' },
    {
      name: 'current_school_id',
      labelKey: 'fields.school',
      type: 'select',
      options: schools.map((s) => ({ value: s.id, label: s.short_name || s.name })),
    },
    { name: 'current_grade_class', labelKey: 'fields.gradeClass' },
    {
      name: 'golf_goals',
      labelKey: 'fields.golfGoals',
      type: 'multicheck',
      options: GOLF_GOALS.map((g) => ({ value: g, label: t(`golfGoals.${g}`) })),
    },
    { name: 'golf_goals_other', labelKey: 'fields.golfGoalsOther' },
  ]

  const data = student.data
  return (
    <Dialog open={id !== null} onClose={onClose} title={isNew ? t('students.add') : (data?.student.full_name ?? '')}>
      {isNew ? (
        <EntityForm fields={fields} initial={{ golf_goals: [] }} isEdit={false} busy={save.isPending} onSubmit={(v) => save.mutate(v)} />
      ) : !data ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Badge>{data.student.student_code}</Badge>
            {data.student.verification_status === 'pending_review' && <Badge tone="warn">{t('verification.pending_review')}</Badge>}
            {data.student.activated_at && <Badge tone="good">{t('roster.activated')}</Badge>}
          </div>

          <section className="space-y-2">
            <h3 className="font-bold">{t('students.guardians')}</h3>
            {data.guardians.length === 0 ? (
              <p className="text-navy/60">{t('students.noGuardians')}</p>
            ) : (
              <ul className="space-y-2">
                {data.guardians.map((g) => (
                  <li key={g.id} className="rounded-xl bg-white p-3 text-sm shadow-sm">
                    <div className="font-semibold">
                      {g.guardian?.full_name || '—'}
                      {g.relationship ? ` · ${t(`relationship.${g.relationship}`)}` : ''}
                    </div>
                    <div className="text-navy/70">{[g.guardian?.phone, g.guardian?.email].filter(Boolean).join(' · ') || '—'}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {g.guardian?.user_id ? <Badge tone="good">{t('students.hasAccount')}</Badge> : <Badge>{t('students.noAccount')}</Badge>}
                      {g.is_primary && <Badge>{t('students.primary')}</Badge>}
                      {g.status === 'pending_confirmation' && <Badge tone="warn">{t('students.pendingConfirmation')}</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <AdminSetLevel studentId={data.student.id} />
          <ClaimCodeCard student={data.student} />
          <StudentPassports student={{ id: data.student.id, full_name: data.student.full_name }} />
          <ManualHistoryForm studentId={data.student.id} center />

          <section className="space-y-2">
            <h3 className="font-bold">{t('students.classes')}</h3>
            {data.enrollments.length === 0 ? (
              <p className="text-navy/60">{t('common.empty')}</p>
            ) : (
              <ul className="space-y-1">
                {data.enrollments.map((e) => (
                  <li key={e.id} className="text-sm">
                    {e.class?.name} · {t(`enrollmentStatus.${e.status}`)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="font-bold">{t('students.editInfo')}</h3>
            <EntityForm
              key={data.student.id}
              fields={fields}
              initial={data.student as unknown as Record<string, unknown>}
              isEdit
              busy={save.isPending}
              onSubmit={(v) => save.mutate(v)}
            />
          </section>
          {hasRole('admin') && (
            <section className="space-y-2 border-t border-navy/10 pt-4">
              <h3 className="font-bold">{t('merge.title')}</h3>
              <p className="text-sm text-navy/60">{t('merge.intro')}</p>
              <Button variant="outline" onClick={() => setMerging(true)}>{t('merge.start')}</Button>
              <MergeStudentsDialog student={{ id: data.student.id, full_name: data.student.full_name }} open={merging}
                onClose={() => setMerging(false)} onMerged={(keepId) => onOpen(keepId)} />
            </section>
          )}
        </div>
      )}
    </Dialog>
  )
}
