import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Copy, ExternalLink, GitMerge } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage, useTable } from '@/lib/db'
import { formatDateTime } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { EntityForm } from '@/features/admin/EntityForm'
import { StudentPassports } from '@/features/passports/StudentPassports'
import { AdminSetLevel } from '@/features/review/AdminSetLevel'
import { ManualHistoryForm } from '@/features/school/SchoolPages'
import { ClaimCodeCard } from '@/features/activation/ClaimCodeCard'
import { LeagueAchievements } from '@/features/league/LeagueAchievements'
import { StudentProfileView } from '@/features/profile/StudentProfileView'
import { useStudentProfile } from '@/features/profile/useStudentProfile'
import { type School, type Student } from '@/lib/types'
import { useAuth } from '@/auth/AuthProvider'
import { MergeStudentsDialog } from './MergeStudents'
import { StudentCodeRedirect, isStudentCode } from '@/features/league/studentCode'
import { useStudentFields } from './StudentsPage'

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

interface PassportRow {
  passport_code: string
  status: string
}

interface ConsentRow {
  id: string
  type: string
  version: string
  granted: boolean
  granted_at: string
  revoked_at: string | null
  guardian: { full_name: string | null } | null
}

/**
 * Admin / HLV trưởng · Hồ sơ học viên đầy đủ (spec 14 mục 1.1): thông tin, phụ huynh, sổ Passport, lộ trình, lớp,
 * chứng nhận, đồng ý, Thành tích SNAG Golf League; nút nhanh mở /p/, sao chép mã VNC, sang hàng chờ ghép VĐV.
 * Các khối sửa (level, mã nhận, sổ, lịch sử khoá, thông tin, gộp) chuyển từ hộp thoại cũ của trang danh sách.
 */
export function StudentDetailPage() {
  const { studentId = '' } = useParams()
  // App giải mở bằng mã VNC: /admin/students/VNC-002279 (spec 14 bước 4)
  if (isStudentCode(studentId)) return <StudentCodeRedirect code={studentId} base="/admin/students" resolve={resolveAdmin} />
  return <StudentDetail studentId={studentId} />
}

/** Mã VNC → id hồ sơ đang dùng (đi theo hồ sơ đích nếu đã gộp). */
async function resolveAdmin(code: string): Promise<string | null> {
  const { data, error } = await supabase!.from('students').select('id, merged_into_student_id').eq('student_code', code).maybeSingle()
  if (error) throw error
  let row = data as { id: string; merged_into_student_id: string | null } | null
  for (let i = 0; row?.merged_into_student_id && i < 10; i++) {
    const next = await supabase!.from('students').select('id, merged_into_student_id').eq('id', row.merged_into_student_id).maybeSingle()
    if (next.error) throw next.error
    row = next.data as typeof row
  }
  return row?.id ?? null
}

