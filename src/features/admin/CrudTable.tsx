import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { TableWrap, td, th } from '@/components/ui/card'
import { useSaveRow, useTable } from '@/lib/db'
import { EntityForm, type FieldSpec } from '@/features/admin/EntityForm'

export interface Column<T> {
  key: string
  labelKey: string
  render?: (row: T) => ReactNode
}

/** Bảng danh sách + hộp thoại tạo/sửa cho một bảng cấu hình. */
export function CrudTable<T extends { id: string }>({
  table,
  titleKey,
  columns,
  fields,
  order,
  canCreate = true,
  newDefaults = {},
  filter,
  extraActions,
  invalidate,
}: {
  table: string
  titleKey: string
  columns: Column<T>[]
  fields: FieldSpec[]
  order?: string
  canCreate?: boolean
  newDefaults?: Record<string, unknown>
  filter?: (row: T) => boolean
  extraActions?: (row: T) => ReactNode
  invalidate?: string[]
}) {
  const { t } = useTranslation()
  const query = useTable<T>(table, { order })
  const save = useSaveRow(table, invalidate)
  const [editing, setEditing] = useState<T | 'new' | null>(null)

  const rows = (query.data ?? []).filter((r) => (filter ? filter(r) : true))

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{t(titleKey)}</h2>
        {canCreate && (
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> {t('common.add')}
          </Button>
        )}
      </div>

      {query.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : query.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : (
        <TableWrap>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={th}>
                    {t(c.labelKey)}
                  </th>
                ))}
                <th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/10">
              {rows.map((row) => (
                <tr key={row.id}>
                  {columns.map((c) => (
                    <td key={c.key} className={td}>
                      {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '')}
                    </td>
                  ))}
                  <td className={`${td} whitespace-nowrap text-right`}>
                    {extraActions?.(row)}
                    <Button size="sm" variant="ghost" onClick={() => setEditing(row)} aria-label={t('common.edit')}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className={`${td} text-navy/50`} colSpan={columns.length + 1}>
                    {t('common.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableWrap>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t('common.add') : t('common.edit')}
      >
        {editing !== null && (
          <EntityForm
            fields={fields}
            initial={editing === 'new' ? newDefaults : (editing as Record<string, unknown>)}
            isEdit={editing !== 'new'}
            busy={save.isPending}
            onSubmit={(values) =>
              save.mutate(editing === 'new' ? { ...newDefaults, ...values } : { ...values, id: (editing as T).id }, {
                onSuccess: () => setEditing(null),
              })
            }
          />
        )}
      </Dialog>
    </section>
  )
}
