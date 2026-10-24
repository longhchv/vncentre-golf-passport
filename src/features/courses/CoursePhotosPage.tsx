// Màn 4 · Ảnh (bản mẫu docs/mockups/quan-tri-san/Anh.dc.html)
// Chọn nhiều ảnh → mỗi ảnh thu nhỏ, đóng logo, tải lên kho site-photos/gc/<mã sân>/ → ghi gc_photos.
// Ảnh đứng đầu là ảnh đại diện trên website. Mọi thay đổi lưu ngay, không cần bấm Lưu.
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, ImagePlus, RotateCw, Star, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, FormError, Input, Select } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { FullPageSpinner } from '@/auth/RequireWorkspace'
import type { GcPhoto } from '@/lib/types'
import { cn } from '@/lib/utils'
import { photoUrl, useAddPhoto, useDeletePhoto, usePhotos, useReorderPhotos, useUpdatePhoto } from './api'
import { kindLabel, PHOTO_KINDS } from './meta'
import { stampPhoto } from './watermark'
import { Chip, StickyActions, errText } from './parts'
import { useCourseCtx } from './CourseShell'

interface Failed { file: File; error: string }

export function CoursePhotosPage() {
  const { course } = useCourseCtx()
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const nav = useNavigate()
  const toast = useToast()
  const photos = usePhotos(course.id)
  const add = useAddPhoto(course.id)
  const reorder = useReorderPhotos(course.id)
  const fileRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [failed, setFailed] = useState<Failed[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const list = photos.data ?? []

  async function upload(files: File[]) {
    if (!files.length) return
    setError(null)
    setFailed([])
    setProgress({ done: 0, total: files.length })
    let sort = list.reduce((m, p) => Math.max(m, p.sort), -1) + 1
    const bad: Failed[] = []
    let ok = 0
    // Lần lượt từng ảnh: điện thoại yếu không bị treo, mất sóng giữa chừng thì ảnh đã xong vẫn còn
    for (const file of files) {
      try {
        const s = await stampPhoto(file)
        // Ảnh đầu tiên của sân mặc định là "Toàn cảnh", các ảnh sau "Ảnh khác" — bấm vào ảnh để đổi nhãn
        const kind = sort === 0 ? 'view' : 'other'
        await add.mutateAsync({ blob: s.blob, sort: sort++, kind, hole: null, takenOn: s.takenOn })
        ok++
      } catch (e) {
        bad.push({ file, error: errText(e, t) })
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p))
    }
    setProgress(null)
    setFailed(bad)
    if (ok) toast(t('courses.photos.uploaded', { n: ok }))
  }

  function move(id: string, dir: -1 | 1 | 'first') {
    const ids = list.map((p) => p.id)
    const i = ids.indexOf(id)
    if (i < 0) return
    ids.splice(i, 1)
    ids.splice(dir === 'first' ? 0 : Math.max(0, Math.min(ids.length, i + dir)), 0, id)
    reorder.mutate(ids, { onError: (e) => setError(errText(e, t)) })
  }

  if (photos.isPending) return <FullPageSpinner />
  const current = list.find((p) => p.id === editing) ?? null

  return (
    <div className="space-y-4">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; upload(f) }}
      />
      <button
        type="button"
        disabled={Boolean(progress)}
        onClick={() => fileRef.current?.click()}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-bronze bg-white text-base font-semibold text-[#9A5A22] disabled:opacity-60"
      >
        <ImagePlus className="h-5 w-5" />
        {progress ? t('courses.photos.progress', progress) : t('courses.photos.pick')}
      </button>
      {progress && (
        <div className="h-2 overflow-hidden rounded-full bg-navy/10" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
          <div className="h-full bg-bronze transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </div>
      )}
      <p className="text-sm text-navy/65">{t('courses.photos.hint')}</p>

      {failed.length > 0 && (
        <div className="space-y-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">{t('courses.photos.failed', { n: failed.length })}</p>
          <ul className="list-disc pl-5">{failed.map((f, i) => <li key={i}>{f.file.name}: {f.error}</li>)}</ul>
          <Button size="sm" variant="outline" onClick={() => upload(failed.map((f) => f.file))}><RotateCw className="h-4 w-4" /> {t('courses.photos.retry')}</Button>
        </div>
      )}
      <FormError message={error ?? (photos.error ? errText(photos.error, t) : null)} />

      {list.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {list.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setEditing(p.id)}
              className={cn('flex flex-col gap-1.5 rounded-xl bg-white p-1.5 text-left', i === 0 ? 'border-2 border-bronze' : 'border border-navy/10')}
            >
              <img src={photoUrl(p.path)} alt={p.caption_vi || kindLabel(p.kind, lang)} loading="lazy" className="aspect-[4/3] w-full rounded-lg bg-navy/5 object-cover" />
              <span className="flex items-center justify-between gap-1 px-0.5">
                <span className="truncate text-xs font-semibold">{photoTag(p, lang)}</span>
                {i === 0 && <span className="shrink-0 rounded bg-bronze px-1.5 py-0.5 text-[10px] font-bold text-white">{t('courses.photos.cover')}</span>}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-navy/20 bg-white p-6 text-center text-navy/60">{t('courses.photos.empty')}</p>
      )}

      <PhotoEditor
        key={current?.id ?? 'none'}
        photo={current}
        index={current ? list.indexOf(current) : -1}
        count={list.length}
        holes={course.holes ?? 18}
        onClose={() => setEditing(null)}
        onMove={(dir) => current && move(current.id, dir)}
      />

      <StickyActions aboveTabs>
        <Button type="button" size="full" disabled={Boolean(progress)} onClick={() => nav(`/admin/courses/${course.id}/review`)}>
          {t('courses.photos.next')}
        </Button>
      </StickyActions>
    </div>
  )
}

