import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/db'
import { useToast } from '@/components/ui/toast'

// Module Hồ sơ nhân sự (11-module-ho-so-nhan-su.md). Dữ liệu đọc qua hàm SQL; ghi qua hàm staff_*.

export type CvType = 'coach' | 'volunteer' | 'organizer'
export type StaffGroup = 'coach' | 'volunteer' | 'collaborator' | 'organizer'
/** verified = Đã xác thực (system/manager), approved = Đã duyệt (tự khai đã duyệt) */
export type StaffBadgeKind = 'verified' | 'approved' | 'pending' | 'rejected'
export type ReviewStatus = 'pending_review' | 'approved' | 'rejected'

export const CV_TYPES: CvType[] = ['coach', 'volunteer', 'organizer']
export const STAFF_GROUPS: StaffGroup[] = ['coach', 'volunteer', 'collaborator', 'organizer']

export interface StaffScale {
  participants?: number | string
  schools?: number | string
  partners?: number | string
  teams?: number | string
}

export interface Engagement {
  id: string
  kind: 'event' | 'project' | 'class' | 'tournament'
  event_id: string | null
  class_id: string | null
  event_name_vi: string | null
  event_name_en: string | null
  class_name: string | null
  school_name: string | null
  academic_year: string | null
  project_name_vi: string | null
  project_name_en: string | null
  position_vi: string | null
  position_en: string | null
  staff_group: StaffGroup
  started_on: string | null
  ended_on: string | null
  hours: number | null
  scale: StaffScale
  outcome_vi: string | null
  outcome_en: string | null
  source: 'system' | 'manager' | 'self' | 'league_app'
  status: ReviewStatus
  rejected_reason: string | null
  badge: StaffBadgeKind
  confirmed_by_name: string | null
  skills: string[]
  created_at: string
  /** Chặng giải (spec 17 bước 2): nguồn league_app */
  tournament_id?: string | null
  tasks_done?: number | null
  tasks_total?: number | null
}

export interface Credential {
  id: string
  type: 'certificate' | 'prior_experience'
  title_vi: string
  title_en: string | null
  issuer: string | null
  issued_on: string | null
  expires_on: string | null
  years: number | null
  file_path: string | null
  status: ReviewStatus
  rejected_reason: string | null
  expired: boolean
  created_at: string
}

export interface StatTile {
  key: string
  value: number | null
  badge: 'verified' | 'approved'
}

export interface StaffProfileData {
  profile: {
    user_id: string
    full_name: string | null
    avatar_url: string | null
    email: string | null
    phone: string | null
    cv_type: CvType | null
    joined_vncentre_on: string | null
    show_contact_on_cv: boolean
  }
  identity: { student_id: string; student_code: string; passport_code: string | null; avatar_url: string | null } | null
  roles: string[]
  engagements: Engagement[]
  credentials: Credential[]
  skills: { code: string; name_vi: string; name_en: string; count: number }[]
  stats: { cv_type: CvType | null; tiles: StatTile[] }
  /** Spec 17 khối 3a: chứng nhận VN Centre cấp cho hồ sơ VNC của chính người này */
  certificates?: { id: string; type: string; title_vi: string | null; title_en: string | null; issued_at: string; verify_code: string | null }[]
  /** Khối 6: con của tôi */
  children?: { id: string; full_name: string; student_code: string; avatar_url: string | null; level_number: number | null }[]
  /** Khối 7: Kinh doanh (spec 18), tắt bằng profile.business_tab_enabled */
  business_enabled?: boolean
}

export interface StaffSkill {
  code: string
  name_vi: string
  name_en: string
  sort_order: number
}

export interface ScopeItem {
  id: string
  user_id: string
  full_name: string | null
  cv_type: CvType | null
  staff_group: StaffGroup
  position_vi: string | null
  position_en: string | null
  hours: number | null
  scale: StaffScale
  outcome_vi: string | null
  outcome_en: string | null
  confirmed_at: string | null
  confirmed_by_name: string | null
  skills: string[]
}

export type Scope = { eventId: string; classId?: undefined } | { classId: string; eventId?: undefined }

function db() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình')
  return supabase
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args)
  if (error) throw error
  return data as T
}

export const staffKeys = {
  profile: (userId?: string) => ['staff_profile', userId ?? 'me'] as const,
  scope: (s: Scope) => ['staff_scope', s.eventId ?? s.classId] as const,
}

