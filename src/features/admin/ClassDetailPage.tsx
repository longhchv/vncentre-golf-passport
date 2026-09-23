import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Plus, Search, Trash2, UserMinus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/db'
import { useLocalized } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { TableWrap, td, th } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { RosterTable } from '@/features/classes/RosterTable'
import { ClassCode } from '@/features/classes/ClassCode'
import { useClassLookups } from '@/features/admin/ClassesPage'
import type { AdminUserRow, ClassRow, RosterRow, StudentSearchRow } from '@/lib/types'

const CLASS_STAFF_ROLES = ['coach', 'head_coach', 'assistant', 'pe_teacher'] as const

interface StaffRow {
  id: string
  user_id: string
  role: (typeof CLASS_STAFF_ROLES)[number]
  profile: { full_name: string | null; email: string | null } | null
}

/** Chi tiết lớp (admin): mã lớp, HLV của lớp (nhiều người), thêm/bớt học viên (F16). */
export function ClassDetailPage() {
  const { classId = '' } = useParams()
  const { t } = useTranslation()
  const loc = useLocalized()
  const qc = useQueryClient()
  const toast = useToast()
  const { schools, years, programs } = useClassLookups()
  const [addStudentOpen, setAddStudentOpen] = useState(false)
  const [addStaffOpen, setAddStaffOpen] = useState(false)

  const cls = useQuery({
    queryKey: ['class', classId],
    queryFn: async () => {
      const { data, error } = await supabase!.from('classes').select('*').eq('id', classId).single()
      if (error) throw error
      return data as ClassRow
    },
  })

  const roster = useQuery({
    queryKey: ['class', classId, 'roster'],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('class_roster', { p_class_id: classId })
      if (error) throw error
      return data as RosterRow[]
    },
  })

  const staff = useQuery({
    queryKey: ['class', classId, 'staff'],
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('class_staff')
        .select('id, user_id, role, profile:profiles!class_staff_user_id_fkey(full_name, email)')
        .eq('class_id', classId)
      if (error) throw error
      return data as unknown as StaffRow[]
    },
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['class', classId] })
  const onError = (e: unknown) => toast(errorMessage(e, t), 'error')

  const removeStudent = useMutation({
    mutationFn: async (studentId: string) => {
      const { error } = await supabase!
        .from('enrollments')
        .update({ status: 'dropped', left_at: new Date().toISOString().slice(0, 10) })
        .eq('class_id', classId)
        .eq('student_id', studentId)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      toast(t('common.saved'))
    },
    onError,
  })

  const removeStaff = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('class_staff').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      toast(t('common.saved'))
    },
    onError,
  })

  if (cls.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  if (cls.isError) return <p className="text-red-700">{t('errors.loadFailed')}</p>
  const c = cls.data
  const school = schools.data?.find((s) => s.id === c.school_id)
  const year = years.data?.find((y) => y.id === c.academic_year_id)
  const program = programs.data?.find((p) => p.id === c.program_id)
  const activeCount = roster.data?.filter((r) => r.enrollment_status === 'active').length ?? 0

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link to="/admin/classes" className="inline-flex items-center gap-1 text-sm font-semibold text-bronze">
          <ArrowLeft className="h-4 w-4" /> {t('admin.nav.classes')}
        </Link>
        <h1 className="text-2xl font-bold">{c.name}</h1>
        <p className="text-navy/70">
          {[school?.short_name || school?.name, year?.name, loc(program, 'name')].filter(Boolean).join(' · ')}
        </p>
      </div>

      <ClassCode classId={c.id} code={c.class_join_code} canChange />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{t('classes.staff')}</h2>
          <Button size="sm" onClick={() => setAddStaffOpen(true)}>
            <Plus className="h-4 w-4" /> {t('classes.addStaff')}
          </Button>
        </div>
        <TableWrap>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>{t('fields.name')}</th>
                <th className={th}>{t('fields.roleInClass')}</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/10">
              {staff.data?.map((s) => (
                <tr key={s.id}>
                  <td className={td}>
                    <div className="font-semibold">{s.profile?.full_name || s.profile?.email}</div>
                    <div className="text-sm text-navy/55">{s.profile?.email}</div>
                  </td>
                  <td className={td}>{t(`roles.${s.role}`)}</td>
                  <td className={`${td} text-right`}>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('common.remove')}
                      onClick={() => window.confirm(t('classes.confirmRemoveStaff')) && removeStaff.mutate(s.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {staff.data?.length === 0 && (
                <tr>
                  <td className={`${td} text-navy/50`} colSpan={3}>
                    {t('classes.noStaff')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableWrap>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">
            {t('classes.students')} ({activeCount})
          </h2>
          <Button size="sm" onClick={() => setAddStudentOpen(true)}>
            <Plus className="h-4 w-4" /> {t('classes.addStudents')}
          </Button>
        </div>
        {roster.data && (
          <RosterTable
            rows={roster.data}
            actions={(r) =>
              r.enrollment_status === 'active' && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t('classes.removeStudent')}
                  onClick={() => window.confirm(t('classes.confirmRemoveStudent', { name: r.full_name })) && removeStudent.mutate(r.student_id)}
                >
                  <UserMinus className="h-4 w-4" />
                </Button>
              )
            }
          />
        )}
      </section>

      <AddStaffDialog
        open={addStaffOpen}
        onClose={() => setAddStaffOpen(false)}
        classId={c.id}
        existing={new Set(staff.data?.map((s) => s.user_id))}
        onDone={invalidate}
      />
      <AddStudentsDialog
        open={addStudentOpen}
        onClose={() => setAddStudentOpen(false)}
        classId={c.id}
        schoolId={c.school_id}
        enrolled={new Set(roster.data?.filter((r) => r.enrollment_status === 'active').map((r) => r.student_id))}
        onDone={invalidate}
      />
    </div>
  )
}

function AddStaffDialog({
  open,
  onClose,
  classId,
  existing,
  onDone,
}: {
  open: boolean
  onClose: () => void
  classId: string
  existing: Set<string>
  onDone: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState<string>('coach')

  const users = useQuery({
    queryKey: ['admin_list_users'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('admin_list_users')
      if (error) throw error
      return data as AdminUserRow[]
    },
  })
  // Chỉ người có vai trò giảng dạy mới được gán vào lớp
  const candidates = (users.data ?? []).filter(
    (u) => u.status === 'active' && !existing.has(u.user_id) && u.roles.some((r) => (CLASS_STAFF_ROLES as readonly string[]).includes(r.role)),
  )

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!.from('class_staff').insert({ class_id: classId, user_id: userId, role })
      if (error) throw error
    },
    onSuccess: () => {
      onDone()
      toast(t('common.saved'))
      setUserId('')
      onClose()
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  return (
    <Dialog open={open} onClose={onClose} title={t('classes.addStaff')}>
      <div className="space-y-4">
        {candidates.length === 0 && !users.isPending ? (
          <p className="text-navy/70">{t('classes.noStaffCandidates')}</p>
        ) : (
          <>
            <Field label={t('fields.staffMember')}>
              <Select value={userId} onChange={(e) => setUserId(e.target.value)} required>
                <option value="">—</option>
                {candidates.map((u) => (
                  <option key={u.user_id} value={u.user_id}>
                    {u.full_name || u.email} ({u.email})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('fields.roleInClass')}>
              <Select value={role} onChange={(e) => setRole(e.target.value)}>
                {CLASS_STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`roles.${r}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Button size="full" disabled={!userId || add.isPending} onClick={() => add.mutate()}>
              {t('common.save')}
            </Button>
          </>
        )}
      </div>
    </Dialog>
  )
}

function AddStudentsDialog({
  open,
  onClose,
  classId,
  schoolId,
  enrolled,
  onDone,
}: {
  open: boolean
  onClose: () => void
  classId: string
  schoolId: string | null
  enrolled: Set<string>
  onDone: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [allSchools, setAllSchools] = useState(false)

  const results = useQuery({
    queryKey: ['admin_search_students', submitted, allSchools ? null : schoolId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('admin_search_students', {
        p_query: submitted || null,
        p_school_id: allSchools ? null : schoolId,
        p_limit: 100,
      })
      if (error) throw error
      return data as StudentSearchRow[]
    },
  })

  const enroll = useMutation({
    mutationFn: async (studentId: string) => {
      // Học viên từng rời lớp thì ghi danh lại (giữ lịch sử ngày vào lớp ban đầu)
      const { error } = await supabase!
        .from('enrollments')
        .upsert(
          { class_id: classId, student_id: studentId, status: 'active', left_at: null },
          { onConflict: 'student_id,class_id' },
        )
      if (error) throw error
    },
    onSuccess: () => {
      onDone()
      toast(t('classes.studentAdded'))
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  return (
    <Dialog open={open} onClose={onClose} title={t('classes.addStudents')}>
      <div className="space-y-4">
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
        {schoolId && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-bronze" checked={allSchools} onChange={(e) => setAllSchools(e.target.checked)} />
            {t('classes.searchAllSchools')}
          </label>
        )}
        <ul className="divide-y divide-navy/10 rounded-2xl bg-white">
          {results.data?.map((s) => {
            const already = enrolled.has(s.id)
            return (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">{s.full_name}</p>
                  <p className="text-sm text-navy/55">
                    {s.student_code} · {s.school_name ?? '—'} {s.current_grade_class ? `· ${s.current_grade_class}` : ''}
                  </p>
                </div>
                <Button size="sm" variant={already ? 'ghost' : 'outline'} disabled={already || enroll.isPending} onClick={() => enroll.mutate(s.id)}>
                  {already ? t('classes.inClass') : t('common.add')}
                </Button>
              </li>
            )
          })}
          {results.data?.length === 0 && <li className="px-4 py-3 text-navy/50">{t('common.empty')}</li>}
        </ul>
      </div>
    </Dialog>
  )
}

