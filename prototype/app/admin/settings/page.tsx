'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';

import { useAdmin } from '@/components/admin/admin-context';
import { PageHeader } from '@/components/admin/page-header';
import { BookingRulesForm } from '@/components/admin/settings/booking-rules-form';
import { CenterInfoForm } from '@/components/admin/settings/center-info-form';
import { CreditPriceCard } from '@/components/admin/settings/credit-price-card';
import { NotificationLogs } from '@/components/admin/settings/notifications/notification-logs';
import { NotificationTemplates } from '@/components/admin/settings/notifications/notification-templates';
import { SmsFallbackCard } from '@/components/admin/settings/notifications/sms-fallback-card';
import { PlanUsageCard } from '@/components/admin/settings/plan-usage-card';
import { SettingsTabs } from '@/components/admin/settings/settings-tabs';
import { StaffSection } from '@/components/admin/settings/staff-section';
import { parseSettingsTab } from '@/components/admin/settings/tabs';
import { parseBookingSettings } from '@/features/centers/schema';

import { currentCenter } from '../../../mock/session';

function Settings() {
  const t = useTranslations();
  const { isOwner } = useAdmin();
  const tab = parseSettingsTab(useSearchParams().get('tab') ?? undefined);
  const center = currentCenter();
  const rules = parseBookingSettings(center.booking_settings);
  return (
    <>
      <PageHeader title={t('settings.title')} description={t('settings.description')} />
      {!isOwner && (
        <p className="mb-4 rounded-lg bg-muted px-4 py-3 text-muted-foreground">{t('admin.readOnly')}</p>
      )}
      <SettingsTabs
        tab={tab}
        panels={{
          general: (
            <div className="grid gap-6 xl:grid-cols-2">
              <CenterInfoForm
                initial={{
                  name: String(center.name),
                  phone: String(center.phone ?? ''),
                  address: String(center.address ?? ''),
                }}
              />
              <BookingRulesForm
                initial={{
                  openDaysBefore: rules.open_days_before,
                  closeMinutesBefore: rules.close_minutes_before,
                  freeCancelHoursBefore: rules.free_cancel_hours_before,
                  autoPromoteWaitlist: rules.auto_promote_waitlist,
                }}
              />
              <CreditPriceCard initial={Number(center.credit_price ?? 5000)} />
              <PlanUsageCard />
            </div>
          ),
          staff: <StaffSection />,
          notifications: (
            <div className="space-y-6">
              <SmsFallbackCard initial={!!center.notify_sms_fallback} />
              <NotificationLogs />
              <NotificationTemplates />
            </div>
          ),
        }}
      />
    </>
  );
}

/** 설정 (src/app/admin/(shell)/settings/page.tsx) */
export default function SettingsPage() {
  return (
    <Suspense>
      <Settings />
    </Suspense>
  );
}
