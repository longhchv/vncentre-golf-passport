import { supabase } from '@/lib/supabase'

/** Gọi Edge Function; lỗi → Error(message = mã lỗi hàm trả về, vd. "too_young"). */
export async function invokeFunction<T = Record<string, unknown>>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.functions.invoke(name, { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const detail = ctx ? await ctx.json().catch(() => null) : null
    throw new Error(detail?.error ?? error.message)
  }
  return data as T
}