export function useStaffProfile(userId?: string) {
  return useQuery({
    queryKey: staffKeys.profile(userId),
    queryFn: () => rpc<StaffProfileData>('staff_my_profile', { p_user_id: userId ?? null }),
  })
}

export function useStaffSkills() {
  return useQuery({
    queryKey: ['staff_skills'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db().from('staff_skills').select('code, name_vi, name_en, sort_order').order('sort_order')
      if (error) throw error
      return data as StaffSkill[]
    },
  })
}

export function useStaffScope(scope: Scope, enabled = true) {
  return useQuery({
    queryKey: staffKeys.scope(scope),
    enabled,
    retry: false,
    queryFn: () =>
      rpc<{ name: string; items: ScopeItem[] }>('staff_scope_list', {
        p_event_id: scope.eventId ?? null,
        p_class_id: scope.classId ?? null,
      }),
  })
}

export function useMyScopes() {
  return useQuery({
    queryKey: ['staff_my_scopes'],
    queryFn: () => rpc<{ kind: 'event' | 'class'; id: string; name: string; date: string | null }[]>('staff_my_scopes'),
  })
}

/** Gọi một hàm ghi rồi làm mới các danh sách liên quan; báo kết quả bằng toast. */
export function useStaffMutation<V>(fn: (v: V) => Promise<unknown>, opts?: { silent?: boolean; onDone?: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of ['staff_profile', 'staff_scope', 'staff_review_queue', 'staff_my_scopes', 'audit_logs']) {
        qc.invalidateQueries({ queryKey: [key] })
      }
      if (!opts?.silent) toast(t('common.saved'))
      opts?.onDone?.()
    },
    onError: (e) => toast(staffErrorMessage(e, t), 'error'),
  })
}

export function staffErrorMessage(err: unknown, t: (k: string) => string): string {
  const m = (err as { message?: string })?.message ?? ''
  for (const code of ['project_name_required', 'started_on_required', 'title_required', 'reason_required', 'not_pending', 'bad_file_path']) {
    if (m.startsWith(code)) return t(`staff.errors.${code}`)
  }
  return errorMessage(err, t)
}

export const saveSelfEngagement = (v: { id: string | null; data: Record<string, unknown> }) =>
  rpc('staff_save_self_engagement', { p_id: v.id, p_data: v.data })
export const deleteSelfEngagement = (id: string) => rpc('staff_delete_self_engagement', { p_id: id })
export const saveCredential = (v: { id: string | null; data: Record<string, unknown> }) =>
  rpc('staff_save_credential', { p_id: v.id, p_data: v.data })
export const deleteCredential = (id: string) => rpc('staff_delete_credential', { p_id: id })
export const recordEngagement = (v: { id: string; data: Record<string, unknown> }) =>
  rpc('staff_record_engagement', { p_id: v.id, p_data: v.data })
export const reviewStaffItem = (v: { entity: 'engagement' | 'credential'; id: string; approve: boolean; reason?: string }) =>
  rpc('staff_review', { p_entity: v.entity, p_id: v.id, p_approve: v.approve, p_reason: v.reason ?? null })

/** Tải file chứng chỉ vào kho riêng tư: {user_id}/credentials/{ngẫu nhiên}.{đuôi} */
export async function uploadCredentialFile(userId: string, file: Blob, ext: string) {
  const path = `${userId}/credentials/${crypto.randomUUID()}.${ext}`
  const { error } = await db().storage.from('staff-files').upload(path, file, { contentType: file.type || undefined })
  if (error) throw error
  return path
}

/** Link có hạn để xem file trong kho riêng tư (chỉ chủ hồ sơ và admin) */
export async function openStaffFile(path: string) {
  const { data, error } = await db().storage.from('staff-files').createSignedUrl(path, 300)
  if (error) throw error
  window.open(data.signedUrl, '_blank', 'noopener')
}

/** Tên việc theo ngôn ngữ: sự kiện, lớp (trường · năm học) hoặc dự án */
export function engagementTitle(e: Pick<Engagement, 'kind' | 'event_name_vi' | 'event_name_en' | 'class_name' | 'project_name_vi' | 'project_name_en'>, lang: string) {
  const en = lang === 'en'
  if (e.kind === 'event') return (en && e.event_name_en) || e.event_name_vi || ''
  if (e.kind === 'class') return e.class_name ?? ''
  return (en && e.project_name_en) || e.project_name_vi || ''
}
