import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { UserIdentity } from '@supabase/supabase-js'
import { KeyRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FormError } from '@/components/ui/form'
import { OAUTH_PROVIDERS, canUnlink, oauthScopes, useAuthProviders, type OAuthProvider } from './providers'

/**
 * Cài đặt · Cách đăng nhập (spec 12 mục 7c): liệt kê các cách đang có, liên kết thêm Google / Apple / Facebook /
 * Microsoft (cần bật "manual linking" trong Supabase Auth), gỡ một cách khi còn ít nhất hai cách.
 * Thêm email: thẻ Email ngay bên dưới trang Tài khoản.
 */
export function LoginMethodsCard() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const providers = useAuthProviders()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const ids = useQuery({
    queryKey: ['auth-identities'],
    queryFn: async () => {
      const { data, error: err } = await supabase!.auth.getUserIdentities()
      if (err) throw err
      return data.identities
    },
  })
  const list: UserIdentity[] = ids.data ?? []
  const has = new Set(list.map((i) => i.provider))
  const linkable = OAUTH_PROVIDERS.filter((p) => providers[p] && !has.has(p))

  const link = async (p: OAuthProvider) => {
    setError(null)
    const { error: err } = await supabase!.auth.linkIdentity({
      provider: p,
      options: { redirectTo: `${window.location.origin}/account`, scopes: oauthScopes(p) },
    })
    if (err) setError(/manual linking/i.test(err.message) ? t('loginMethods.linkingDisabled') : t('loginMethods.linkFailed'))
  }

  const unlink = async (identity: UserIdentity) => {
    if (!canUnlink(list) || !window.confirm(t('loginMethods.confirmUnlink', { method: label(identity.provider) }))) return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase!.auth.unlinkIdentity(identity)
    setBusy(false)
    if (err) return setError(t('loginMethods.unlinkFailed'))
    await qc.invalidateQueries({ queryKey: ['auth-identities'] })
  }

  const label = (p: string) => t(`loginMethods.provider.${p}`, { defaultValue: p })
  const detail = (i: UserIdentity) => (i.identity_data?.email as string | undefined) ?? (i.identity_data?.phone as string | undefined) ?? ''

  return (
    <Card className="space-y-3 p-4" id="login-methods">
      <h2 className="flex items-center gap-2 font-bold">
        <KeyRound className="h-5 w-5 text-bronze" /> {t('loginMethods.title')}
      </h2>
      {ids.isPending ? (
        <p className="text-sm text-navy/60">{t('common.loading')}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((i) => (
            <li key={i.identity_id} className="flex items-center justify-between gap-2 rounded-xl bg-navy/5 px-3 py-2">
              <span className="min-w-0">
                <span className="block font-semibold">{label(i.provider)}</span>
                <span className="block truncate text-sm text-navy/60">{detail(i)}</span>
              </span>
              {canUnlink(list) && (
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void unlink(i)}>
                  {t('loginMethods.unlink')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {list.length === 1 && <p className="text-sm text-navy/60">{t('loginMethods.onlyOne')}</p>}
      {linkable.length > 0 && (
        <div className="grid gap-2">
          {linkable.map((p) => (
            <Button key={p} type="button" variant="outline" size="sm" onClick={() => void link(p)}>
              {t('loginMethods.linkWith', { method: label(p) })}
            </Button>
          ))}
        </div>
      )}
      {!has.has('email') && <p className="text-sm text-navy/60">{t('loginMethods.addEmailBelow')}</p>}
      <FormError message={error} />
    </Card>
  )
}
