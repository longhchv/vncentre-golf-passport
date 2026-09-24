import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BadgeCheck, CircleX, SearchX } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/form'
import { Mascot } from '@/components/Mascot'

interface VerifyResult {
  result: 'valid' | 'revoked' | 'not_found'
  verify_code?: string
  student_name?: string
  type?: string
  program?: string
  level_label?: string | null
  title_vi?: string
  title_en?: string
  issued_at?: string
  revoked_at?: string | null
  issuer?: { vi: string; en: string }
}

/**
 * Trang xác thực chứng nhận công khai (F9): /verify (nhập mã) và /verify/{mã} (kết quả).
 * Chỉ hiện tên học viên, loại, chương trình/level, ngày cấp, đơn vị cấp — không ngày sinh, trường, phụ huynh.
 */
export function VerifyPage() {
  const { verifyCode } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const en = i18n.language === 'en'

  const q = useQuery({
    queryKey: ['certificate_verify', verifyCode],
    enabled: Boolean(verifyCode && supabase),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('certificate_verify', { p_code: verifyCode })
      if (error) throw error
      return data as VerifyResult
    },
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const c = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
    if (c) navigate(`/verify/${c}`)
  }

  const r = q.data
  return (
    <div className="mx-auto max-w-md space-y-5">
      <h1 className="text-2xl font-bold">{t('verify.title')}</h1>

      {verifyCode && (q.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : q.isError ? (
        <p className="text-red-700">{t('errors.generic')}</p>
      ) : r?.result === 'not_found' ? (
        <Card className="flex flex-col items-center gap-3 p-6 text-center">
          <SearchX className="h-12 w-12 text-navy/40" />
          <p className="text-lg font-bold">{t('verify.notFound')}</p>
          <p className="text-navy/65">{t('verify.notFoundHint')}</p>
        </Card>
      ) : r ? (
        <Card className={`space-y-4 p-5 ${r.result === 'valid' ? 'border-emerald-600' : 'border-red-600'} border-2`}>
          <div className="flex items-center gap-3">
            {r.result === 'valid' ? <BadgeCheck className="h-12 w-12 shrink-0 text-emerald-600" /> : <CircleX className="h-12 w-12 shrink-0 text-red-600" />}
            <div>
              <p className={`text-xl font-bold ${r.result === 'valid' ? 'text-emerald-700' : 'text-red-700'}`}>
                {r.result === 'valid' ? t('verify.valid') : t('verify.revoked')}
              </p>
              {r.result === 'revoked' && r.revoked_at && <p className="text-sm text-red-700">{t('verify.revokedOn', { date: formatDate(r.revoked_at, i18n.language) })}</p>}
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-navy/60">{t('verify.student')}</dt>
            <dd className="font-semibold">{r.student_name}</dd>
            <dt className="text-navy/60">{t('verify.type')}</dt>
            <dd>{t(`certificates.type.${r.type}`, { defaultValue: r.type })}</dd>
            <dt className="text-navy/60">{t('verify.program')}</dt>
            <dd>{[r.program, r.level_label].filter(Boolean).join(' - ')}</dd>
            <dt className="text-navy/60">{t('verify.issuedAt')}</dt>
            <dd>{r.issued_at ? formatDate(r.issued_at, i18n.language) : '—'}</dd>
            <dt className="text-navy/60">{t('verify.issuer')}</dt>
            <dd>{en ? r.issuer?.en : r.issuer?.vi}</dd>
            <dt className="text-navy/60">{t('verify.code')}</dt>
            <dd className="font-mono">{r.verify_code}</dd>
          </dl>
        </Card>
      ) : null)}

      {!verifyCode && (
        <div className="flex items-center gap-3">
          <Mascot className="h-16 w-16 shrink-0" />
          <p className="text-navy/70">{t('verify.intro')}</p>
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label={t('verify.enterCode')} hint={t('verify.codeHint')}>
          <Input value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" autoComplete="off"
            className="font-mono text-lg tracking-widest uppercase" placeholder="ABCDE-FGHJK" />
        </Field>
        <Button type="submit" size="full" disabled={!code.trim()}>{t('verify.check')}</Button>
      </form>
    </div>
  )
}
