import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Copy, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCode } from '@/lib/codes'
import { usePublicBaseUrl } from '@/lib/settings'
import { Button } from '@/components/ui/button'
import { Badge, Card, TableWrap, td, th } from '@/components/ui/card'
import { FormError, Select, Textarea } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { downloadBlob, passportUrl } from '@/features/passports/exports'

interface ImportRow { line: number; full_name: string; department: string; contact: string; birth_year: string; decision?: string }
interface ImportResult {
  line: number; full_name: string; department: string; slot_code?: string | null; contact: string | null
  role_code?: string; role_name?: string; position?: string | null; new_slot?: boolean; is_child?: boolean
  status: 'ok' | 'error' | 'suspect'; error?: string; taken_by?: string; reason?: string
  action?: 'reuse' | 'new_self' | 'new_self_account' | 'new_child'; already_assigned?: boolean
  student_code?: string | null; passport_code?: string | null
  candidates?: { student_id: string; student_code: string; full_name: string }[]
}
export interface CrewMember {
  assignment_id: string; slot_code: string; role_code: string; role_name: string; badge_label: string | null; badge_color: string | null
  position: string | null; badge_status: string; student_id: string; full_name: string; student_code: string; passport_code: string | null
  contact: string | null; is_child: boolean; tasks: number; done: number; blocked: number
}
export interface CrewDepartment { value: string; role_code: string; label: string; badge_color: string | null }

/** Dán danh sách "Họ tên; Bộ phận; SĐT hoặc email; Năm sinh" (dấu ; hoặc tab). Dòng tiêu đề "Họ tên…" tự bỏ qua. */
export function parseCrewList(text: string): ImportRow[] {
  return text.split(/\r?\n/).map((raw, i) => ({ raw: raw.trim(), line: i + 1 }))
    .filter(({ raw }) => raw && !/^h[oọ]\s*t[eê]n/i.test(raw))
    .map(({ raw, line }) => {
      const [full_name = '', department = '', contact = '', birth_year = ''] = raw.split(/\t|;/).map((s) => s.trim())
      return { line, full_name, department, contact, birth_year }
    })
}

const rpc = async <T,>(fn: string, args: Record<string, unknown>) => {
  const { data, error } = await supabase!.rpc(fn, args)
  if (error) throw error
  return data as T
}

/** 8 bộ phận + HLV theo từng trạm, để chọn khi nhập / thêm việc. */
export function useCrewDepartments() {
  return useQuery({ queryKey: ['crew_departments'], staleTime: 10 * 60_000, queryFn: () => rpc<CrewDepartment[]>('crew_departments', {}) })
}

/**
 * Nhân sự sự kiện (spec 11): dán danh sách theo BỘ PHẬN → xem trước (ghép người có sẵn theo SĐT/email, nghi trùng chờ chọn,
 * sửa bộ phận từng dòng) → nhập: cấp hồ sơ (mã VNC) + sổ "Thẻ nhân sự", tự xếp chỗ (đủ người thì thêm chỗ), sinh việc.
 * Xuất bảng Họ tên – Bộ phận – Mã – Link QR thẻ đeo.
 */
