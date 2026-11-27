// Spec 30 · Bài viết tổng quan địa điểm — bảng practice_venue_articles (chỉ admin), web đọc view pv_public_articles.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { compressImage } from '@/lib/compressImage'

export const ARTICLE_STATUS = ['draft', 'approved', 'archived'] as const
export type ArticleStatus = (typeof ARTICLE_STATUS)[number]
export type ArticleKind = 'overview' | 'review'

export interface ArticleSource { label: string; url?: string; at?: string }

export interface Article {
  id: string; venue_id: string; kind: ArticleKind; lang: string; slug: string
  title: string; sapo: string | null; body: string
  cover_photo_id: string | null; cover_url: string | null
  sources: ArticleSource[]; info_date: string | null; needs_survey: boolean; author_name: string | null
  status: ArticleStatus; approved_at: string | null; created_at: string; updated_at: string
}

export interface VenuePhoto { id: string; path: string; tag: string; status: string; caption_vi: string | null }

/** Trang chia sẻ của bài: mỗi bài một đường link riêng, có ảnh và tiêu đề xem trước (Facebook, Zalo). */
export const TAPGOLF = 'https://tapgolf.vncentre.net'
export const articleUrl = (slug: string) => `${TAPGOLF}/bai/${slug}/`

function db() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình')
  return supabase
}
async function rows<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data as T
}

export const photoUrl = (path: string) => db().storage.from('venue-photos').getPublicUrl(path).data.publicUrl

const K = {
  list: (venueId: string) => ['practice_venue_articles', venueId] as const,
  photos: (venueId: string) => ['practice_venue_photos', 'approved', venueId] as const,
}

export function useArticles(venueId: string) {
  return useQuery({
    queryKey: K.list(venueId),
    enabled: !!venueId,
    queryFn: () => rows<Article[]>(db().from('practice_venue_articles').select('*').eq('venue_id', venueId).order('kind').order('lang')),
  })
}

export function useVenuePhotos(venueId: string) {
  return useQuery({
    queryKey: K.photos(venueId),
    enabled: !!venueId,
    queryFn: () => rows<VenuePhoto[]>(db().from('practice_venue_photos').select('id, path, tag, status, caption_vi').eq('venue_id', venueId).eq('status', 'approved').order('uploaded_at', { ascending: false }).limit(60)),
  })
}

type ArticleInput = Partial<Omit<Article, 'id' | 'created_at' | 'updated_at' | 'approved_at'>>

export function useSaveArticle(venueId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: ArticleInput }) => {
      if (id) return rows<Article>(db().from('practice_venue_articles').update(values).eq('id', id).select().single())
      return rows<Article>(db().from('practice_venue_articles').insert({ ...values, venue_id: venueId }).select().single())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: K.list(venueId) }),
  })
}

export function useDeleteArticle(venueId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => rows(db().from('practice_venue_articles').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: K.list(venueId) }),
  })
}

/** Admin tải ảnh bìa: lưu vào kho ảnh địa điểm rồi duyệt luôn (admin là người duyệt ảnh). */
export function useUploadCover(venueId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, file }: { userId: string; file: File }) => {
      const blob = await compressImage(file, 1_000_000, 1600)
      const path = `${userId}/${crypto.randomUUID()}.jpg`
      const { error: ue } = await db().storage.from('venue-photos').upload(path, blob, { contentType: 'image/jpeg' })
      if (ue) throw ue
      const p = await rows<VenuePhoto>(db().from('practice_venue_photos').insert({ venue_id: venueId, path, tag: 'other', consent: true }).select('id, path, tag, status, caption_vi').single())
      return rows<VenuePhoto>(db().from('practice_venue_photos').update({ status: 'approved', reviewed_by: userId, reviewed_at: new Date().toISOString() }).eq('id', p.id).select('id, path, tag, status, caption_vi').single())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: K.photos(venueId) }),
  })
}

/** Lỗi cơ sở dữ liệu → mã khoá i18n. */
export function articleErrKey(e: unknown): string | null {
  const m = (e as { message?: string })?.message || ''
  if (/approve_needs_body_and_sources/.test(m)) return 'venues.art.err.approveNeeds'
  if (/bad_sources/.test(m)) return 'venues.art.err.badSources'
  if (/pva_one_overview|duplicate key/.test(m)) return 'venues.art.err.duplicate'
  if (/cover_url/.test(m)) return 'venues.art.err.badCover'
  if (/photo_type/.test(m)) return 'venues.art.err.photoType'
  return null
}
