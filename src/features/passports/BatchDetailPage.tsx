import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Download, FileText, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCode } from '@/lib/codes'
import { useTable } from '@/lib/db'
import { usePublicBaseUrl, useSetting } from '@/lib/settings'
import { useLocalized } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card, TableWrap, td, th } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, FormError, Input, Select } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import type { ClassRow, PassportTier } from '@/lib/types'
import { PassportDetailDialog, PASSPORT_TONE, type PassportStatus } from './PassportDetailDialog'
import { checkLayout, DEFAULT_DECAL_LAYOUT, downloadAssignmentList, downloadDecalPdf, downloadPassportCsv, type DecalLayout } from './exports'
import { usePassportError } from './AssignPassportDialog'
import type { PassportBatch } from './PassportsPage'

interface PassportRow {
  id: string
  passport_code: string
  status: PassportStatus
  student: { full_name: string; student_code: string } | null
}

/** Chi tiết lô: danh sách mã, xuất CSV / PDF decal, gán hàng loạt theo lớp (F11). */
export function BatchDetailPage() {
  const { batchId = '' } = useParams()
  const { t } = useTranslation()
  const loc = useLocalized()
  const qc = useQueryClient()
  const baseUrl = usePublicBaseUrl()
  const tiers = useTable<PassportTier>('passport_tiers', { order: 'level_from' })
  const [filter, setFilter] = useState<PassportStatus | 'all'>('all')
  const [openPassport, setOpenPassport] = useState<string | null>(null)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)

  const q = useQuery({
    queryKey: ['passports', 'batch', batchId],
    queryFn: async () => {
      const [b, p] = await Promise.all([
        supabase!.from('passport_batches').select('*').eq('id', batchId).single(),
        supabase!
          .from('passports')
          .select('id, passport_code, status, student:students(full_name, student_code)')
          .eq('batch_id', batchId)
          .order('created_at')
          .order('passport_code')
          .limit(5000),
      ])
      if (b.error) throw b.error
      if (p.error) throw p.error
      return { batch: b.data as PassportBatch, passports: p.data as unknown as PassportRow[] }
    },
  })

  const markExported = useMutation({
    mutationFn: async () => {
      await supabase!.from('passport_batches').update({ exported_at: new Date().toISOString() }).eq('id', batchId)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passports'] }),
  })

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const p of q.data?.passports ?? []) c[p.status] = (c[p.status] ?? 0) + 1
    return c
  }, [q.data])

  if (q.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  if (q.isError) return <p className="text-red-700">{t('errors.loadFailed')}</p>
  const { batch, passports } = q.data
  const tier = tiers.data?.find((x) => x.id === batch.tier_id)
  const visible = passports.filter((p) => filter === 'all' || p.status === filter)
  const slug = batch.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^\w]+/g, '-').toLowerCase()
  // Chỉ xuất mã còn dùng được (không in sổ đã huỷ)
  const printable = passports.filter((p) => p.status !== 'void').map((p) => p.passport_code)

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Link to="/admin/passports" className="inline-flex items-center gap-1 text-sm font-semibold text-bronze">
          <ArrowLeft className="h-4 w-4" /> {t('admin.nav.passports')}
        </Link>
        <h1 className="text-2xl font-bold">{batch.name}</h1>
        <p className="text-navy/70">
          {loc(tier, 'name')} · {t(`passports.printMethod.${batch.print_method}`)} · {t('passports.total', { count: batch.quantity })}
        </p>
        <p className="text-sm text-navy/55">{t('passports.qrPointsTo', { url: `${baseUrl}/p/…` })}</p>
      </div>

      <Card className="flex flex-wrap gap-2 p-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            downloadPassportCsv(printable, baseUrl, `ma-so-${slug}.csv`)
            markExported.mutate()
          }}
        >
          <Download className="h-4 w-4" /> {t('passports.exportCsv')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPdfOpen(true)}>
          <FileText className="h-4 w-4" /> {t('passports.exportPdf')}
        </Button>
        <Button size="sm" onClick={() => setBulkOpen(true)} disabled={!counts.unassigned}>
          <Users className="h-4 w-4" /> {t('passports.bulkAssign')}
        </Button>
      </Card>

      <div className="flex flex-wrap gap-2">
        {(['all', 'unassigned', 'assigned', 'active', 'lost', 'void'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ${filter === s ? 'bg-navy text-white' : 'bg-white text-navy/70 ring-1 ring-navy/15'}`}
          >
            {s === 'all' ? t('common.all') : t(`passportStatus.${s}`)} ({s === 'all' ? passports.length : (counts[s] ?? 0)})
          </button>
        ))}
      </div>

      <TableWrap>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>{t('passports.code')}</th>
              <th className={th}>{t('fields.status')}</th>
              <th className={th}>{t('passports.student')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy/10">
            {visible.map((p) => (
              <tr key={p.id} className="cursor-pointer hover:bg-navy/3" onClick={() => setOpenPassport(p.id)}>
                <td className={`${td} font-mono font-semibold`}>{formatCode(p.passport_code)}</td>
                <td className={td}>
                  <Badge tone={PASSPORT_TONE[p.status]}>{t(`passportStatus.${p.status}`)}</Badge>
                </td>
                <td className={td}>{p.student ? `${p.student.full_name} · ${p.student.student_code}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <PassportDetailDialog passportId={openPassport} onClose={() => setOpenPassport(null)} />
      <DecalPdfDialog
        open={pdfOpen}
        onClose={() => setPdfOpen(false)}
        codes={printable}
        baseUrl={baseUrl}
        fileName={`decal-${slug}.pdf`}
        onDone={() => markExported.mutate()}
      />
      <BulkAssignDialog open={bulkOpen} onClose={() => setBulkOpen(false)} batchId={batch.id} fileSlug={slug} />
    </div>
  )
}

function DecalPdfDialog({
  open,
  onClose,
  codes,
  baseUrl,
  fileName,
  onDone,
}: {
  open: boolean
  onClose: () => void
  codes: string[]
  baseUrl: string
  fileName: string
  onDone: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const { value: saved } = useSetting<DecalLayout>('passport_decal.layout', DEFAULT_DECAL_LAYOUT)
  const [layout, setLayout] = useState<DecalLayout | null>(null)
  const [busy, setBusy] = useState(false)
  const l = layout ?? { ...DEFAULT_DECAL_LAYOUT, ...saved }
  const set = (k: keyof DecalLayout, v: string | boolean) =>
    setLayout({ ...l, [k]: typeof v === 'boolean' ? v : Number(v.replace(',', '.')) })
  const layoutError = checkLayout(l)
  const perPage = l.columns * l.rows

  const numberField = (k: keyof DecalLayout, labelKey: string) => (
    <Field label={t(labelKey)}>
      <Input inputMode="decimal" value={String(l[k] ?? '')} onChange={(e) => set(k, e.target.value)} />
    </Field>
  )

  return (
    <Dialog open={open} onClose={onClose} title={t('passports.exportPdf')}>
      <div className="space-y-4">
        <p className="text-navy/70">{t('passports.pdfSummary', { count: codes.length, pages: Math.ceil(codes.length / perPage), perPage })}</p>
        <div className="grid grid-cols-2 gap-3">
          {numberField('columns', 'passports.layout.columns')}
          {numberField('rows', 'passports.layout.rows')}
          {numberField('width_mm', 'passports.layout.width')}
          {numberField('height_mm', 'passports.layout.height')}
          {numberField('margin_left_mm', 'passports.layout.marginLeft')}
          {numberField('margin_top_mm', 'passports.layout.marginTop')}
          {numberField('gap_x_mm', 'passports.layout.gapX')}
          {numberField('gap_y_mm', 'passports.layout.gapY')}
        </div>
        <Checkbox label={t('passports.layout.cutLines')} checked={Boolean(l.cut_lines)} onChange={(e) => set('cut_lines', e.target.checked)} />
        <p className="text-sm text-navy/55">{t('passports.layout.hint')}</p>
        <FormError message={layoutError ? t(`passports.layout.${layoutError}`) : null} />
        <Button
          size="full"
          disabled={busy || Boolean(layoutError) || codes.length === 0}
          onClick={async () => {
            setBusy(true)
            try {
              await downloadDecalPdf(codes, baseUrl, l, fileName)
              onDone()
              onClose()
            } catch (e) {
              toast(String(e), 'error')
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? t('common.loading') : t('passports.downloadPdf')}
        </Button>
      </div>
    </Dialog>
  )
}

interface BulkRow {
  student_id: string
  student_code: string
  full_name: string
  grade_class: string | null
  passport_code: string | null
  result: 'assigned' | 'already_has' | 'batch_empty'
}

function BulkAssignDialog({ open, onClose, batchId, fileSlug }: { open: boolean; onClose: () => void; batchId: string; fileSlug: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const passportError = usePassportError()
  const classes = useTable<ClassRow>('classes', { order: 'name' })
  const [classId, setClassId] = useState('')
  const [result, setResult] = useState<BulkRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useMutation({
    mutationFn: async () => {
      const { data, error: e } = await supabase!.rpc('assign_passports_bulk', { p_class_id: classId, p_batch_id: batchId })
      if (e) throw e
      return data as BulkRow[]
    },
    onSuccess: (rows) => {
      setResult(rows)
      qc.invalidateQueries({ queryKey: ['passports'] })
    },
    onError: (e) => setError(passportError(e)),
  })

  const label = (r: string) => t(`passports.bulkResult.${r}`)
  const assigned = result?.filter((r) => r.result === 'assigned').length ?? 0

  return (
    <Dialog
      open={open}
      onClose={() => {
        setResult(null)
        onClose()
      }}
      title={t('passports.bulkAssign')}
    >
      {!result ? (
        <div className="space-y-4">
          <p className="text-navy/70">{t('passports.bulkHint')}</p>
          <Field label={t('fields.className')}>
            <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">—</option>
              {classes.data
                ?.filter((c) => !c.deleted_at && c.status === 'active')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
          <FormError message={error} />
          <Button size="full" disabled={!classId || run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? t('common.loading') : t('passports.bulkRun')}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="font-semibold">{t('passports.bulkDone', { count: assigned })}</p>
          <Button
            variant="outline"
            onClick={() => downloadAssignmentList(result, label, `doi-chieu-so-${fileSlug}.xlsx`)}
          >
            <Download className="h-4 w-4" /> {t('passports.downloadList')}
          </Button>
          <ul className="divide-y divide-navy/10 rounded-2xl bg-white">
            {result.map((r) => (
              <li key={r.student_id} className="flex items-center justify-between gap-3 px-4 py-2">
                <div className="min-w-0">
                  <p className="font-semibold">{r.full_name}</p>
                  <p className="text-sm text-navy/55">{r.student_code}{r.grade_class ? ` · ${r.grade_class}` : ''}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-semibold">{r.passport_code ? formatCode(r.passport_code) : '—'}</p>
                  <Badge tone={r.result === 'assigned' ? 'good' : r.result === 'batch_empty' ? 'bad' : 'neutral'}>{label(r.result)}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  )
}
