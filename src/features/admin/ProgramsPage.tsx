import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/card'
import { Select } from '@/components/ui/form'
import { CrudTable } from '@/features/admin/CrudTable'
import { useTable } from '@/lib/db'
import { useLocalized } from '@/lib/i18nField'
import { cn } from '@/lib/utils'
import type { Level, PassportStage, PassportTier, Program } from '@/lib/types'

type Tab = 'levels' | 'programs' | 'stages' | 'tiers'

/** Chương trình và level: sửa tên, mô tả song ngữ, ánh xạ level ↔ giai đoạn ↔ cấp hộ chiếu, nội dung chi tiết (F16). */
export function ProgramsPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('levels')
  const tabs: Tab[] = ['levels', 'programs', 'stages', 'tiers']
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('admin.nav.programs')}</h1>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              'min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold',
              tab === k ? 'bg-navy text-white' : 'bg-white text-navy/70 ring-1 ring-navy/15',
            )}
          >
            {t(`admin.programs.tab.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'levels' && <LevelsSection />}
      {tab === 'programs' && <ProgramsSection />}
      {tab === 'stages' && <StagesSection />}
      {tab === 'tiers' && <TiersSection />}
    </div>
  )
}

function LevelsSection() {
  const { t } = useTranslation()
  const loc = useLocalized()
  const programs = useTable<Program>('programs', { order: 'code' })
  const stages = useTable<PassportStage>('passport_stages', { order: 'number' })
  const tiers = useTable<PassportTier>('passport_tiers', { order: 'level_from' })
  const [programId, setProgramId] = useState<string>('')

  const selected = programId || programs.data?.find((p) => p.code === 'core20')?.id || ''
  const stageById = new Map((stages.data ?? []).map((s) => [s.id, s]))
  const tierById = new Map((tiers.data ?? []).map((s) => [s.id, s]))

  return (
    <div className="space-y-4">
      <label className="flex max-w-sm flex-col gap-1.5">
        <span className="text-sm font-semibold text-navy/80">{t('fields.program')}</span>
        <Select value={selected} onChange={(e) => setProgramId(e.target.value)}>
          {programs.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {loc(p, 'name')}
            </option>
          ))}
        </Select>
      </label>
      {selected && (
        <CrudTable<Level>
          key={selected}
          table="levels"
          titleKey="admin.programs.tab.levels"
          order="number"
          filter={(l) => l.program_id === selected}
          newDefaults={{ program_id: selected }}
          columns={[
            { key: 'number', labelKey: 'fields.number' },
            { key: 'name', labelKey: 'fields.name', render: (l) => loc(l, 'name') },
            { key: 'group', labelKey: 'fields.groupName', render: (l) => loc(l, 'group_name') },
            {
              key: 'stage',
              labelKey: 'fields.stage',
              render: (l) => {
                const s = l.passport_stage_id ? stageById.get(l.passport_stage_id) : null
                return s ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
                    {s.number}
                  </span>
                ) : '—'
              },
            },
            {
              key: 'tier',
              labelKey: 'fields.tier',
              render: (l) => (l.passport_tier_id ? loc(tierById.get(l.passport_tier_id), 'name') : '—'),
            },
            { key: 'target_handicap', labelKey: 'fields.targetHandicap' },
            {
              key: 'content',
              labelKey: 'fields.contentDetail',
              render: (l) =>
                l.content_detail?.rows?.length ? (
                  <Badge tone={l.content_detail.draft ? 'warn' : 'good'}>
                    {l.content_detail.rows.length} {t('admin.programs.rows')}
                    {l.content_detail.draft ? ` · ${t('admin.programs.draft')}` : ''}
                  </Badge>
                ) : null,
            },
          ]}
          fields={[
            { name: 'number', labelKey: 'fields.number', type: 'number', required: true },
            { name: 'name_vi', labelKey: 'fields.nameVi', required: true },
            { name: 'name_en', labelKey: 'fields.nameEn', required: true },
            { name: 'group_name_vi', labelKey: 'fields.groupNameVi' },
            { name: 'group_name_en', labelKey: 'fields.groupNameEn' },
            { name: 'summary_vi', labelKey: 'fields.summaryVi', type: 'textarea' },
            { name: 'summary_en', labelKey: 'fields.summaryEn', type: 'textarea' },
            { name: 'target_handicap', labelKey: 'fields.targetHandicap' },
            {
              name: 'passport_stage_id',
              labelKey: 'fields.stage',
              type: 'select',
              options: (stages.data ?? []).map((s) => ({ value: s.id, label: `${s.number}. ${loc(s, 'name')}` })),
            },
            {
              name: 'passport_tier_id',
              labelKey: 'fields.tier',
              type: 'select',
              options: (tiers.data ?? []).map((s) => ({ value: s.id, label: loc(s, 'name') })),
            },
            { name: 'content_detail', labelKey: 'fields.contentDetail', type: 'json', hintKey: 'admin.programs.contentHint' },
          ]}
        />
      )}
    </div>
  )
}

function ProgramsSection() {
  const loc = useLocalized()
  const { t } = useTranslation()
  return (
    <CrudTable<Program>
      table="programs"
      titleKey="admin.programs.tab.programs"
      order="code"
      newDefaults={{ is_active: true, is_official_level_track: false }}
      columns={[
        { key: 'code', labelKey: 'fields.code' },
        { key: 'name', labelKey: 'fields.name', render: (p) => loc(p, 'name') },
        {
          key: 'official',
          labelKey: 'fields.officialTrack',
          render: (p) => (p.is_official_level_track ? t('common.yes') : t('common.no')),
        },
        { key: 'active', labelKey: 'fields.status', render: (p) => (p.is_active ? t('common.active') : t('common.inactive')) },
      ]}
      fields={[
        { name: 'code', labelKey: 'fields.code', required: true, readOnlyOnEdit: true },
        { name: 'name_vi', labelKey: 'fields.nameVi', required: true },
        { name: 'name_en', labelKey: 'fields.nameEn', required: true },
        { name: 'description_vi', labelKey: 'fields.descriptionVi', type: 'textarea' },
        { name: 'description_en', labelKey: 'fields.descriptionEn', type: 'textarea' },
        { name: 'is_official_level_track', labelKey: 'fields.officialTrack', type: 'checkbox' },
        { name: 'is_active', labelKey: 'fields.isActive', type: 'checkbox' },
      ]}
    />
  )
}

function StagesSection() {
  const loc = useLocalized()
  return (
    <CrudTable<PassportStage>
      table="passport_stages"
      titleKey="admin.programs.tab.stages"
      order="number"
      canCreate={false}
      invalidate={['levels']}
      columns={[
        {
          key: 'number',
          labelKey: 'fields.number',
          render: (s) => (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 rounded-full" style={{ background: s.color }} />
              {s.number}
            </span>
          ),
        },
        { key: 'name', labelKey: 'fields.name', render: (s) => loc(s, 'name') },
        { key: 'levels', labelKey: 'fields.levelRange', render: (s) => `${s.level_from}–${s.level_to}` },
      ]}
      fields={[
        { name: 'name_vi', labelKey: 'fields.nameVi', required: true },
        { name: 'name_en', labelKey: 'fields.nameEn', required: true },
        { name: 'color', labelKey: 'fields.color', type: 'color', required: true },
        { name: 'level_from', labelKey: 'fields.levelFrom', type: 'number', required: true },
        { name: 'level_to', labelKey: 'fields.levelTo', type: 'number', required: true },
      ]}
    />
  )
}

function TiersSection() {
  const loc = useLocalized()
  return (
    <CrudTable<PassportTier>
      table="passport_tiers"
      titleKey="admin.programs.tab.tiers"
      order="level_from"
      canCreate={false}
      columns={[
        { key: 'name', labelKey: 'fields.name', render: (s) => loc(s, 'name') },
        { key: 'levels', labelKey: 'fields.levelRange', render: (s) => `${s.level_from}–${s.level_to}` },
        { key: 'validity_months', labelKey: 'fields.validityMonths' },
      ]}
      fields={[
        { name: 'name_vi', labelKey: 'fields.nameVi', required: true },
        { name: 'name_en', labelKey: 'fields.nameEn', required: true },
        { name: 'level_from', labelKey: 'fields.levelFrom', type: 'number', required: true },
        { name: 'level_to', labelKey: 'fields.levelTo', type: 'number', required: true },
        { name: 'validity_months', labelKey: 'fields.validityMonths', type: 'number', required: true },
      ]}
    />
  )
}
