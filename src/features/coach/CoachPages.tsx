import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ChevronRight, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useTable } from '@/lib/db'
import { useAuth } from '@/auth/AuthProvider'
import { Card } from '@/components/ui/card'
import { ComingSoon } from '@/components/ComingSoon'
import { RosterTable } from '@/features/classes/RosterTable'
import { ClassCode } from '@/features/classes/ClassCode'
import type { AcademicYear, ClassRow, RosterRow, School } from '@/lib/types'

interface MyClass extends ClassRow {
  class_staff: { role: string }[]
}

function useMyClasses() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['my-classes', profile?.user_id],
    enabled: Boolean(profile),
    queryFn: async () => {
      // Chỉ lớp mà mình có tên trong class_staff (RLS cũng chặn lớp khác)
      const { data, error } = await supabase!
        .from('classes')
        .select('*, class_staff!inner(role)')
        .eq('class_staff.user_id', profile!.user_id)
        .is('deleted_at', null)
        .order('status')
        .order('name')
      if (error) throw error
      return data as MyClass[]
    },
  })
}

/** HLV · Lớp của tôi (02 mục 3.4). */
export function CoachHomePage() {
  const { t } = useTranslation()
  const classes = useMyClasses()
  const schools = useTable<School>('schools', { order: 'name' })
  const years = useTable<AcademicYear>('academic_years', { order: 'start_date' })
  const schoolName = new Map((schools.data ?? []).map((s) => [s.id, s.short_name || s.name]))
  const yearName = new Map((years.data ?? []).map((y) => [y.id, y.name]))

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('coach.myClasses')}</h1>
      {classes.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : classes.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : classes.data.length === 0 ? (
        <Card className="p-6 text-center text-navy/70">{t('coach.noClasses')}</Card>
      ) : (
        <ul className="space-y-3">
          {classes.data.map((c) => (
            <li key={c.id}>
              <Link
                to={`/coach/classes/${c.id}`}
                className="flex min-h-20 items-center justify-between gap-3 rounded-2xl border border-navy/10 bg-white px-4 py-3 shadow-sm hover:border-bronze"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold/30 text-brown">
                    <Users className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.name}</p>
                    <p className="text-sm text-navy/60">
                      {[c.school_id && schoolName.get(c.school_id), c.academic_year_id && yearName.get(c.academic_year_id)]
                        .filter(Boolean)
                        .join(' · ')}
                      {c.status !== 'active' ? ` · ${t(`classStatus.${c.status}`)}` : ''}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-bronze" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {/* Quét QR sổ để mở hồ sơ học viên: Bước 8 */}
      <ComingSoon title={t('coach.scanPassport')} />
    </div>
  )
}

/** HLV · Chi tiết lớp: mã lớp và danh sách học viên (không có liên hệ phụ huynh). */
export function CoachClassPage() {
  const { classId = '' } = useParams()
  const { t } = useTranslation()
  const classes = useMyClasses()
  const cls = classes.data?.find((c) => c.id === classId)

  const roster = useQuery({
    queryKey: ['class', classId, 'roster'],
    enabled: Boolean(cls),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('class_roster', { p_class_id: classId })
      if (error) throw error
      return data as RosterRow[]
    },
  })

  if (classes.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  if (!cls) {
    return (
      <Card className="space-y-3 p-6 text-center">
        <p className="font-semibold">{t('coach.noAccessClass')}</p>
        <Link to="/coach" className="font-semibold text-bronze">
          {t('coach.myClasses')}
        </Link>
      </Card>
    )
  }

  const myRole = cls.class_staff[0]?.role
  const activated = roster.data?.filter((r) => r.guardian_activated).length ?? 0

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Link to="/coach" className="inline-flex items-center gap-1 text-sm font-semibold text-bronze">
          <ArrowLeft className="h-4 w-4" /> {t('coach.myClasses')}
        </Link>
        <h1 className="text-2xl font-bold">{cls.name}</h1>
        {roster.data && (
          <p className="text-navy/70">{t('coach.rosterSummary', { count: roster.data.length, activated })}</p>
        )}
      </div>
      <ClassCode classId={cls.id} code={cls.class_join_code} canChange={myRole === 'coach' || myRole === 'head_coach'} />
      {roster.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : roster.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : (
        <RosterTable rows={roster.data} />
      )}
    </div>
  )
}
