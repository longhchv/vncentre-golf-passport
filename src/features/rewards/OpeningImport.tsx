import { useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Download, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, TableWrap, td, th } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Field, FormError, Input, Select } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { callRpc } from '@/features/partners/shared'
import { parseOpeningRow, type OpeningRow } from './openingParse'

// Spec 19 · D60: admin tải file Excel số dư điểm thưởng (điểm tích luỹ trước khi có ví điểm, gồm cả học sinh ở trường
// không thi đấu). Đối chiếu từng dòng với hồ sơ học viên → admin xem, chọn hồ sơ cho dòng trùng tên → ghi sổ.
// Tải lại file đã sửa: máy chủ chỉ ghi phần chênh (reward_import_opening), không cộng trùng.

const loadXlsx = () => import('xlsx')

const HEADERS = ['Mã học viên', 'Họ và tên học sinh', 'Năm sinh', 'Trường', 'SĐT phụ huynh', 'Điểm thưởng còn lại']
const GUIDE: string[][] = [
  ['Cột', 'Tiêu đề', 'Bắt buộc', 'Ghi chú', 'Column (English)'],
  ['A', 'Mã học viên', 'Không', 'Nếu có mã thì dò theo mã, chính xác nhất', 'Student code (optional, most accurate)'],
  ['B', 'Họ và tên học sinh', 'Có (khi không có mã)', 'Có dấu hoặc không dấu đều được', "Student's full name"],
  ['C', 'Năm sinh', 'Nên có', 'yyyy hoặc dd/mm/yyyy — để phân biệt các bạn trùng tên', 'Birth year or dd/mm/yyyy'],
  ['D', 'Trường', 'Không', 'Giúp phân biệt khi trùng tên', 'School (helps with same names)'],
  ['E', 'SĐT phụ huynh', 'Không', 'Giúp phân biệt khi trùng tên', 'Parent phone (helps with same names)'],
  ['F', 'Điểm thưởng còn lại', 'Có', 'Số nguyên ≥ 0: số điểm con còn lại, chưa đổi quà', 'Points still unspent (whole number ≥ 0)'],
  [],
  ['• Dòng 1 là tiêu đề, dữ liệu bắt đầu từ dòng 2.'],
  ['• Đây là SỐ DƯ, không phải số cộng thêm. Tải lại file đã sửa thì app chỉ chỉnh phần chênh, không cộng hai lần.'],
  ['• Bạn chưa có hồ sơ trên app: nhập danh sách học sinh trước (Nhập dữ liệu), rồi tải lại file này.'],
  ['• This is the BALANCE, not an amount to add. Re-uploading a corrected file only applies the difference.'],
]

async function downloadTemplate() {
  const XLSX = await loadXlsx()
  const ws = XLSX.utils.aoa_to_sheet([HEADERS])
  ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 12 }, { wch: 24 }, { wch: 16 }, { wch: 20 }]
  for (let r = 2; r <= 2001; r++) {
    for (const col of ['A', 'C', 'E']) ws[`${col}${r}`] = { t: 's', v: '', z: '@' }
  }
  ws['!ref'] = 'A1:F2001'
  const guide = XLSX.utils.aoa_to_sheet(GUIDE)
  guide['!cols'] = [{ wch: 6 }, { wch: 22 }, { wch: 18 }, { wch: 56 }, { wch: 40 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'So du diem thuong')
  XLSX.utils.book_append_sheet(wb, guide, 'Huong dan')
  XLSX.writeFile(wb, 'mau-so-du-diem-thuong.xlsx', { compression: true })
}

interface Candidate {
  id: string
  full_name: string
  student_code: string
  birth_year: number | null
  school: string | null
  opening: number | null
  available: number
}
interface MatchResult {
  row: number
  status: 'matched' | 'ambiguous' | 'not_found'
  candidates: Candidate[]
}
interface Line extends OpeningRow {
  match?: MatchResult
  pick: string // id học viên đã chọn; '' = bỏ qua
}

type LineState = 'ok' | 'pick' | 'not_found' | 'error' | 'duplicate' | 'skipped'

