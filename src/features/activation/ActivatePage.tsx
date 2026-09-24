import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Field, FormError, Input } from '@/components/ui/form'
import { Mascot } from '@/components/Mascot'
import { checkCode } from '@/lib/codes'

/** /activate — nhập mã sổ bằng tay (mã trên chứng nhận giấy: Bước 10). */
export function ActivatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const c = checkCode(code, 'passport')
    if (!c.ok) return setError(c.reason === 'invalid_chars' ? t('codes.invalidChars') : t('codes.wrongLength'))
    navigate(`/p/${c.code}`)
  }

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-md flex-col items-center gap-4">
      <Mascot className="h-24 w-24" />
      <h1 className="text-2xl font-bold">{t('pages.activate')}</h1>
      <p className="text-center text-navy/75">{t('activation.manualHint')}</p>
      <Field label={t('passports.code')} hint={t('codes.hint')} className="w-full">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXX-XXXX"
          autoCapitalize="characters"
          autoComplete="off"
          className="text-center font-mono text-2xl tracking-widest"
        />
      </Field>
      <FormError message={error} />
      <Button type="submit" size="full" disabled={!code.trim()}>
        {t('activation.next')}
      </Button>
    </form>
  )
}