function StudentDetail({ studentId }: { studentId: string }) {
  const { t, i18n } = useTranslation()
  const { hasRole } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const [merging, setMerging] = useState(false)
  const schools = useTable<School>('schools', { order: 'name' })
  const fields = useStudentFields(schools.data ?? [])
  const profile = useStudentProfile(studentId)

  const q = useQuery({
    queryKey: ['student', studentId],
    enabled: Boolean(studentId),
    queryFn: async () => {
      const [s, g, e, p, c] = await Promise.all([
        supabase!.from('students').select('*').eq('id', studentId).single(),
        supabase!
          .from('student_guardians')
          .select('id, relationship, is_primary, can_manage, status, linked_via, guardian:guardians(full_name, phone, email, user_id)')
          .eq('student_id', studentId)
          .is('deleted_at', null),
        supabase!.from('enrollments').select('id, status, class:classes(id, name)').eq('student_id', studentId),
        supabase!
          .from('passports')
          .select('passport_code, status')
          .eq('student_id', studentId)
          .not('status', 'in', '(unassigned,void)')
          .order('created_at', { ascending: false }),
        supabase!
          .from('consents')
          .select('id, type, version, granted, granted_at, revoked_at, guardian:guardians(full_name)')
          .eq('student_id', studentId)
          .order('granted_at', { ascending: false }),
      ])
      if (s.error) throw s.error
      return {
        student: s.data as Student,
        guardians: (g.data ?? []) as unknown as GuardianLink[],
        enrollments: (e.data ?? []) as unknown as EnrollmentRow[],
        passports: (p.data ?? []) as PassportRow[],
        consents: (c.data ?? []) as unknown as ConsentRow[],
      }
    },
  })

  // Đang chờ ghép VĐV SNAG (hồ sơ vừa tạo hoặc hồ sơ ứng viên) → link sang trang ghép. Chỉ admin đọc được hàng chờ.
  const queue = useQuery({
    queryKey: ['league_queue_for', studentId],
    enabled: Boolean(studentId) && hasRole('admin'),
    queryFn: async () => {
      const { count, error } = await supabase!
        .from('league_match_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .is('deleted_at', null)
        .or(`new_student_id.eq.${studentId},candidate_student_ids.cs.{${studentId}}`)
      if (error) throw error
      return count ?? 0
    },
  })

  const save = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const res = await supabase!.from('students').update(values).eq('id', studentId).select().single()
      if (res.error) throw res.error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_students_page'] })
      qc.invalidateQueries({ queryKey: ['student', studentId] })
      qc.invalidateQueries({ queryKey: ['student_profile', studentId] })
      toast(t('common.saved'))
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      toast(t('common.copied'))
    } catch {
      toast(code)
    }
  }

  const back = (
    <Link to="/admin/students" className="inline-flex items-center gap-1 text-sm font-semibold text-bronze">
      <ArrowLeft className="h-4 w-4" /> {t('admin.nav.students')}
    </Link>
  )

  if (q.isPending) return <div className="space-y-4">{back}<p className="text-navy/60">{t('common.loading')}</p></div>
  if (q.isError)
    return (
      <div className="space-y-4">
        {back}
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      </div>
    )

  const data = q.data
  const st = data.student
  const mainPassport = data.passports.find((p) => p.status === 'active') ?? data.passports[0]

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {back}
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">{st.full_name}</h1>
        <div className="flex flex-wrap gap-2">
          <Badge>{st.student_code}</Badge>
          {st.verification_status !== 'verified' && <Badge tone="warn">{t(`verification.${st.verification_status}`)}</Badge>}
          {st.activated_at && <Badge tone="good">{t('roster.activated')}</Badge>}
          {st.merged_into_student_id && <Badge tone="warn">{t('students.detail.mergedAway')}</Badge>}
        </div>
        {/* Nút nhanh (spec 14 mục 1.1) */}
        <div className="flex flex-wrap gap-2">
          {mainPassport && (
            <Button asChild size="sm" variant="outline">
              <a href={`/p/${mainPassport.passport_code}`} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" /> {t('students.detail.openPublic')}
              </a>
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => copyCode(st.student_code)}>
            <Copy className="h-4 w-4" /> {t('students.detail.copyCode')}
          </Button>
          {(queue.data ?? 0) > 0 && (
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/league-queue">
                <GitMerge className="h-4 w-4" /> {t('students.detail.leagueQueue', { count: queue.data })}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Lộ trình, khoá học, chứng nhận, sổ (dùng lại hồ sơ học viên) */}
      {profile.data && <StudentProfileView profile={profile.data} />}

      <LeagueAchievements studentId={st.id} className="w-full" />

      <Card className="space-y-2 p-4">
        <h2 className="font-bold">{t('students.guardians')}</h2>
        {data.guardians.length === 0 ? (
          <p className="text-navy/60">{t('students.noGuardians')}</p>
        ) : (
          <ul className="space-y-2">
            {data.guardians.map((g) => (
              <li key={g.id} className="rounded-xl bg-navy/3 p-3 text-sm">
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
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="font-bold">{t('students.detail.consents')}</h2>
        {data.consents.length === 0 ? (
          <p className="text-navy/60">{t('common.empty')}</p>
        ) : (
          <ul className="divide-y divide-navy/10 text-sm">
            {data.consents.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-semibold">{t(`students.detail.consentType.${c.type}`)}</span>
                  <span className="text-navy/60"> · {c.version} · {c.guardian?.full_name ?? '—'}</span>
                </span>
                <span className="flex items-center gap-2">
                  {c.revoked_at ? (
                    <Badge>{t('students.detail.consentRevoked')}</Badge>
                  ) : c.granted ? (
                    <Badge tone="good">{t('students.detail.consentYes')}</Badge>
                  ) : (
                    <Badge tone="warn">{t('students.detail.consentNo')}</Badge>
                  )}
                  <span className="text-navy/55">{formatDateTime(c.granted_at, i18n.language)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="font-bold">{t('students.classes')}</h2>
        {data.enrollments.length === 0 ? (
          <p className="text-navy/60">{t('common.empty')}</p>
        ) : (
          <ul className="space-y-1">
            {data.enrollments.map((e) => (
              <li key={e.id} className="text-sm">
                {e.class ? (
                  <Link className="font-semibold underline-offset-4 hover:underline" to={`/admin/classes/${e.class.id}`}>
                    {e.class.name}
                  </Link>
                ) : (
                  '—'
                )}{' '}
                · {t(`enrollmentStatus.${e.status}`)}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <AdminSetLevel studentId={st.id} />
      <ClaimCodeCard student={st} />
      <StudentPassports student={{ id: st.id, full_name: st.full_name }} />
      <ManualHistoryForm studentId={st.id} center />

      <Card className="space-y-2 p-4">
        <h2 className="font-bold">{t('students.editInfo')}</h2>
        <EntityForm
          key={st.id}
          fields={fields}
          initial={st as unknown as Record<string, unknown>}
          isEdit
          busy={save.isPending}
          onSubmit={(v) => save.mutate(v)}
        />
      </Card>

      {hasRole('admin') && (
        <Card className="space-y-2 p-4">
          <h2 className="font-bold">{t('merge.title')}</h2>
          <p className="text-sm text-navy/60">{t('merge.intro')}</p>
          <Button variant="outline" onClick={() => setMerging(true)}>
            {t('merge.start')}
          </Button>
          <MergeStudentsDialog
            student={{ id: st.id, full_name: st.full_name }}
            open={merging}
            onClose={() => setMerging(false)}
            onMerged={(keepId) => navigate(`/admin/students/${keepId}`)}
          />
        </Card>
      )}
    </div>
  )
}
