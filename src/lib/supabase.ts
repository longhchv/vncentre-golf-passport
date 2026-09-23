import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && anonKey)

// null khi chưa cấu hình biến môi trường, để app vẫn chạy được ở Bước 1
export const supabase: SupabaseClient | null = supabaseConfigured ? createClient(url!, anonKey!) : null

/** Gọi endpoint health của Supabase Auth để kiểm tra kết nối. */
export async function checkSupabase(): Promise<'ok' | 'not_configured' | 'error'> {
  if (!supabaseConfigured) return 'not_configured'
  try {
    const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anonKey! } })
    return res.ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}
