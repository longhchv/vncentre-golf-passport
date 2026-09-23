import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'

function db() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình')
  return supabase
}

/** Đọc cả bảng (dùng cho bảng cấu hình, số dòng nhỏ). */
export function useTable<T>(table: string, opts?: { select?: string; order?: string; ascending?: boolean }) {
  return useQuery({
    queryKey: [table, opts],
    queryFn: async () => {
      let q = db().from(table).select(opts?.select ?? '*')
      if (opts?.order) q = q.order(opts.order, { ascending: opts.ascending ?? true })
      const { data, error } = await q
      if (error) throw error
      return data as T[]
    },
  })
}

/** Thêm mới (không có id) hoặc cập nhật (có id) một dòng; báo kết quả bằng toast. */
export function useSaveRow(table: string, extraInvalidate: string[] = []) {
  const qc = useQueryClient()
  const toast = useToast()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: async (row: Record<string, unknown> & { id?: string }) => {
      const { id, ...values } = row
      const res = id
        ? await db().from(table).update(values).eq('id', id).select().single()
        : await db().from(table).insert(values).select().single()
      if (res.error) throw res.error
      return res.data
    },
    onSuccess: () => {
      for (const key of [table, ...extraInvalidate]) qc.invalidateQueries({ queryKey: [key] })
      qc.invalidateQueries({ queryKey: ['audit_logs'] })
      toast(t('common.saved'))
    },
    onError: (err: Error) => toast(errorMessage(err, t), 'error'),
  })
}

export function errorMessage(err: unknown, t: (k: string) => string): string {
  const e = err as { code?: string; message?: string }
  if (e?.code === '23505') return t('errors.duplicate')
  // PGRST116: cập nhật 0 dòng — thường do phân quyền chặn
  if (e?.code === '42501' || e?.code === 'PGRST301' || e?.code === 'PGRST116') return t('errors.forbidden')
  if (e?.code === '23514') return t('errors.invalid')
  return e?.message || t('errors.generic')
}
