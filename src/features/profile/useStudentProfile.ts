import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface LevelInfo {
  id: string
  number: number
  name_vi: string
  name_en: string
  group_name_vi: string | null
  group_name_en: string | null
  stage: { number: number; name_vi: string; name_en: string; color: string } | null
  tier: { code: string; name_vi: string; name_en: string } | null
}

export interface StudentProfile {
  viewer: 'guardian' | 'staff' | 'student' | 'pending'
  can_manage?: boolean
  student: {
    id: string
    full_name: string
    student_code?: string
    date_of_birth?: string | null
    gender?: 'male' | 'female' | 'other' | null
    nationality?: string | null
    school_name?: string | null
    grade_class?: string | null
    avatar_path?: string | null
    golf_goals?: string[]
    golf_goals_other?: string | null
    verification_status?: 'verified' | 'pending_review'
  }
  level: LevelInfo | null
  completed_levels?: { program: string; number: number; completed_at: string | null }[]
  courses?: {
    id: string
    academic_year: string | null
    school: string | null
    grade_class: string | null
    course_name: string
    sessions_count: number | null
    program_code: string | null
    program_vi: string | null
    program_en: string | null
    level_number: number | null
    level_program: string | null
  }[]
  passports?: {
    id: string
    code: string
    status: 'assigned' | 'active' | 'lost' | 'void' | 'retired'
    issued_at: string | null
    expires_at: string | null
    activated_at: string | null
    tier_vi: string
    tier_en: string
  }[]
  certificates?: { id: string; title_vi: string | null; title_en: string | null; type: string; issued_at: string; verify_code: string }[]
  guardians?: {
    link_id: string
    name: string | null
    relationship: string | null
    is_primary: boolean
    can_manage: boolean
    has_account: boolean
    is_me: boolean
    status: string
  }[] | null
  has_history?: boolean
  history_request_pending?: boolean
}

export function useStudentProfile(studentId: string) {
  return useQuery({
    queryKey: ['student_profile', studentId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('student_profile', { p_student_id: studentId })
      if (error) throw error
      return data as StudentProfile
    },
  })
}

/** Link xem ảnh có hạn 1 giờ (ảnh học viên ở kho riêng tư, 02 mục 6). */
export function useSignedPhoto(path: string | null | undefined) {
  return useQuery({
    queryKey: ['signed-photo', path],
    enabled: Boolean(path),
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase!.storage.from('student-photos').createSignedUrl(path!, 3600)
      if (error) throw error
      return data.signedUrl
    },
  })
}