function photoTag(p: GcPhoto, lang: string) {
  const k = kindLabel(p.kind, lang)
  return p.hole ? `${k} · ${lang === 'en' ? 'Hole' : 'Hố'} ${p.hole}` : k
}

function PhotoEditor({ photo, index, count, holes, onClose, onMove }: {
  photo: GcPhoto | null; index: number; count: number; holes: number
  onClose: () => void; onMove: (dir: -1 | 1 | 'first') => void
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { course } = useCourseCtx()
  const update = useUpdatePhoto(course.id)
  const del = useDeletePhoto(course.id)
  const [kind, setKind] = useState(photo?.kind ?? 'other')
  const [hole, setHole] = useState(photo?.hole ? String(photo.hole) : '')
  const [capVi, setCapVi] = useState(photo?.caption_vi ?? '')
  const [capEn, setCapEn] = useState(photo?.caption_en ?? '')
  const [confirmDel, setConfirmDel] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!photo) return null

  const needHole = kind === 'hole' || kind === 'flag' || kind === 'signature'
  async function save() {
    setError(null)
    try {
      await update.mutateAsync({ id: photo!.id, kind, hole: needHole && hole ? +hole : null, caption_vi: capVi.trim() || null, caption_en: capEn.trim() || null })
      onClose()
    } catch (e) { setError(errText(e, t)) }
  }
  async function remove() {
    try { await del.mutateAsync(photo!); onClose() } catch (e) { setError(errText(e, t)) }
  }

  return (
    <Dialog open onClose={onClose} title={t('courses.photos.editTitle', { n: index + 1, total: count })}>
      <div className="space-y-4">
        <img src={photoUrl(photo.path)} alt="" className="max-h-[45dvh] w-full rounded-xl bg-navy/5 object-contain" />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={index === 0 ? 'primary' : 'outline'} disabled={index === 0} onClick={() => onMove('first')}>
            <Star className="h-4 w-4" /> {index === 0 ? t('courses.photos.isCover') : t('courses.photos.makeCover')}
          </Button>
          <Button size="sm" variant="outline" disabled={index <= 0} onClick={() => onMove(-1)} aria-label={t('courses.photos.moveLeft')}><ArrowLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" disabled={index >= count - 1} onClick={() => onMove(1)} aria-label={t('courses.photos.moveRight')}><ArrowRight className="h-4 w-4" /></Button>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-navy/80">{t('courses.photos.kind')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {PHOTO_KINDS.map((k) => <Chip key={k} on={kind === k} className="min-h-9 px-3 text-xs" onClick={() => setKind(k)}>{kindLabel(k, lang)}</Chip>)}
          </div>
        </fieldset>
        {needHole && (
          <Field label={t('courses.photos.hole')}>
            <Select value={hole} onChange={(e) => setHole(e.target.value)}>
              <option value="">—</option>
              {Array.from({ length: holes }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
            </Select>
          </Field>
        )}
        <Field label={t('courses.photos.capVi')}><Input value={capVi} onChange={(e) => setCapVi(e.target.value)} maxLength={160} /></Field>
        <Field label={t('courses.photos.capEn')}><Input value={capEn} onChange={(e) => setCapEn(e.target.value)} maxLength={160} /></Field>
        <FormError message={error} />
        <Button size="full" disabled={update.isPending} onClick={save}>{t('common.save')}</Button>

        <div className="border-t border-navy/10 pt-3">
          {confirmDel ? (
            <div className="space-y-2 rounded-xl bg-red-50 p-3">
              <p className="text-sm text-red-800">{t('courses.photos.delConfirm')}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setConfirmDel(false)}>{t('common.cancel')}</Button>
                <Button size="sm" className="bg-none bg-red-700 text-white" disabled={del.isPending} onClick={remove}><Trash2 className="h-4 w-4" /> {t('courses.photos.del')}</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setConfirmDel(true)}><Trash2 className="h-4 w-4" /> {t('courses.photos.del')}</Button>
          )}
        </div>
      </div>
    </Dialog>
  )
}
