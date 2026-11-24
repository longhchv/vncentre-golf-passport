// Spec 27 · Đợt B sân tập: đề xuất, ảnh, điểm đóng góp, hàng chờ duyệt, chủ sân tự cập nhật.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { compressImage } from '@/lib/compressImage'
import type { Venue } from '../api'

export const PHOTO_TAGS = ['facade', 'bay', 'simulator', 'range', 'cafe', 'parking', 'price_board', 'other'] as const
export type PhotoTag = (typeof PHOTO_TAGS)[number]
export type SubKind = 'new_venue' | 'edit' | 'report_closed' | 'claim'
export type SubStatus = 'pending' | 'approved' | 'partly_approved' | 'rejected' | 'duplicate'

export interface Submission {
  id: string; kind: SubKind; venue_id: string | null; payload: Record<string, unknown>; evidence: string | null; evidence_path: string | null
  submitted_by: string; submitted_at: string; status: SubStatus; reviewed_at: string | null; review_note: string | null
  applied_fields: string[]; result_venue_id: string | null
}
export interface Photo {
  id: string; venue_id: string; submission_id: string | null; path: string; tag: PhotoTag; caption_vi: string | null
  uploaded_by: string; uploaded_at: string; status: 'pending' | 'approved' | 'rejected'
}
export interface PointRow { id: string; points: number; reason: string; created_at: string; credited_at: string | null }

/** Địa điểm công khai (view pv_public_venues) — người đóng góp không đọc bảng gốc. */
export type PublicVenue = Omit<Venue, 'partner_id' | 'created_at' | 'google_at'> & { cover_path: string | null; claimed: boolean; owner_updated_at: string | null }

function db() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình')
  return supabase
}
async function rows<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data as T
}
export function photoUrl(path: string) {
  return db().storage.from('venue-photos').getPublicUrl(path).data.publicUrl
}

const K = {
  pub: (id: string) => ['pv_public_venues', id] as const,
  mine: ['pv_my_submissions'] as const,
  points: ['pv_my_points'] as const,
  queue: ['pv_queue'] as const,
  photoQueue: ['pv_photo_queue'] as const,
  owned: ['pv_my_venues'] as const,
}

export function usePublicVenue(id: string) {
  return useQuery({ queryKey: K.pub(id), enabled: !!id, queryFn: () => rows<PublicVenue>(db().from('pv_public_venues').select('*').eq('id', id).single()) })
}

/** Tải ảnh lên kho venue-photos (nén ≤1600 px) rồi ghi dòng ảnh chờ duyệt. */
export async function uploadPhotos(userId: string, venueId: string, items: { file: File; tag: PhotoTag }[], submissionId?: string) {
  for (const it of items) {
    const blob = await compressImage(it.file, 1_000_000, 1600)
    const path = `${userId}/${crypto.randomUUID()}.jpg`
    const { error: ue } = await db().storage.from('venue-photos').upload(path, blob, { contentType: 'image/jpeg' })
    if (ue) throw ue
    const { error } = await db().from('practice_venue_photos').insert({ venue_id: venueId, submission_id: submissionId ?? null, path, tag: it.tag, consent: true })
    if (error) throw error
  }
}

export function useSubmit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: { kind: SubKind; venueId: string | null; payload: Record<string, unknown>; evidence: string; evidencePath?: string | null }) =>
      rows<string>(db().rpc('pv_submit', { p_kind: a.kind, p_venue_id: a.venueId, p_payload: a.payload, p_evidence: a.evidence, p_evidence_path: a.evidencePath ?? null })),
    onSuccess: () => qc.invalidateQueries({ queryKey: K.mine }),
  })
}

export function useMySubmissions() {
  return useQuery({
    queryKey: K.mine,
    queryFn: async () => {
      const [subs, photos] = await Promise.all([
        rows<Submission[]>(db().from('practice_venue_submissions').select('*').order('submitted_at', { ascending: false }).limit(100)),
        rows<Photo[]>(db().from('practice_venue_photos').select('*').order('uploaded_at', { ascending: false }).limit(200)),
      ])
      return { subs, photos }
    },
  })
}
export function useMyPoints() {
  return useQuery({ queryKey: K.points, queryFn: () => rows<PointRow[]>(db().from('venue_contribution_points').select('*').order('created_at', { ascending: false })) })
}

