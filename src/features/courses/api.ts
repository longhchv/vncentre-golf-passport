// Truy cập 5 bảng gc_* (khu quản trị sân). Quyền ở cơ sở dữ liệu: gc_is_admin().
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { invokeFunction } from '@/lib/functions'
import type { GcCourse, GcPhoto, GcPlace, GcReview, GcTee } from '@/lib/types'
import type { PlaceRow } from './importFormat'
import { matchExisting } from './importFormat'

function db() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình')
  return supabase
}
async function rows<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data as T
}

export const courseKeys = {
  list: ['gc_courses'] as const,
  one: (id: string) => ['gc_courses', id] as const,
  tees: (id: string) => ['gc_tees', id] as const,
  photos: (id: string) => ['gc_photos', id] as const,
  review: (id: string) => ['gc_reviews', id] as const,
  places: (id: string) => ['gc_places', id] as const,
}

export function useCourses() {
  return useQuery({ queryKey: courseKeys.list, queryFn: () => rows<GcCourse[]>(db().from('gc_courses').select('*').order('name')) })
}
export function useCourse(id: string) {
  return useQuery({ queryKey: courseKeys.one(id), queryFn: () => rows<GcCourse>(db().from('gc_courses').select('*').eq('id', id).single()) })
}
export function useTees(courseId: string) {
  return useQuery({ queryKey: courseKeys.tees(courseId), queryFn: () => rows<GcTee[]>(db().from('gc_tees').select('*').eq('course_id', courseId).order('sort')) })
}
export function usePhotos(courseId: string) {
  return useQuery({ queryKey: courseKeys.photos(courseId), queryFn: () => rows<GcPhoto[]>(db().from('gc_photos').select('*').eq('course_id', courseId).order('sort')) })
}
export function useReview(courseId: string) {
  return useQuery({ queryKey: courseKeys.review(courseId), queryFn: () => rows<GcReview | null>(db().from('gc_reviews').select('*').eq('course_id', courseId).maybeSingle()) })
}
export function usePlaces(courseId: string) {
  return useQuery({ queryKey: courseKeys.places(courseId), queryFn: () => rows<GcPlace[]>(db().from('gc_places').select('*').eq('course_id', courseId).order('cat').order('km', { nullsFirst: false })) })
}

/** Tạo sân mới (nháp) hoặc cập nhật thông tin sân. */
export function useSaveCourse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (row: Partial<GcCourse> & { id?: string }) => {
      const { id, ...values } = row
      const q = id ? db().from('gc_courses').update(values).eq('id', id) : db().from('gc_courses').insert({ status: 'draft', ...values })
      return rows<GcCourse>(q.select().single())
    },
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: courseKeys.list }); qc.setQueryData(courseKeys.one(c.id), c) },
  })
}

/** Ghi toàn bộ bảng tee của sân trải nghiệm (thay thế các dòng cũ). */
export function useSaveTees(courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (tees: Omit<GcTee, 'id' | 'course_id'>[]) => {
      await rows(db().from('gc_tees').delete().eq('course_id', courseId))
      if (tees.length) await rows(db().from('gc_tees').insert(tees.map((t, i) => ({ ...t, course_id: courseId, sort: i }))))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: courseKeys.tees(courseId) }),
  })
}

export function useSaveReview(courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (r: Omit<GcReview, 'course_id'>) => rows<GcReview>(db().from('gc_reviews').upsert({ ...r, course_id: courseId }).select().single()),
    onSuccess: (r) => qc.setQueryData(courseKeys.review(courseId), r),
  })
}

/** Lỗi khi địa điểm vừa được sửa ở app khác (app CSR) sau lúc mình tải. */
export class PlaceConflictError extends Error {
  constructor() { super('place_conflict') }
}

/** Sửa một địa điểm, có kiểm tra phiên bản để không ghi đè thay đổi của app khác. */
export function useSavePlace(courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ place, force }: { place: Partial<GcPlace> & { id: string; version: number }; force?: boolean }) => {
      const { id, version, ...values } = place
      let q = db().from('gc_places').update({ ...values, updated_via: 'passport' }).eq('id', id)
      if (!force) q = q.eq('version', version)
      const data = await rows<GcPlace[]>(q.select())
      if (!data.length) throw new PlaceConflictError()
      return data[0]
    },
    onSettled: () => qc.invalidateQueries({ queryKey: courseKeys.places(courseId) }),
  })
}

/**
 * Nhập danh sách Minh gửi: nơi mới → thêm (auto=true); nơi đã có (cùng pid hoặc tên gần giống) → chỉ cập nhật
 * sao, lượt, ngày lấy số, khoảng cách, nhóm (giữ mô tả đã sửa tay); nơi đoàn đã ghé → bỏ qua.
 */
export function useImportPlaces(courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (picked: PlaceRow[]) => {
      const existing = await rows<GcPlace[]>(db().from('gc_places').select('id, pid, name, src').eq('course_id', courseId))
      const plan = matchExisting(picked, existing)
      const inserts = plan.filter((m) => m.kind === 'new').map(({ row }) => ({
        course_id: courseId, src: 'web', cat: row.cat, name: row.name, area: row.area, note: row.note, note_en: row.note_en,
        phone: row.phone, km: row.km, drive_min: row.drive_min, g_rating: row.g_rating, g_count: row.g_count, g_at: row.g_at,
        pid: row.pid, auto: true, updated_via: 'passport',
      }))
      if (inserts.length) await rows(db().from('gc_places').insert(inserts))
      const updates = plan.filter((m) => m.kind === 'update')
      for (const { row, existingId } of updates) {
        const v: Record<string, unknown> = { cat: row.cat, g_rating: row.g_rating, g_count: row.g_count, g_at: row.g_at, updated_via: 'passport' }
        if (row.km !== null) v.km = row.km
        if (row.drive_min !== null) v.drive_min = row.drive_min
        if (row.pid) v.pid = row.pid
        await rows(db().from('gc_places').update(v).eq('id', existingId!))
      }
      return { added: inserts.length, updated: updates.length, skipped: plan.filter((m) => m.kind === 'visited').length }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: courseKeys.places(courseId) }),
  })
}

// ---- Claude viết chữ (Edge Function goi-y-quanh-san; khoá Claude chỉ nằm ở máy chủ) ----
export function writeReviewText(input: { course: string; country: string; y: string; scores: Record<string, number> }) {
  return invokeFunction<{ vi: string; en: string }>('goi-y-quanh-san', { action: 'viet-cam-nhan', ...input })
}
export function writePlaceNotes(input: { course: string; places: { key: string; name: string; cat: string; area: string | null }[] }) {
  return invokeFunction<{ items: { key: string; vi: string; en: string }[] }>('goi-y-quanh-san', { action: 'viet-mo-ta', ...input })
}
