import { supabase } from '@/lib/supabase'

export interface PassportLookup {
  result: 'ok' | 'not_found' | 'locked' | 'claim'
  retry_minutes?: number
  status?: 'unassigned' | 'assigned' | 'active' | 'lost' | 'void' | 'retired'
  tier_vi?: string
  tier_en?: string
  masked_name?: string | null
  school_name?: string | null
  relation?: 'guardian' | 'staff' | 'none'
  student_id?: string | null
  current_passport_code?: string | null
  identity_locked?: boolean
}

export interface ActivationStart {
  flow: 'A' | 'B'
  trusted?: boolean
  identity?: 'dob' | 'name' | null
  blocked?: 'other_guardian' | 'identity_locked'
  needs_dob?: boolean
  requires_photo_consent?: boolean
  child?: { gender: string | null; golf_goals: string[]; golf_goals_other: string | null }
}

export interface ActivationResult {
  student_id: string
  link_status: 'active' | 'pending_confirmation'
  matched: boolean
  flow: 'A' | 'B'
}

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.rpc(fn, args)
  if (error) throw error
  return data as T
}

/** Mã lỗi từ hàm CSDL (vd. "passport_not_activatable:active") → câu song ngữ. */
export function activationErrorText(t: (k: string, o?: Record<string, unknown>) => string, e: unknown): string {
  const msg = String((e as { message?: string })?.message ?? '')
  const [key, detail] = msg.split(':')
  return t(`activation.errors.${key}`, {
    defaultValue: t('errors.generic'),
    status: detail ? t(`passportStatus.${detail}`) : '',
  })
}
