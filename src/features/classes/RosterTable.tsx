import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Badge, TableWrap, td, th } from '@/components/ui/card'
import { formatDate } from '@/lib/i18nField'
import type { RosterRow } from '@/lib/types'

/**
 * Danh sách học viên của lớp (02 mục 3.4): tên, ngày sinh, level, trạng thái kích hoạt của phụ huynh.
 * Dữ liệu lấy từ hàm class_roster — không có liên hệ phụ huynh (R8).
 */
export function RosterTable({
  rows,
  actions,
  rowHref,
}: {
  rows: RosterRow[]
  actions?: (row: RosterRow) => ReactNode
  /** Đường dẫn hồ sơ khi bấm tên học viên */
  rowHref?: (row: RosterRow) => string
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  return (
    <TableWrap>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>{t('fields.studentName')}</th>
            <th className={th}>{t('fields.dateOfBirth')}</th>
            <th className={th}>{t('fields.level')}</th>
            <th className={th}>{t('fields.parentActivation')}</th>
            {actions && <th className={th} />}
          </tr>
        </thead>
        <tbody className="divide-y divide-navy/10">
          {rows.map((r) => (
            <tr key={r.student_id} className={r.enrollment_status !== 'active' ? 'opacity-50' : undefined}>
              <td className={td}>
                {rowHref ? (
                  <Link to={rowHref(r)} className="font-semibold text-navy underline-offset-4 hover:underline">
                    {r.full_name}
                  </Link>
                ) : (
                  <div className="font-semibold">{r.full_name}</div>
                )}
                <div className="text-sm text-navy/55">
                  {r.student_code}
                  {r.current_grade_class ? ` · ${r.current_grade_class}` : ''}
                  {r.enrollment_status !== 'active' ? ` · ${t(`enrollmentStatus.${r.enrollment_status}`)}` : ''}
                </div>
              </td>
              <td className={`${td} whitespace-nowrap`}>{r.date_of_birth ? formatDate(r.date_of_birth, lang) : '—'}</td>
              <td className={`${td} whitespace-nowrap`}>{r.level_number ? `Level ${r.level_number}` : '—'}</td>
              <td className={td}>
                {r.guardian_activated ? (
                  <Badge tone="good">{t('roster.activated')}</Badge>
                ) : (
                  <Badge>{t('roster.notActivated')}</Badge>
                )}
                {r.verification_status === 'pending_review' && (
                  <Badge tone="warn" className="ml-1">
                    {t('verification.pending_review')}
                  </Badge>
                )}
              </td>
              {actions && <td className={`${td} whitespace-nowrap text-right`}>{actions(r)}</td>}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className={`${td} text-navy/50`} colSpan={actions ? 5 : 4}>
                {t('roster.empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </TableWrap>
  )
}
