// Spec 30 · Tab "Bài viết" trong trang sửa địa điểm: bài tổng quan (soạn → duyệt → lên tapgolf), chỗ chừa cho bài review.
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Eye, ExternalLink, ImagePlus, Pencil, Plus, Trash2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, FormError, Input, Textarea } from '@/components/ui/form'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/auth/AuthProvider'
import { cn } from '@/lib/utils'
import { Chip, Section, fmtDate } from '@/features/courses/parts'
import type { Venue } from '../api'
import {
  articleErrKey, articleUrl, photoUrl, useArticles, useDeleteArticle, useSaveArticle, useUploadCover, useVenuePhotos,
  type Article, type ArticleSource, type ArticleStatus,
} from './api'
import { Markdown } from './md'

const LANG_LABEL: Record<string, string> = { vi: 'Tiếng Việt', en: 'English', ko: '한국어', ja: '日本語', zh: '中文' }

interface Draft {
  title: string; sapo: string; body: string; cover_photo_id: string | null; cover_url: string
  sources: ArticleSource[]; info_date: string; needs_survey: boolean
}

const draftOf = (a: Article | null, venue: Venue): Draft => ({
  title: a?.title ?? venue.name, sapo: a?.sapo ?? '', body: a?.body ?? '',
  cover_photo_id: a?.cover_photo_id ?? null, cover_url: a?.cover_url ?? '',
  sources: (a?.sources ?? []).map((s) => ({ ...s })), info_date: a?.info_date ?? '', needs_survey: a?.needs_survey ?? false,
})

export function ArticlesTab({ venue }: { venue: Venue }) {
  const { t, i18n } = useTranslation()
  const list = useArticles(venue.id)
  const [edit, setEdit] = useState<Article | 'new' | null>(null)
  const overviews = (list.data ?? []).filter((a) => a.kind === 'overview')
  const hasVi = overviews.some((a) => a.lang === 'vi')

  if (edit) {
    return <Editor venue={venue} article={edit === 'new' ? null : edit} onDone={() => setEdit(null)} />
  }
  return (
    <div className="space-y-4">
      <Section title={t('venues.art.overview')} aside={<span className="text-sm text-navy/60">{t('venues.art.overviewHint')}</span>}>
        <FormError message={list.error ? t('venues.err.generic', { msg: (list.error as Error).message }) : null} />
        {list.isPending && <p className="text-sm text-navy/60">{t('common.loading')}</p>}
        {overviews.map((a) => (
          <div key={a.id} className="flex flex-col gap-2 rounded-xl border border-navy/10 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge s={a.status} />
              <span className="text-sm text-navy/60">{LANG_LABEL[a.lang] ?? a.lang} · {t('venues.art.updated', { d: fmtDate(a.updated_at, i18n.language) })}</span>
              {a.needs_survey && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{t('venues.art.needsSurvey')}</span>}
            </div>
            <b className="text-base">{a.title}</b>
            {a.sapo && <p className="line-clamp-2 text-sm text-navy/70">{a.sapo}</p>}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setEdit(a)}><Pencil className="h-4 w-4" /> {t('venues.art.edit')}</Button>
              {a.status === 'approved' && <ShareButtons slug={a.slug} />}
            </div>
          </div>
        ))}
        {!list.isPending && !hasVi && (
          <div className="rounded-xl border border-dashed border-navy/20 p-4 text-center">
            <p className="mb-3 text-sm text-navy/65">{t('venues.art.none')}</p>
            <Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" /> {t('venues.art.create')}</Button>
          </div>
        )}
      </Section>
      <Section title={t('venues.art.reviews')}>
        <p className="text-sm text-navy/65">{t('venues.art.reviewsSoon')}</p>
      </Section>
    </div>
  )
}

function StatusBadge({ s }: { s: ArticleStatus }) {
  const { t } = useTranslation()
  const cls = s === 'approved' ? 'bg-green-100 text-green-800' : s === 'archived' ? 'bg-navy/10 text-navy/60' : 'bg-gold/20 text-navy'
  return <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', cls)}>{t(`venues.art.status.${s}`)}</span>
}

