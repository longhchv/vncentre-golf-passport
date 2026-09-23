import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Card, Badge } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/i18nField'
import type { AuditLog } from '@/lib/types'

const PAGE_SIZE = 50
const ENTITY_TYPES = [
  'schools', 'academic_years', 'programs', 'levels', 'passport_stages', 'passport_tiers', 'class_types',
  'app_settings', 'products', 'certificate_templates', 'profiles', 'user_roles', 'guardians',
  'student_guardians', 'student_accounts', 'students', 'student_merges', 'level_records', 'course_history',
  'classes', 'class_staff', 'enrollments', 'passport_batches', 'passports', 'certificates', 'orders',
  'invoice_requests', 'consents', 'link_requests', 'support_requests',
]

/** Các trường khác nhau giữa bản trước và bản sau (bỏ updated_at). */
function changedFields(log: AuditLog): { key: string; before: unknown; after: unknown }[] {
  const before = log.before ?? {}
  const after = log.after ?? {}
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  keys.delete('updated_at')
  const out: { key: string; before: unknown; after: unknown }[] = []
  for (const k of keys) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) out.push({ key: k, before: before[k], after: after[k] })
  }
  return out
}

const show = (v: unknown) => (v === null || v === undefined ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v))

/** Nhật ký hệ thống: lọc theo người, loại thao tác, đối tượng, thời gian (F16). Chỉ đọc. */
export function AuditLogPage() {
  const { t, i18n } = useTranslation()
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState('')
  const [actor, setActor] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)

  const query = useQuery({
    queryKey: ['audit_logs', entity, action, actor, from, to, limit],
    queryFn: async () => {
      let q = supabase!
        .from('audit_logs')
        .select('*, actor:profiles!audit_logs_actor_user_id_fkey(full_name, email)')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (entity) q = q.eq('entity_type', entity)
      if (action) q = q.eq('action', action)
      if (from) q = q.gte('created_at', new Date(`${from}T00:00:00+07:00`).toISOString())
      if (to) q = q.lte('created_at', new Date(`${to}T23:59:59+07:00`).toISOString())
      const { data, error } = await q
      if (error) throw error
      const rows = data as AuditLog[]
      const a = actor.trim().toLowerCase()
      return a
        ? rows.filter((r) => `${r.actor?.full_name ?? ''} ${r.actor?.email ?? ''}`.toLowerCase().includes(a))
        : rows
    },
  })

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('admin.nav.audit')}</h1>
      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label={t('audit.entity')}>
          <Select value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {ENTITY_TYPES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('audit.action')}>
          <Select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {['insert', 'update', 'delete'].map((a) => (
              <option key={a} value={a}>
                {t(`audit.actions.${a}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('audit.actor')}>
          <Input value={actor} onChange={(e) => setActor(e.target.value)} placeholder={t('audit.actorPlaceholder')} />
        </Field>
        <Field label={t('audit.from')}>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label={t('audit.to')}>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </Card>

      {query.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : query.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : query.data.length === 0 ? (
        <p className="text-navy/60">{t('common.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {query.data.map((log) => {
            const changes = log.action === 'update' ? changedFields(log) : []
            return (
              <li key={log.id}>
                <Card className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={log.action === 'delete' ? 'bad' : log.action === 'insert' ? 'good' : 'warn'}>
                      {t(`audit.actions.${log.action}`, { defaultValue: log.action })}
                    </Badge>
                    <code className="text-sm">{log.entity_type}</code>
                    <span className="text-sm text-navy/60">{formatDateTime(log.created_at, i18n.language)}</span>
                  </div>
                  <p className="text-sm text-navy/75">
                    {log.actor?.full_name || log.actor?.email || t('audit.system')}
                    {log.reason ? ` · ${t('audit.reason')}: ${log.reason}` : ''}
                  </p>
                  {changes.length > 0 && (
                    <ul className="space-y-1 text-sm">
                      {changes.map((c) => (
                        <li key={c.key} className="break-words">
                          <code className="font-semibold">{c.key}</code>: <span className="text-red-700 line-through">{show(c.before)}</span>{' '}
                          → <span className="text-emerald-800">{show(c.after)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {log.action !== 'update' && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-navy/60">{t('audit.details')}</summary>
                      <pre className="mt-2 overflow-x-auto rounded-lg bg-navy/5 p-2 text-xs">
                        {JSON.stringify(log.after ?? log.before, null, 2)}
                      </pre>
                    </details>
                  )}
                </Card>
              </li>
            )
          })}
        </ul>
      )}
      {query.data && query.data.length >= limit && (
        <Button variant="outline" size="full" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
          {t('common.loadMore')}
        </Button>
      )}
    </div>
  )
}