/** Tên địa điểm theo mã, đọc từ view công khai (dùng cho danh sách đóng góp, hàng chờ). */
export function useVenueNames(ids: string[]) {
  const uniq = [...new Set(ids.filter(Boolean))].sort()
  return useQuery({
    queryKey: ['pv_names', uniq.join(',')],
    enabled: uniq.length > 0,
    queryFn: async () => {
      const r = await rows<{ id: string; name: string }[]>(db().from('pv_public_venues').select('id, name').in('id', uniq))
      return Object.fromEntries(r.map((x) => [x.id, x.name])) as Record<string, string>
    },
  })
}

// ── Admin ────────────────────────────────────────────────────────────────
export function useQueue() {
  return useQuery({
    queryKey: K.queue,
    queryFn: async () => {
      const subs = await rows<Submission[]>(db().from('practice_venue_submissions').select('*').eq('status', 'pending').order('submitted_at'))
      const ids = subs.map((s) => s.venue_id).filter(Boolean) as string[]
      const venues = ids.length ? await rows<Venue[]>(db().from('practice_venues').select('*').in('id', [...new Set(ids)])) : []
      const photos = subs.length ? await rows<Photo[]>(db().from('practice_venue_photos').select('*').in('submission_id', subs.map((s) => s.id))) : []
      return { subs, venues: Object.fromEntries(venues.map((v) => [v.id, v])) as Record<string, Venue>, photos }
    },
  })
}
export function useReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: { id: string; action: 'approve' | 'reject' | 'duplicate'; fields?: string[] | null; note?: string }) => {
      if (a.action === 'approve') return rows<{ status: string; venue_id: string; points: number }>(db().rpc('pv_approve_submission', { p_id: a.id, p_fields: a.fields ?? null, p_note: a.note ?? null }))
      await rows(db().rpc('pv_reject_submission', { p_id: a.id, p_note: a.note ?? '', p_duplicate: a.action === 'duplicate' }))
      return null
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: K.queue })
      qc.invalidateQueries({ queryKey: ['practice_venues'] })
    },
  })
}
export function usePhotoQueue() {
  return useQuery({ queryKey: K.photoQueue, queryFn: () => rows<Photo[]>(db().from('practice_venue_photos').select('*').eq('status', 'pending').order('uploaded_at')) })
}
export function useModeratePhoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: { id: string; status: 'approved' | 'rejected'; cover?: boolean }) =>
      rows<number>(db().rpc('pv_moderate_photo', { p_id: a.id, p_status: a.status, p_cover: !!a.cover })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: K.photoQueue })
      qc.invalidateQueries({ queryKey: K.queue })
    },
  })
}
export function usePendingCounts() {
  return useQuery({
    queryKey: ['pv_pending_counts'],
    queryFn: async () => {
      const a = await db().from('practice_venue_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      const b = await db().from('practice_venue_photos').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      if (a.error) throw a.error
      if (b.error) throw b.error
      return { subs: a.count ?? 0, photos: b.count ?? 0 }
    },
  })
}

// ── Chủ sân ──────────────────────────────────────────────────────────────
export function useMyVenues() {
  return useQuery({ queryKey: K.owned, queryFn: () => rows<Venue[]>(db().rpc('pv_my_venues')) })
}
export function useOwnerUpdate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: { id: string; payload: Record<string, unknown> }) => rows(db().rpc('pv_owner_update', { p_venue_id: a.id, p_payload: a.payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: K.owned }),
  })
}

/** Lỗi → câu dễ hiểu. */
export function contribErr(e: unknown, t: (k: string, o?: Record<string, unknown>) => string): string {
  const m = (e as { message?: string })?.message || String(e)
  for (const code of ['too_many_pending', 'nothing_changed', 'new_venue_incomplete', 'claim_needs_evidence', 'venue_not_found', 'note_required', 'not_pending', 'no_field_selected']) {
    if (m.includes(code)) return t(`venues.c.err.${code}`)
  }
  if (/row-level security|permission denied|not_allowed|insufficient/i.test(m)) return t('venues.err.permission')
  if (/Failed to fetch|NetworkError/i.test(m)) return t('venues.err.network')
  if (/does not exist|schema cache/i.test(m)) return t('venues.c.err.notMigrated')
  return t('venues.err.generic', { msg: m })
}
