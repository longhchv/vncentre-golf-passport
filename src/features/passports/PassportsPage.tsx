import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { checkCode } from '@/lib/codes'
import { errorMessage, useTable } from '@/lib/db'
import { formatDateTime, useLocalized } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Field, FormError, Input, Select } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import type { PassportTier } from '@/lib/types'
import { PassportDetailDialog } from './PassportDetailDialog'

export interface PassportBatch {
  id: string
  name: string
  tier_id: string
  quantity: number
  print_method: 'variable_print' | 'decal'
  exported_at: string | null
  created_at: string
}

interface BatchStats {
  batch_id: string
  unassigned: number
  assigned: number
  active: number
  inactive: number
}

/** Admin · Sổ Passport: danh sách lô mã, tạo lô, tìm sổ theo mã (F11). */
export function PassportsPage() {
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  const toast = useToast()
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [openPassport, setOpenPassport] = useState<string | null>(null)
  const tiers = useTable<PassportTier>('passport_tiers', { order: 'level_from' })
  const tierById = new Map((tiers.data ?? []).map((x) => [x.id, x]))

  const batches = useQuery({
    queryKey: ['passports', 'batches'],
    queryFn: async () => {
      const [b, s] = await Promise.all([
        supabase!.from('passport_batches').select('*').order('created_at', { ascending: false }),
        supabase!.from('passport_batch_stats').select('*'),
      ])
      if (b.error) throw b.error
      const stats = new Map(((s.data ?? []) as BatchStats[]).map((x) => [x.batch_id, x]))
      return (b.data as PassportBatch[]).map((x) => ({ ...x, stats: stats.get(x.id) }))
    },
  })

  async function findCode() {
    const check = checkCode(search, 'passport')
    if (!check.ok) return toast(check.reason === 'invalid_chars' ? t('codes.invalidChars') : t('codes.wrongLength'), 'error')
    const { data } = await supabase!.from('passports').select('id').eq('passport_code', check.code).maybeSingle()
    if (!data) return toast(t('passports.errors.passport_not_found'), 'error')
    setOpenPassport(data.id)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('admin.nav.passports')}</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> {t('passports.createBatch')}
        </Button>
      </div>

      <form
        className="flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          findCode()
        }}
      >
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('passports.findByCode')} className="font-mono" />
        <Button type="submit" aria-label={t('common.search')}>
          <Search className="h-5 w-5" />
        </Button>
      </form>

      {batches.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : batches.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : batches.data.length === 0 ? (
        <Card className="p-6 text-center text-navy/60">{t('passports.noBatches')}</Card>
      ) : (
        <ul className="space-y-3">
          {batches.data.map((b) => (
            <li key={b.id}>
              <Link to={`/admin/passports/${b.id}`}>
                <Card className="flex items-center justify-between gap-3 p-4 hover:border-bronze">
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold">{b.name}</p>
                    <p className="text-sm text-navy/60">
                      {loc(tierById.get(b.tier_id), 'name')} · {t(`passports.printMethod.${b.print_method}`)} ·{' '}
                      {formatDateTime(b.created_at, i18n.language)}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <Badge>{t('passports.total', { count: b.quantity })}</Badge>
                      <Badge tone="neutral">{t('passportStatus.unassigned')}: {b.stats?.unassigned ?? 0}</Badge>
                      <Badge tone="warn">{t('passportStatus.assigned')}: {b.stats?.assigned ?? 0}</Badge>
                      <Badge tone="good">{t('passportStatus.active')}: {b.stats?.active ?? 0}</Badge>
                      {b.exported_at ? <Badge tone="good">{t('passports.exported')}</Badge> : <Badge tone="warn">{t('passports.notExported')}</Badge>}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-bronze" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CreateBatchDialog open={createOpen} onClose={() => setCreateOpen(false)} tiers={tiers.data ?? []} />
      <PassportDetailDialog passportId={openPassport} onClose={() => setOpenPassport(null)} />
    </div>
  )
}

function CreateBatchDialog({ open, onClose, tiers }: { open: boolean; onClose: () => void; tiers: PassportTier[] }) {
  const { t } = useTranslation()
  const loc = useLocalized()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [tierId, setTierId] = useState('')
  const [quantity, setQuantity] = useState('30')
  const [method, setMethod] = useState<'decal' | 'variable_print'>('decal')
  const [error, setError] = useState<string | null>(null)
  const tier = tierId || tiers.find((x) => x.code === 'first')?.id || ''

  const create = useMutation({
    mutationFn: async () => {
      const qty = Number(quantity)
      if (!Number.isInteger(qty) || qty < 1 || qty > 5000) throw new Error(t('passports.quantityRange'))
      const { data, error: e } = await supabase!.rpc('create_passport_batch', {
        p_name: name,
        p_tier_id: tier,
        p_quantity: qty,
        p_print_method: method,
      })
      if (e) throw e
      return data as string
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['passports'] })
      onClose()
      navigate(`/admin/passports/${id}`)
    },
    onError: (e) => setError(e instanceof Error && !('code' in e) ? e.message : errorMessage(e, t)),
  })

  return (
    <Dialog open={open} onClose={onClose} title={t('passports.createBatch')}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate()
        }}
      >
        <Field label={t('passports.batchName') + ' *'} hint={t('passports.batchNameHint')}>
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('fields.tier') + ' *'}>
          <Select value={tier} onChange={(e) => setTierId(e.target.value)}>
            {tiers.map((x) => (
              <option key={x.id} value={x.id}>
                {loc(x, 'name')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('passports.quantity') + ' *'}>
          <Input inputMode="numeric" required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
        <Field label={t('passports.printMethodLabel')}>
          <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            <option value="decal">{t('passports.printMethod.decal')}</option>
            <option value="variable_print">{t('passports.printMethod.variable_print')}</option>
          </Select>
        </Field>
        <FormError message={error} />
        <Button type="submit" size="full" disabled={create.isPending || !name.trim()}>
          {create.isPending ? t('common.loading') : t('passports.generate')}
        </Button>
      </form>
    </Dialog>
  )
}
