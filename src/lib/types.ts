// Kiểu dữ liệu tối thiểu cho các bảng giao diện đang dùng (khớp supabase/migrations).

export type Role =
  | 'admin'
  | 'head_coach'
  | 'coach'
  | 'assistant'
  | 'school_manager'
  | 'pe_teacher'
  | 'partner'
  | 'event_staff'

export interface Profile {
  id: string
  user_id: string
  full_name: string | null
  phone: string | null
  email: string | null
  preferred_language: 'vi' | 'en'
  avatar_url: string | null
  status: 'active' | 'suspended'
}

export interface UserRole {
  id: string
  user_id: string
  role: Role
  school_id: string | null
  class_id: string | null
}

export interface School {
  id: string
  name: string
  short_name: string | null
  type: 'public' | 'private' | 'international' | 'center' | 'club' | 'other'
  city: string | null
  address: string | null
  requires_photo_consent: boolean
  is_active: boolean
}

export interface AcademicYear {
  id: string
  name: string
  start_date: string
  end_date: string
  is_current: boolean
}

export interface Program {
  id: string
  code: string
  name_vi: string
  name_en: string
  description_vi: string | null
  description_en: string | null
  is_official_level_track: boolean
  is_active: boolean
}

export interface PassportStage {
  id: string
  number: number
  name_vi: string
  name_en: string
  color: string
  level_from: number
  level_to: number
}

export interface PassportTier {
  id: string
  code: string
  name_vi: string
  name_en: string
  level_from: number
  level_to: number
  validity_months: number
}

export interface LevelContentRow {
  key: string
  group: 'technique' | 'culture' | 'rules' | 'knowledge' | 'life_skills' | 'other'
  label_vi: string
  label_en: string
  vi: string
  en: string
}

export interface Level {
  id: string
  program_id: string
  number: number
  name_vi: string
  name_en: string
  group_name_vi: string | null
  group_name_en: string | null
  summary_vi: string | null
  summary_en: string | null
  target_handicap: string | null
  passport_stage_id: string | null
  passport_tier_id: string | null
  content_detail: { draft?: boolean; source?: string; rows?: LevelContentRow[] } | null
}

export interface ClassType {
  id: string
  code: string
  name_vi: string
  name_en: string
  session_minutes_min: number | null
  session_minutes_max: number | null
  sessions_per_level_min: number | null
  sessions_per_level_max: number | null
  default_scoring_mode: 'pass_fail' | 'scale_1_5' | 'measured'
}

export interface AppSetting {
  id: string
  key: string
  value: unknown
  description_vi: string | null
  description_en: string | null
  is_public: boolean
  updated_at: string
}

export interface Product {
  id: string
  code: string
  name_vi: string
  name_en: string
  price_vnd: number
  is_active: boolean
}

export interface AuditLog {
  id: string
  actor_user_id: string | null
  action: 'insert' | 'update' | 'delete' | string
  entity_type: string
  entity_id: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  reason: string | null
  created_at: string
  actor: { full_name: string | null; email: string | null } | null
}
