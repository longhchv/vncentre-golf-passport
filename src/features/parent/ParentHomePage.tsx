import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Mail, QrCode } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Mascot } from '@/components/Mascot'
import { useTable } from '@/lib/db'
import { useLocalized } from '@/lib/i18nField'
import type { PassportStage } from '@/lib/types'

export interface ChildCardData {
  student_id: string
  full_name: string
  student_code: string | null
  avatar_url: string | null
  link_status: 'active' | 'pending_confirmation'
  relationship: string | null
  can_manage: boolean
  level_number: number | null
  level_name_vi: string | null
  level_name_en: string | null
  group_name_vi: string | null
  group_name_en: string | null
  stage_number: number | null
  stage_name_vi: string | null
  stage_name_en: string | null
  stage_color: string | null
  tier_name_vi: string | null
  tier_name_en: string | null
  school_name: string | null
  grade_class: string | null
}

export function useMyChildren() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['my_children', session?.user.id],
    enabled: Boolean(session),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('my_children')
      if (error) throw error
      return data as ChildCardData[]
    },
  })
}

/** Thanh 5 giai đoạn Passport, tô màu tới giai đoạn hiện tại (F8). */
export function StageBar({ current }: { current: number | null }) {
  const stages = useTable<PassportStage>('passport_stages', { order: 'number' })
  const loc = useLocalized()
  return (
    <div className="flex gap-1" aria-hidden>
      {stages.data?.map((s) => (
        <span
          key={s.id}
          title={loc(s, 'name')}
          className="h-2 flex-1 rounded-full"
          style={{ background: current && s.number <= current ? s.color : '#08063420' }}
        />
      ))}
    </div>
  )
}

/** Phụ huynh · Trang chủ: thẻ từng con (ảnh, tên, level, giai đoạn, cấp hộ chiếu), nút Thêm con (02 mục 3.2). */
export function ParentHomePage() {
  const { t } = useTranslation()
  const loc = useLocalized()
  const { profile, session } = useAuth()
  const children = useMyChildren()
  const hasEmail = Boolean(session?.user.email)

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="flex items-center gap-3">
        <Mascot className="h-14 w-14 shrink-0" />
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

      {children.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : children.data?.length === 0 ? (
        <Card className="space-y-2 p-5 text-center">
          <p className="font-semibold">{t('parent.noChildren')}</p>
          <p className="text-sm text-navy/65">{t('parent.noChildrenHint')}</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {children.data?.map((c) => (
            <li key={c.student_id}>
              <Card className="space-y-3 p-4">
                <div className="flex items-center gap-3">
                  {c.avatar_url ? (
                    <img src={c.avatar_url} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gold/25">
                      <Mascot className="h-12 w-12" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold">{c.full_name}</p>
                    {c.link_status === 'pending_confirmation' ? (
                      <Badge tone="warn">{t('parent.pendingLink')}</Badge>
                    ) : (
                      <p className="text-sm text-navy/60">
                        {[c.student_code, c.school_name, c.grade_class].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className="text-sm text-navy/60">{t('parent.currentLevel')}</p>
                    <p className="text-2xl font-bold">Level {c.level_number ?? 1}</p>
                    {c.link_status === 'active' && <p className="text-sm text-navy/70">{loc(c, 'group_name')}</p>}
                  </div>
                  {c.link_status === 'active' && <Badge>{loc(c, 'tier_name')}</Badge>}
                </div>
                {c.link_status === 'active' && (
                  <div className="space-y-1">
                    <StageBar current={c.stage_number} />
                    <p className="text-sm text-navy/60">
                      {t('parent.stage', { n: c.stage_number })}: {loc(c, 'stage_name')}
                    </p>
                  </div>
                )}
                {c.link_status === 'pending_confirmation' && <p className="text-sm text-navy/65">{t('parent.pendingLinkHint')}</p>}
                {/* Hồ sơ đầy đủ của con (tổng quan, lộ trình, khoá học, chứng nhận, sổ): Bước 8 */}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card className="space-y-3 p-4">
        <p className="font-semibold">{t('parent.addChild')}</p>
        <Button asChild size="full">
          <Link to="/activate">
            <QrCode className="h-5 w-5" /> {t('parent.activateAnother')}
          </Link>
        </Button>
        <Button variant="ghost" size="full" disabled>
          {t('parent.noCode')} · {t('common.comingSoon')}
        </Button>
      </Card>
    </div>
  )
}
