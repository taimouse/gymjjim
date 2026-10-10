'use client';

import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/admin/page-header';
import { formatPhone } from '@/lib/format';

import { useProtoState } from '../../../lib/store';

/** 센터 정보 (시간대는 서울 고정이라 입력란이 없다) */
export default function SettingsPage() {
  const t = useTranslations('prototype.admin.settings');
  const tCenter = useTranslations('settings.center');
  const state = useProtoState();
  if (!state) return null;
  const rows = [
    [tCenter('name'), state.center.name],
    [tCenter('phone'), formatPhone(state.center.phone)],
    [tCenter('address'), state.center.address],
  ] as const;
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <dl className="max-w-xl divide-y rounded-xl border bg-card">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 p-4 sm:grid-cols-[8rem_1fr]">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
