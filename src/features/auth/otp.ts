import { supabase } from '@/lib/supabase'

export type OtpPurpose = 'signup' | 'reset_password' | 'add_phone' | 'verify_email'

export interface OtpSent {
  otp_id: string
  channel: 'zalo' | 'sms' | 'email'
  masked: string
  resend_after: number
  expires_in: number
  mock: boolean
}

/** Lỗi từ Edge Function auth-otp: mã lỗi (vd. phone_exists) + tham số (retry_after, attempts_left, min). */
export class OtpError extends Error {
  constructor(
    public code: string,
    public params: Record<string, unknown> = {},
  ) {
    super(code)
  }
}

export async function callOtp<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.functions.invoke('auth-otp', { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const detail = ctx ? await ctx.json().catch(() => null) : null
    throw new OtpError(detail?.error ?? 'network', detail ?? {})
  }
  return data as T
}

/** Câu thông báo song ngữ cho mã lỗi OTP. */
export function otpErrorText(t: (k: string, o?: Record<string, unknown>) => string, e: unknown): string {
  if (e instanceof OtpError) return t(`otp.errors.${e.code}`, { defaultValue: t('errors.generic'), ...e.params })
  return t('errors.generic')
}
