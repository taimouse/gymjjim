import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@/components/admin/page-header';
import { BookingRulesForm } from '@/components/admin/settings/booking-rules-form';
import { CenterInfoForm } from '@/components/admin/settings/center-info-form';
import { StaffSection } from '@/components/admin/settings/staff-section';
import { parseBookingSettings } from '@/features/centers/schema';
import { requireStaff } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings');
  return { title: t('title') };
}

/** 설정: 센터 정보·시간대 / 예약 규칙 / 직원 관리. 트레이너는 보기만 가능 */
export default async function SettingsPage() {
  const { center, staff } = await requireStaff();
  const t = await getTranslations();
  const supabase = await createClient();
  const { data } = await supabase.from('centers').select('phone, address').eq('id', center.id).single();
  const rules = parseBookingSettings(center.booking_settings);

  return (
    <>
      <PageHeader title={t('settings.title')} description={t('settings.description')} />
      {staff.role !== 'owner' && (
        <p className="mb-4 rounded-lg bg-muted px-4 py-3 text-muted-foreground">{t('admin.readOnly')}</p>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <CenterInfoForm
          initial={{
            name: center.name,
            phone: data?.phone ?? '',
            address: data?.address ?? '',
            timezone: center.timezone,
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
        <div className="xl:col-span-2">
          <StaffSection />
        </div>
      </div>
    </>
  );
}
