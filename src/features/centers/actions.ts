'use server';

import { staffActionContext } from '@/lib/auth/action-context';
import { toAppErrorCode } from '@/lib/errors';
import { fail, ok, type Result } from '@/lib/result';
import { createClient } from '@/lib/supabase/server';

import {
  type BookingRulesFormValues,
  bookingRulesFormSchema,
  type BookingSettings,
  centerInfoFormSchema,
  type CenterInfoFormValues,
} from './schema';

/** 센터 정보·시간대 (대표) */
export async function updateCenterInfo(values: CenterInfoFormValues): Promise<Result<null>> {
  const parsed = centerInfoFormSchema.safeParse(values);
  if (!parsed.success) return fail('VALIDATION');
  const context = await staffActionContext({ owner: true });
  if (!context) return fail('FORBIDDEN');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('centers')
    .update(
      {
        name: parsed.data.name,
        phone: parsed.data.phone || null,
        address: parsed.data.address || null,
        timezone: parsed.data.timezone,
      },
      { count: 'exact' },
    )
    .eq('id', context.center.id);
  if (error) return fail(toAppErrorCode(error));
  return count ? ok(null) : fail('FORBIDDEN');
}

/** 예약 규칙 (대표) */
export async function updateBookingRules(values: BookingRulesFormValues): Promise<Result<null>> {
  const parsed = bookingRulesFormSchema.safeParse(values);
  if (!parsed.success) return fail('VALIDATION');
  const context = await staffActionContext({ owner: true });
  if (!context) return fail('FORBIDDEN');
  const settings: BookingSettings = {
    open_days_before: parsed.data.openDaysBefore,
    close_minutes_before: parsed.data.closeMinutesBefore,
    free_cancel_hours_before: parsed.data.freeCancelHoursBefore,
    auto_promote_waitlist: parsed.data.autoPromoteWaitlist,
  };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('centers')
    .update({ booking_settings: settings }, { count: 'exact' })
    .eq('id', context.center.id);
  if (error) return fail(toAppErrorCode(error));
  return count ? ok(null) : fail('FORBIDDEN');
}