export function CrewAdmin({ eventId, onChanged, showRoster = true }: { eventId: string; onChanged?: () => void; showRoster?: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const baseUrl = usePublicBaseUrl()
  const departments = useCrewDepartments()
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<ImportResult[] | null>(null)
  const [decisions, setDecisions] = useState<Record<number, string>>({})
  const [depts, setDepts] = useState<Record<number, string>>({})
  const rows = useMemo(() => parseCrewList(text), [text])

  const roster = useQuery({ queryKey: ['crew_roster', eventId], queryFn: () => rpc<CrewMember[]>('crew_roster', { p_event_id: eventId }) })
  const run = useMutation({
    mutationFn: (commit: boolean) => rpc<ImportResult[]>('crew_import', {
      p_event_id: eventId, p_commit: commit,
      p_rows: rows.map((r) => ({ ...r, department: depts[r.line] ?? r.department, decision: decisions[r.line] ?? 'auto' })),
    }),
    onSuccess: (res, commit) => {
      setPreview(res)
      if (commit) {
        toast(t('crew.imported', { n: res.filter((r) => r.status === 'ok').length }))
        qc.invalidateQueries({ queryKey: ['crew_roster', eventId] })
        onChanged?.()
      }
    },
  })

  const okCount = (preview?.filter((r) => r.status === 'ok').length ?? 0) + (preview?.filter((r) => r.status === 'suspect' && decisions[r.line]).length ?? 0)
  const members = roster.data ?? []
  const exportRows = members.map((m) => [m.full_name, m.role_name, m.position ?? '', m.student_code, m.passport_code ?? '',
    m.passport_code ? passportUrl(baseUrl, m.passport_code) : ''])
  const header = ['Họ tên', 'Bộ phận', 'Vị trí', 'Mã VNC', 'Mã sổ', 'Link']

  function downloadCsv() {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const lines = [header, ...exportRows].map((r) => r.map(esc).join(','))
    downloadBlob('﻿' + lines.join('\r\n'), 'nhan-su-su-kien.csv', 'text/csv;charset=utf-8')
  }
  async function copyTable() {
    await navigator.clipboard.writeText([header, ...exportRows].map((r) => r.join('\t')).join('\n'))
    toast(t('common.copied'))
  }

  return (
    <Card className="space-y-4 p-4">
      <div>
        <p className="font-semibold">{t('crew.title')}</p>
        <p className="text-sm text-navy/60">{t('crew.hint')}</p>
      </div>

      <Textarea rows={6} value={text} onChange={(e) => { setText(e.target.value); setPreview(null); setDepts({}) }}
        placeholder={'Nguyễn Văn A; HLV Chipping; 0912345678\nBé Trần B; Đại sứ; 0987654321; 2017\nLê Thị C; Check-in; c@example.com'} className="font-mono text-sm" />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!rows.length || run.isPending} onClick={() => run.mutate(false)}>{t('crew.check', { n: rows.length })}</Button>
        <Button disabled={!preview || !okCount || run.isPending} onClick={() => run.mutate(true)}>{t('crew.import', { n: okCount })}</Button>
      </div>
      <FormError message={run.isError ? (run.error as Error).message : null} />

      {preview && (
        <TableWrap>
          <table className="w-full border-collapse text-sm">
            <thead><tr>
              <th className={th}>#</th><th className={th}>{t('crew.name')}</th><th className={th}>{t('crew.department')}</th>
              <th className={th}>{t('crew.contact')}</th><th className={th}>{t('crew.result')}</th>
            </tr></thead>
            <tbody className="divide-y divide-navy/10">
              {preview.map((r) => (
                <tr key={r.line}>
                  <td className={td}>{r.line}</td>
                  <td className={td}>{r.full_name}{r.is_child && <Badge className="ml-1">{t('crew.child')}</Badge>}</td>
                  <td className={td}>
                    <Select value={depts[r.line] ?? ''} className="min-w-40"
                      onChange={(e) => { setDepts((d) => ({ ...d, [r.line]: e.target.value })); setPreview(null) }}>
                      <option value="">{r.department || '—'}</option>
                      {departments.data?.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </Select>
                    {r.status === 'ok' && (
                      <span className="block text-xs text-navy/55">
                        {[r.role_name, r.position, r.slot_code ?? (r.new_slot ? t('crew.newSlot') : null)].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </td>
                  <td className={td}>{r.contact}</td>
                  <td className={td}>
                    {r.status === 'ok' && (
                      <span className="text-emerald-700">
                        {t(`crew.action.${r.action}`)}{r.already_assigned ? ` · ${t('crew.alreadyAssigned')}` : ''}
                        {r.student_code && ` · ${r.student_code}`}{r.passport_code && ` · ${formatCode(r.passport_code)}`}
                      </span>
                    )}
                    {r.status === 'error' && <span className="text-red-700">{t(`crew.error.${r.error}`, { name: r.taken_by })}</span>}
                    {r.status === 'suspect' && (
                      <div className="space-y-1">
                        <p className="text-amber-700">{t(`crew.suspect.${r.reason}`)}</p>
                        <Select value={decisions[r.line] ?? ''} onChange={(e) => { setDecisions((d) => ({ ...d, [r.line]: e.target.value })) }}>
                          <option value="">{t('crew.chooseSkip')}</option>
                          {r.candidates?.map((c) => <option key={c.student_id} value={c.student_id}>{t('crew.useExisting', { name: c.full_name, code: c.student_code })}</option>)}
                          <option value="new">{t('crew.createNew')}</option>
                        </Select>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {preview?.some((r) => r.status === 'suspect') && <p className="text-sm text-navy/60">{t('crew.suspectHint')}</p>}
      {Object.keys(depts).length > 0 && !preview && <p className="text-sm text-navy/60">{t('crew.recheckHint')}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <p className="font-semibold">{t('crew.roster', { n: members.length })}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!members.length} onClick={copyTable}><Copy className="h-4 w-4" /> {t('crew.copy')}</Button>
          <Button size="sm" variant="outline" disabled={!members.length} onClick={downloadCsv}><Download className="h-4 w-4" /> CSV</Button>
        </div>
      </div>
      {showRoster && members.length > 0 && (
        <TableWrap>
          <table className="w-full border-collapse text-sm">
            <thead><tr>
              <th className={th}>{t('crew.department')}</th><th className={th}>{t('crew.name')}</th><th className={th}>{t('crew.vnc')}</th>
              <th className={th}>{t('crew.link')}</th><th className={th}>{t('crew.progress')}</th>
            </tr></thead>
            <tbody className="divide-y divide-navy/10">
              {members.map((m) => (
                <tr key={m.assignment_id}>
                  <td className={td}>
                    <span className="inline-block h-3 w-3 rounded-full align-middle" style={{ background: m.badge_color ?? '#999' }} /> {m.role_name}
                    <span className="block text-xs text-navy/55">{[m.position, m.slot_code].filter(Boolean).join(' · ')}</span>
                  </td>
                  <td className={td}>{m.full_name}{m.is_child && <Badge className="ml-1">{t('crew.child')}</Badge>}{m.contact && <span className="block text-xs text-navy/55">{m.contact}</span>}</td>
                  <td className={td}>{m.student_code}</td>
                  <td className={td}>
                    {m.passport_code && <a className="text-bronze underline" href={passportUrl(baseUrl, m.passport_code)} target="_blank" rel="noreferrer">{passportUrl(baseUrl, m.passport_code)}</a>}
                  </td>
                  <td className={td}>{t('crew.progressValue', { done: m.done, total: m.tasks })}{m.blocked > 0 && <Badge tone="bad" className="ml-1">{t('crew.blockedN', { n: m.blocked })}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  )
}
