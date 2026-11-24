// Spec 28 · Đợt C sân tập: khảo sát VN Centre (lớp 1) và đánh giá người dùng (lớp 2).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const SCORE_KEYS = ['facility', 'tech', 'service', 'clean', 'value', 'family'] as const
export type ScoreKey = (typeof SCORE_KEYS)[number]
export const SUB_KEYS = ['tech', 'service', 'value', 'family'] as const
/** Trường thông tin khảo sát viên kiểm tra tại chỗ (cùng khoá với practice_venues). */
export const SURVEY_FIELDS = ['machine', 'bays', 'hours', 'phone', 'parking', 'late'] as const

export type SurveyStatus = 'assigned' | 'draft' | 'submitted' | 'approved' | 'rejected'
export interface Survey {
  id: string; venue_id: string; surveyor_id: string; assigned_at: string; visit_date: string | null
  answers: Record<string, unknown>; scores: Partial<Record<ScoreKey, number>>; overall: number | null
  pros_vi: string | null; cons_vi: string | null; status: SurveyStatus; submitted_at: string | null
  reviewed_at: string | null; review_note: string | null; published: boolean; applied_fields: string[]
}
export interface Surveyor { user_id: string; full_name: string | null; email: string | null; phone: string | null; open_tasks: number }

export interface Review {
  id: string; venue_id: string; user_id: string; stars: number; sub: Partial<Record<string, number>>; body: string | null
  visit_month: string | null; status: 'published' | 'hidden'; hidden_reason: string | null; report_count: number
  owner_reply: string | null; owner_reply_at: string | null; created_at: string; updated_at: string
}
export interface PublicReview {
  id: string; venue_id: string; stars: number; sub: Partial<Record<string, number>>; body: string | null; visit_month: string | null
  created_at: string; updated_at: string; owner_reply: string | null; owner_reply_at: string | null; author: string
}

function db() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình')
  return supabase
}
async function rows<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data as T
}

// ── Khảo sát viên ──────────────────────────────────────────────────────────
export function useMySurveys(userId: string | undefined) {
  return useQuery({
    queryKey: ['pv_my_surveys', userId],
    enabled: !!userId,
    queryFn: () => rows<Survey[]>(db().from('practice_venue_surveys').select('*').eq('surveyor_id', userId!).order('assigned_at', { ascending: false })),
  })
}
export function useSurvey(id: string) {
  return useQuery({ queryKey: ['pv_survey', id], enabled: !!id, queryFn: () => rows<Survey>(db().from('practice_venue_surveys').select('*').eq('id', id).single()) })
}
export function useSaveSurvey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: { id: string; visitDate: string | null; answers: Record<string, unknown>; scores: Record<string, number>; pros: string; cons: string; submit: boolean }) =>
      rows(db().rpc('pv_save_survey', { p_id: a.id, p_visit_date: a.visitDate, p_answers: a.answers, p_scores: a.scores, p_pros: a.pros, p_cons: a.cons, p_submit: a.submit })),
    onSuccess: (_d, a) => {
      qc.invalidateQueries({ queryKey: ['pv_survey', a.id] })
      qc.invalidateQueries({ queryKey: ['pv_my_surveys'] })
    },
  })
}

// ── Admin: giao việc, duyệt phiếu ──────────────────────────────────────────
export function useSurveyors() {
  return useQuery({ queryKey: ['pv_surveyors'], queryFn: () => rows<Surveyor[]>(db().rpc('pv_surveyors')) })
}
export function useAllSurveys() {
  return useQuery({
    queryKey: ['pv_all_surveys'],
    queryFn: () => rows<Survey[]>(db().from('practice_venue_surveys').select('*').order('assigned_at', { ascending: false }).limit(500)),
  })
}
export function useAssignSurvey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: { venueIds: string[]; surveyor: string }) => rows<number>(db().rpc('pv_assign_survey', { p_venue_ids: a.venueIds, p_surveyor: a.surveyor })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pv_all_surveys'] })
      qc.invalidateQueries({ queryKey: ['pv_surveyors'] })
    },
  })
}
export function useChangeSurvey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: { id: string; to: string | null }) =>
      a.to ? rows(db().rpc('pv_reassign_survey', { p_id: a.id, p_surveyor: a.to })) : rows(db().rpc('pv_cancel_survey', { p_id: a.id })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pv_all_surveys'] })
      qc.invalidateQueries({ queryKey: ['pv_surveyors'] })
    },
  })
}
export function useDecideSurvey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: { id: string; approve: boolean; fields?: string[]; publish?: boolean; note: string }) => {
      if (a.approve) return rows(db().rpc('pv_approve_survey', { p_id: a.id, p_fields: a.fields ?? [], p_publish: !!a.publish, p_note: a.note }))
      return rows(db().rpc('pv_reject_survey', { p_id: a.id, p_note: a.note }))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pv_all_surveys'] })
      qc.invalidateQueries({ queryKey: ['practice_venues'] })
    },
  })
}

