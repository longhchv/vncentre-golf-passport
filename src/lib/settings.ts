import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** Đọc một giá trị trong app_settings (R13: mọi con số nghiệp vụ lấy từ đây). */
export function useSetting<T>(key: string, fallback: T) {
  const q = useQuery({
    queryKey: ['app_settings', key],
    queryFn: async () => {
      const { data, error } = await supabase!.from('app_settings').select('value').eq('key', key).maybeSingle()
      if (error) throw error
      return (data?.value ?? null) as T | null
    },
    staleTime: 5 * 60_000,
  })
  return { value: (q.data ?? fallback) as T, isPending: q.isPending }
}

/** Địa chỉ web in trong QR (sổ, chứng nhận). Staging và production khác nhau. */
export function usePublicBaseUrl() {
  const { value } = useSetting<string>('app.public_base_url', 'https://app.vncentre.net')
  return value.replace(/\/+$/, '')
}
