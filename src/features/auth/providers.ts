import { useQuery } from '@tanstack/react-query'
import type { Provider, UserIdentity } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useSetting } from '@/lib/settings'

// Spec 12 mục 7b, 7c: các cách đăng nhập. Nút chỉ hiện khi cài đặt auth.providers bật (sau khi đã cấu hình
// nhà cung cấp trong Supabase Auth) — chưa đủ điều kiện (Apple Developer, Meta duyệt, Microsoft Azure…) thì ẩn.

export type OAuthProvider = Extract<Provider, 'google' | 'apple' | 'facebook' | 'azure'>
export const OAUTH_PROVIDERS: OAuthProvider[] = ['google', 'apple', 'facebook', 'azure']

export interface ProviderSettings {
  email_otp: boolean
  google: boolean
  apple: boolean
  facebook: boolean
  azure: boolean
}
const DEFAULT_PROVIDERS: ProviderSettings = { email_otp: true, google: false, apple: false, facebook: false, azure: false }

export function useAuthProviders(): ProviderSettings {
  const { value } = useSetting<Partial<ProviderSettings>>('auth.providers', DEFAULT_PROVIDERS)
  return { ...DEFAULT_PROVIDERS, ...value }
}

/** Đường quay về sau khi nhà cung cấp xác thực xong: trang đăng nhập (tự chuyển tiếp hoặc sang Chào mừng). */
export function oauthRedirect(next?: string | null) {
  return `${window.location.origin}/login${next ? `?next=${encodeURIComponent(next)}` : ''}`
}

/** Microsoft cần xin quyền email để Supabase nhận địa chỉ email (gộp tài khoản theo email). */
export function oauthScopes(provider: OAuthProvider) {
  return provider === 'azure' ? 'email' : undefined
}

export function signInWithProvider(provider: OAuthProvider, next?: string | null) {
  return supabase!.auth.signInWithOAuth({ provider, options: { redirectTo: oauthRedirect(next), scopes: oauthScopes(provider) } })
}

/** Gỡ một cách đăng nhập chỉ khi còn ít nhất hai cách (sau khi gỡ vẫn còn một). */
export function canUnlink(identities: Pick<UserIdentity, 'provider'>[]) {
  return identities.length >= 2
}

export interface MyIdentity {
  needs_onboarding: boolean
  is_student_account: boolean
  self_student_id: string | null
  student_code: string | null
  full_name: string | null
  birth_year: number | null
  account_kind: 'student' | 'adult' | null
  email: string | null
  phone: string | null
  phone_verified: boolean
}

/** Trạng thái tài khoản đang đăng nhập (cần bước Chào mừng không, mã VNC…). Máy chủ chưa có hàm thì coi như không cần. */
export function useMyIdentity(userId: string | undefined) {
  return useQuery({
    queryKey: ['auth-identity', userId],
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('auth_my_identity')
      if (error) return null
      return data as MyIdentity
    },
  })
}