// ── Đánh giá người dùng ────────────────────────────────────────────────────
export function usePublicReviews(venueId: string) {
  return useQuery({
    queryKey: ['pv_public_reviews', venueId],
    enabled: !!venueId,
    queryFn: () => rows<PublicReview[]>(db().from('pv_public_reviews').select('*').eq('venue_id', venueId).order('created_at', { ascending: false }).limit(200)),
  })
}
export function useMyReview(venueId: string, userId: string | undefined) {
  return useQuery({
    queryKey: ['pv_my_review', venueId, userId],
    enabled: !!venueId && !!userId,
    queryFn: () => rows<Review | null>(db().from('practice_venue_reviews').select('*').eq('venue_id', venueId).eq('user_id', userId!).maybeSingle()),
  })
}
export function useSaveReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: { venueId: string; stars: number; sub: Record<string, number>; body: string; visitMonth: string | null }) =>
      rows<string>(db().rpc('pv_save_review', { p_venue_id: a.venueId, p_stars: a.stars, p_sub: a.sub, p_body: a.body, p_visit_month: a.visitMonth })),
    onSuccess: (_d, a) => {
      qc.invalidateQueries({ queryKey: ['pv_public_reviews', a.venueId] })
      qc.invalidateQueries({ queryKey: ['pv_my_review', a.venueId] })
    },
  })
}
export function useReportReview() {
  return useMutation({ mutationFn: (a: { id: string; reason: string }) => rows(db().rpc('pv_report_review', { p_id: a.id, p_reason: a.reason })) })
}

/** Admin: đánh giá bị báo cáo ≥ 3 lần, hoặc tất cả gần đây. */
export function useReviewsAdmin(mode: 'flagged' | 'recent' | 'hidden') {
  return useQuery({
    queryKey: ['pv_reviews_admin', mode],
    queryFn: () => {
      let q = db().from('practice_venue_reviews').select('*')
      if (mode === 'flagged') q = q.eq('status', 'published').gte('report_count', 3)
      if (mode === 'hidden') q = q.eq('status', 'hidden')
      return rows<Review[]>(q.order('created_at', { ascending: false }).limit(200))
    },
  })
}
export function useFlaggedCount() {
  return useQuery({
    queryKey: ['pv_reviews_flagged_count'],
    queryFn: async () => {
      const a = await db().from('practice_venue_reviews').select('id', { count: 'exact', head: true }).eq('status', 'published').gte('report_count', 3)
      const b = await db().from('practice_venue_surveys').select('id', { count: 'exact', head: true }).eq('status', 'submitted')
      if (a.error) throw a.error
      if (b.error) throw b.error
      return { reviews: a.count ?? 0, surveys: b.count ?? 0 }
    },
  })
}
export function useModerateReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: { id: string; hide: boolean; reason: string }) => rows(db().rpc('pv_moderate_review', { p_id: a.id, p_hide: a.hide, p_reason: a.reason })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pv_reviews_admin'] })
      qc.invalidateQueries({ queryKey: ['pv_reviews_flagged_count'] })
    },
  })
}

// ── Chủ sân trả lời ────────────────────────────────────────────────────────
export function useVenueReviewsForOwner(venueId: string) {
  return useQuery({
    queryKey: ['pv_owner_reviews', venueId],
    enabled: !!venueId,
    queryFn: () => rows<PublicReview[]>(db().from('pv_public_reviews').select('*').eq('venue_id', venueId).order('created_at', { ascending: false }).limit(100)),
  })
}
export function useOwnerReply() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: { id: string; reply: string }) => rows(db().rpc('pv_owner_reply', { p_id: a.id, p_reply: a.reply })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pv_owner_reviews'] }),
  })
}

/** Lỗi → câu dễ hiểu (khoá venues.s.err.*). */
export function surveyErr(e: unknown, t: (k: string, o?: Record<string, unknown>) => string): string {
  const m = (e as { message?: string })?.message || String(e)
  for (const code of ['scores_incomplete', 'visit_date_required', 'score_out_of_range', 'not_editable', 'not_pending', 'note_required', 'not_a_surveyor',
    'already_assigned', 'stars_invalid', 'venue_not_found', 'owner_cannot_review', 'already_replied', 'reply_required', 'not_signed_in']) {
    if (m.includes(code)) return t(`venues.s.err.${code}`)
  }
  if (/row-level security|permission denied|not_allowed|insufficient/i.test(m)) return t('venues.err.permission')
  if (/Failed to fetch|NetworkError/i.test(m)) return t('venues.err.network')
  if (/does not exist|schema cache/i.test(m)) return t('venues.c.err.notMigrated')
  return t('venues.err.generic', { msg: m })
}