export function OpeningImportPanel() {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [lines, setLines] = useState<Line[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [note, setNote] = useState(() => t('rewards.import.defaultNote'))
  const [filter, setFilter] = useState<'all' | 'attention'>('all')
  const [confirm, setConfirm] = useState(false)
  const [result, setResult] = useState<{ inserted: number; adjusted: number; unchanged: number } | null>(null)

  async function onFile(file: File) {
    setLoadError('')
    setResult(null)
    setLines(null)
    setFileName(file.name)
    setBusy(true)
    try {
      const XLSX = await loadXlsx()
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: false })
      const parsed: Line[] = []
      aoa.slice(1).forEach((cells, i) => {
        if (!cells || cells.every((c) => c === null || String(c).trim() === '')) return
        parsed.push({ ...parseOpeningRow(cells, i + 2), pick: '' })
      })
      if (parsed.length === 0) throw new Error('empty')
      if (parsed.length > 3000) throw new Error('too_many')
      const toMatch = parsed.filter((l) => !l.error)
      const matches: MatchResult[] = []
      for (let i = 0; i < toMatch.length; i += 500) {
        const chunk = toMatch.slice(i, i + 500).map((l) => ({ row: l.row, code: l.code, name: l.name, year: l.year, phone: l.phone, school: l.school }))
        matches.push(...(await callRpc<MatchResult[]>('reward_import_match', { p_rows: chunk })))
      }
      const byRow = new Map(matches.map((m) => [m.row, m]))
      setLines(
        parsed.map((l) => {
          const m = byRow.get(l.row)
          return { ...l, match: m, pick: m?.status === 'matched' ? m.candidates[0].id : '' }
        }),
      )
    } catch (e) {
      const msg = (e as Error).message
      setLoadError(msg === 'empty' ? t('rewards.import.empty') : msg === 'too_many' ? t('rewards.import.tooMany') : t('rewards.import.readFailed'))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const picked = useMemo(() => {
    const count = new Map<string, number>()
    for (const l of lines ?? []) if (l.pick) count.set(l.pick, (count.get(l.pick) ?? 0) + 1)
    return count
  }, [lines])

  const stateOf = (l: Line): LineState => {
    if (l.error) return 'error'
    if (!l.match || l.match.status === 'not_found') return 'not_found'
    if (!l.pick) return l.match.status === 'ambiguous' ? 'pick' : 'skipped'
    if ((picked.get(l.pick) ?? 0) > 1) return 'duplicate'
    return 'ok'
  }

  const stats = useMemo(() => {
    const s: Record<LineState, number> = { ok: 0, pick: 0, not_found: 0, error: 0, duplicate: 0, skipped: 0 }
    for (const l of lines ?? []) s[stateOf(l)]++
    return s
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, picked])

  const ready = (lines ?? []).filter((l) => stateOf(l) === 'ok')
  const changing = ready.filter((l) => {
    const c = l.match!.candidates.find((x) => x.id === l.pick)
    return (c?.opening ?? 0) !== l.points
  })

  const save = useMutation({
    mutationFn: () =>
      callRpc<{ inserted: number; adjusted: number; unchanged: number }>('reward_import_opening', {
        p_items: ready.map((l) => ({ student_id: l.pick, points: l.points })),
        p_note: note,
      }),
    onSuccess: (r) => {
      setResult(r)
      setConfirm(false)
      setLines(null)
      toast(t('rewards.import.done', { count: r.inserted + r.adjusted }))
      qc.invalidateQueries({ queryKey: ['reward_admin_ledger'] })
      qc.invalidateQueries({ queryKey: ['reward_balance'] })
    },
  })

  async function downloadReport() {
    const XLSX = await loadXlsx()
    const bad = (lines ?? []).filter((l) => stateOf(l) !== 'ok')
    const aoa = [
      ['Dòng trong file', ...HEADERS, 'Tình trạng', 'Hồ sơ gần đúng'],
      ...bad.map((l) => [
        l.row,
        ...l.cells.slice(0, 6).map((c) => (c == null ? '' : String(c))),
        t(`rewards.import.state.${stateOf(l)}`) + (l.error ? ` — ${t(`rewards.import.rowError.${l.error}`)}` : ''),
        (l.match?.candidates ?? []).map((c) => `${c.full_name} · ${c.student_code}${c.birth_year ? ' · ' + c.birth_year : ''}`).join(' | '),
      ]),
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 28 }, { wch: 12 }, { wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 40 }, { wch: 60 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Can xu ly')
    XLSX.writeFile(wb, `can-xu-ly-${fileName.replace(/\.[^.]+$/, '') || 'so-du'}.xlsx`, { compression: true })
  }

  const setPick = (row: number, id: string) => setLines((ls) => ls && ls.map((l) => (l.row === row ? { ...l, pick: id } : l)))
  const shown = (lines ?? []).filter((l) => filter === 'all' || stateOf(l) !== 'ok')
  const stateClass: Record<LineState, string> = {
    ok: 'text-green-700',
    pick: 'text-amber-700',
    not_found: 'text-red-700',
    error: 'text-red-700',
    duplicate: 'text-red-700',
    skipped: 'text-navy/60',
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <h2 className="text-lg font-bold">{t('rewards.import.title')}</h2>
        <p className="text-sm text-navy/70">{t('rewards.import.intro')}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-navy/70">
          <li>{t('rewards.import.ruleBalance')}</li>
          <li>{t('rewards.import.ruleReupload')}</li>
          <li>{t('rewards.import.ruleMissing')}</li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void downloadTemplate()}>
            <Download className="h-4 w-4" /> {t('rewards.import.template')}
          </Button>
          <Button disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> {busy ? t('rewards.import.reading') : t('rewards.import.upload')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onFile(f)
            }}
          />
        </div>
        {loadError && <FormError message={loadError} />}
        {result && (
          <p className="rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">
            {t('rewards.import.result', result)}
          </p>
        )}
      </Card>

      {lines && (
        <>
          <Card className="space-y-3 p-4">
            <p className="text-sm font-semibold">
              {fileName} · {t('rewards.import.rows', { count: lines.length })}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {(Object.keys(stats) as LineState[]).filter((k) => stats[k] > 0).map((k) => (
                <span key={k} className={stateClass[k]}>
                  {t(`rewards.import.state.${k}`)}: <b>{stats[k]}</b>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select className="w-auto" value={filter} onChange={(e) => setFilter(e.target.value as 'all' | 'attention')}>
                <option value="all">{t('rewards.import.showAll')}</option>
                <option value="attention">{t('rewards.import.showAttention')}</option>
              </Select>
              {ready.length < lines.length && (
                <Button size="sm" variant="outline" onClick={() => void downloadReport()}>
                  <Download className="h-4 w-4" /> {t('rewards.import.report')}
                </Button>
              )}
            </div>
          </Card>

          <TableWrap>
            <table className="w-full min-w-[820px]">
              <thead>
                <tr>
                  <th className={th}>{t('rewards.import.col.row')}</th>
                  <th className={th}>{t('rewards.import.col.inFile')}</th>
                  <th className={th}>{t('rewards.import.col.student')}</th>
                  <th className={`${th} text-right`}>{t('rewards.import.col.before')}</th>
                  <th className={`${th} text-right`}>{t('rewards.import.col.points')}</th>
                  <th className={th}>{t('rewards.import.col.state')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => {
                  const st = stateOf(l)
                  const cands = l.match?.candidates ?? []
                  const cur = cands.find((c) => c.id === l.pick)
                  return (
                    <tr key={l.row}>
                      <td className={td}>{l.row}</td>
                      <td className={td}>
                        <span className="font-medium">{l.name || l.code || '—'}</span>
                        <span className="block text-xs text-navy/60">
                          {[l.code && l.name ? l.code : null, l.year, l.school, l.phone].filter(Boolean).join(' · ')}
                        </span>
                      </td>
                      <td className={td}>
                        {cands.length > 1 || (cands.length === 1 && l.match?.status === 'matched') ? (
                          <Select className="min-h-10 text-sm" value={l.pick} onChange={(e) => setPick(l.row, e.target.value)}>
                            <option value="">{cands.length > 1 ? t('rewards.import.choose') : t('rewards.import.skip')}</option>
                            {cands.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.full_name} · {c.student_code}
                                {c.birth_year ? ` · ${c.birth_year}` : ''}
                                {c.school ? ` · ${c.school}` : ''}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <span className="text-sm text-navy/60">—</span>
                        )}
                      </td>
                      <td className={`${td} text-right tabular-nums`}>{cur ? (cur.opening ?? '—') : ''}</td>
                      <td className={`${td} text-right font-semibold tabular-nums`}>{l.error === 'points' ? '?' : l.points}</td>
                      <td className={`${td} text-sm ${stateClass[st]}`}>
                        {t(`rewards.import.state.${st}`)}
                        {l.error ? <span className="block text-xs">{t(`rewards.import.rowError.${l.error}`)}</span> : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableWrap>

          <Card className="space-y-3 p-4">
            <Field label={t('rewards.import.note')} hint={t('rewards.import.noteHint')}>
              <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <Button disabled={ready.length === 0 || stats.duplicate > 0} onClick={() => setConfirm(true)}>
              {t('rewards.import.save', { count: ready.length })}
            </Button>
            {stats.duplicate > 0 && <FormError message={t('rewards.import.duplicateHint')} />}
          </Card>
        </>
      )}

      <Dialog open={confirm} onClose={() => setConfirm(false)} title={t('rewards.import.confirmTitle')}>
        <div className="space-y-3">
          <p>{t('rewards.import.confirmBody', { count: ready.length, changing: changing.length })}</p>
          <p className="text-sm text-navy/70">{t('rewards.import.confirmNote')}</p>
          {save.isError && <FormError message={t('errors.generic')} />}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? t('rewards.record.saving') : t('rewards.import.confirmYes')}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