function ShareButtons({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const url = articleUrl(slug)
  return (
    <>
      <Button variant="outline" size="sm" asChild>
        <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> {t('venues.art.open')}</a>
      </Button>
      <Button variant="outline" size="sm" onClick={async () => {
        try { await navigator.clipboard.writeText(url); toast(t('venues.art.copied')) } catch { toast(url) }
      }}><Copy className="h-4 w-4" /> {t('venues.art.copy')}</Button>
    </>
  )
}

const isHttps = (x: string) => /^https:\/\//i.test(x.trim())
const isHttp = (x: string) => /^https?:\/\//i.test(x.trim())

function Editor({ venue, article, onDone }: { venue: Venue; article: Article | null; onDone: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { session } = useAuth()
  const save = useSaveArticle(venue.id)
  const del = useDeleteArticle(venue.id)
  const photos = useVenuePhotos(venue.id)
  const upload = useUploadCover(venue.id)
  const initial = useMemo(() => draftOf(article, venue), [article, venue])
  const [d, setD] = useState<Draft>(initial)
  const [cur, setCur] = useState<Article | null>(article)
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [askDel, setAskDel] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const dirty = JSON.stringify(d) !== JSON.stringify(draftOf(cur, venue))
  const busy = save.isPending || del.isPending || upload.isPending

  const coverSrc = d.cover_photo_id
    ? (() => { const p = (photos.data ?? []).find((x) => x.id === d.cover_photo_id); return p ? photoUrl(p.path) : null })()
    : isHttps(d.cover_url) ? d.cover_url.trim() : null

  function check(approving: boolean): string | null {
    const title = d.title.trim()
    if (title.length < 5 || title.length > 160) return t('venues.art.err.title')
    if (d.sapo.length > 400) return t('venues.art.err.sapo')
    if (d.cover_url.trim() && !isHttps(d.cover_url)) return t('venues.art.err.badCover')
    for (const s of d.sources) {
      if (!s.label.trim()) return t('venues.art.err.badSources')
      if (s.url && s.url.trim() && !isHttp(s.url)) return t('venues.art.err.badSources')
    }
    if (approving && (!d.body.trim() || !d.sources.length)) return t('venues.art.err.approveNeeds')
    return null
  }

  async function submit(status: ArticleStatus) {
    setError(null)
    const e = check(status === 'approved')
    if (e) return setError(e)
    const values = {
      title: d.title.trim(), sapo: d.sapo.trim() || null, body: d.body,
      cover_photo_id: d.cover_photo_id, cover_url: d.cover_photo_id ? null : d.cover_url.trim() || null,
      sources: d.sources.map((s) => ({ label: s.label.trim(), ...(s.url?.trim() ? { url: s.url.trim() } : {}), ...(s.at ? { at: s.at } : {}) })),
      info_date: d.info_date || null, needs_survey: d.needs_survey, status,
      ...(cur ? {} : { kind: 'overview' as const, lang: 'vi' }),
    }
    try {
      const a = await save.mutateAsync({ id: cur?.id, values })
      setCur(a)
      setD(draftOf(a, venue))
      toast(t(status === 'approved' ? 'venues.art.published' : status === 'archived' ? 'venues.art.unpublished' : 'venues.art.saved'))
    } catch (err) {
      const k = articleErrKey(err)
      setError(k ? t(k) : t('venues.err.generic', { msg: (err as Error).message }))
    }
  }

  async function onUpload(file: File | undefined) {
    if (!file || !session?.user.id) return
    setError(null)
    try {
      const p = await upload.mutateAsync({ userId: session.user.id, file })
      setD((x) => ({ ...x, cover_photo_id: p.id, cover_url: '' }))
    } catch (err) {
      const k = articleErrKey(err)
      setError(k ? t(k) : t('venues.err.generic', { msg: (err as Error).message }))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => { if (!dirty || confirm(t('venues.art.leave'))) onDone() }}><Undo2 className="h-4 w-4" /> {t('venues.art.back')}</Button>
        {cur && <StatusBadge s={cur.status} />}
        {cur?.status === 'approved' && <ShareButtons slug={cur.slug} />}
      </div>

      <Section title={t('venues.art.content')} aside={
        <Chip on={preview} onClick={() => setPreview((x) => !x)}><Eye className="mr-1 h-4 w-4" /> {t('venues.art.preview')}</Chip>
      }>
        {preview ? (
          <article className="space-y-3">
            {coverSrc && <img src={coverSrc} alt="" className="aspect-[1.91/1] w-full rounded-xl object-cover" />}
            <h1 className="text-2xl font-bold leading-tight">{d.title}</h1>
            {d.sapo && <p className="text-lg font-semibold text-navy/80">{d.sapo}</p>}
            <Markdown src={d.body} />
            {d.sources.length > 0 && (
              <div className="border-t border-navy/10 pt-3 text-sm text-navy/70">
                <b>{t('venues.art.sourcesTitle')}</b>
                <ul className="list-disc pl-5">{d.sources.map((s, i) => <li key={i}>{s.label}{s.at ? ` (${s.at})` : ''}</li>)}</ul>
                {d.info_date && <p>{t('venues.art.infoAsOf', { d: d.info_date })}</p>}
              </div>
            )}
          </article>
        ) : (
          <div className="space-y-3">
            <Field label={t('venues.art.f.title')} hint={t('venues.art.h.title', { n: d.title.length })}>
              <Input value={d.title} maxLength={160} onChange={(e) => set('title', e.target.value)} />
            </Field>
            <Field label={t('venues.art.f.sapo')} hint={t('venues.art.h.sapo', { n: d.sapo.length })}>
              <Textarea rows={3} value={d.sapo} maxLength={400} onChange={(e) => set('sapo', e.target.value)} />
            </Field>
            <Field label={t('venues.art.f.body')} hint={t('venues.art.h.body')}>
              <Textarea rows={18} value={d.body} onChange={(e) => set('body', e.target.value)} className="font-mono text-sm" />
            </Field>
          </div>
        )}
      </Section>

      <Section title={t('venues.art.cover')} aside={<span className="text-sm text-navy/60">{t('venues.art.coverHint')}</span>}>
        {coverSrc && <img src={coverSrc} alt="" className="aspect-[1.91/1] w-full max-w-md rounded-xl object-cover" />}
        <div className="flex flex-wrap gap-2">
          {(photos.data ?? []).map((p) => (
            <button key={p.id} type="button" onClick={() => setD((x) => ({ ...x, cover_photo_id: x.cover_photo_id === p.id ? null : p.id, cover_url: '' }))}
              className={cn('h-16 w-24 overflow-hidden rounded-lg border-2', d.cover_photo_id === p.id ? 'border-bronze' : 'border-transparent')}
              aria-pressed={d.cover_photo_id === p.id} aria-label={p.caption_vi ?? p.tag}>
              <img src={photoUrl(p.path)} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { onUpload(e.target.files?.[0]); e.target.value = '' }} />
          <Button variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}><ImagePlus className="h-4 w-4" /> {upload.isPending ? t('venues.art.uploading') : t('venues.art.upload')}</Button>
        </div>
        <Field label={t('venues.art.f.coverUrl')} hint={t('venues.art.h.coverUrl')}>
          <Input value={d.cover_url} placeholder="https://…" disabled={!!d.cover_photo_id} onChange={(e) => set('cover_url', e.target.value)} />
        </Field>
      </Section>

      <Section title={t('venues.art.sourcesTitle')} aside={<span className="text-sm text-navy/60">{t('venues.art.sourcesHint')}</span>}>
        {d.sources.map((s, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-navy/10 p-3 sm:grid-cols-[1fr_1fr_9rem_auto]">
            <Input aria-label={t('venues.art.f.srcLabel')} placeholder={t('venues.art.f.srcLabel')} value={s.label}
              onChange={(e) => set('sources', d.sources.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <Input aria-label="URL" placeholder="https://…" value={s.url ?? ''}
              onChange={(e) => set('sources', d.sources.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
            <Input type="date" aria-label={t('venues.art.f.srcAt')} value={s.at ?? ''}
              onChange={(e) => set('sources', d.sources.map((x, j) => (j === i ? { ...x, at: e.target.value } : x)))} />
            <Button variant="ghost" size="sm" aria-label={t('venues.art.delete')} onClick={() => set('sources', d.sources.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => set('sources', [...d.sources, { label: '', url: '', at: new Date().toISOString().slice(0, 10) }])}>
          <Plus className="h-4 w-4" /> {t('venues.art.addSource')}
        </Button>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('venues.art.f.infoDate')}>
            <Input type="date" value={d.info_date} onChange={(e) => set('info_date', e.target.value)} />
          </Field>
          <Checkbox label={t('venues.art.f.needsSurvey')} checked={d.needs_survey} onChange={(e) => set('needs_survey', e.target.checked)} />
        </div>
      </Section>

      <FormError message={error} />
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button variant="outline" disabled={busy || (!!cur && !dirty)} onClick={() => submit(cur?.status === 'approved' ? 'approved' : 'draft')}>
          {save.isPending ? t('venues.saving') : cur?.status === 'approved' ? t('venues.art.saveLive') : t('venues.art.saveDraft')}
        </Button>
        {cur?.status !== 'approved' && (
          <Button disabled={busy} onClick={() => submit('approved')}><Check className="h-4 w-4" /> {t('venues.art.approve')}</Button>
        )}
        {cur?.status === 'approved' && (
          <Button variant="outline" disabled={busy} onClick={() => submit('archived')}>{t('venues.art.unpublish')}</Button>
        )}
        {cur && cur.status !== 'approved' && (
          <Button variant="ghost" disabled={busy} onClick={() => setAskDel(true)}><Trash2 className="h-4 w-4" /> {t('venues.art.delete')}</Button>
        )}
      </div>
      <p className="text-sm text-navy/60">{t('venues.art.shareNote')}</p>

      <Dialog open={askDel} onClose={() => setAskDel(false)} title={t('venues.art.deleteTitle')}>
        <p className="mb-4 text-base">{t('venues.art.deleteBody')}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => setAskDel(false)}>{t('common.cancel')}</Button>
          <Button disabled={del.isPending} onClick={async () => {
            try { await del.mutateAsync(cur!.id); setAskDel(false); onDone() } catch (err) { setAskDel(false); setError((err as Error).message) }
          }}>{t('venues.art.delete')}</Button>
        </div>
      </Dialog>
    </div>
  )
}
