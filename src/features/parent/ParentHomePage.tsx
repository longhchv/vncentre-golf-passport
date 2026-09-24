import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Mail, QrCode } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Mascot } from '@/components/Mascot'
import { ComingSoon } from '@/components/ComingSoon'

/** Phụ huynh · Trang chủ (bản đầu). Thẻ từng con và "Thêm con" hoàn thiện ở Bước 7–8. */
export function ParentHomePage() {
  const { t } = useTranslation()
  const { profile, session } = useAuth()
  const hasEmail = Boolean(session?.user.email)

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="flex items-center gap-3">
        <Mascot className="h-16 w-16 shrink-0" />
        <div>
          <p className="text-navy/60">{t('parent.hello')}</p>
          <h1 className="text-2xl font-bold">{profile?.full_name}</h1>
        </div>
      </div>

      {!hasEmail && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-gold bg-gold/10 p-4">
          <p className="flex items-center gap-2 text-brown">
            <Mail className="h-5 w-5 shrink-0" /> {t('parent.addEmailPrompt')}
          </p>
          <Button asChild size="sm" variant="outline">
            <Link to="/account">{t('account.addEmail')}</Link>
          </Button>
        </Card>
      )}

      <Card className="space-y-3 p-5 text-center">
        <p className="font-semibold">{t('parent.noChildren')}</p>
        <Button size="full" disabled>
          <QrCode className="h-5 w-5" /> {t('parent.addChild')} · {t('common.comingSoon')}
        </Button>
      </Card>

      <ComingSoon title={t('parent.childProfiles')} />
    </div>
  )
}
