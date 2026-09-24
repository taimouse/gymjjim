import { z } from 'zod';

import { normalizePhone } from '@/lib/format';

/** centers.booking_settings (CLAUDE.md 5번 기본값) */
export const bookingSettingsSchema = z.object({
  open_days_before: z.number().int().min(0).max(90),
  close_minutes_before: z.number().int().min(0).max(1440),
  free_cancel_hours_before: z.number().min(0).max(168),
  auto_promote_waitlist: z.boolean(),
});
export type BookingSettings = z.infer<typeof bookingSettingsSchema>;

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  open_days_before: 7,
  close_minutes_before: 30,
  free_cancel_hours_before: 3,
  auto_promote_waitlist: true,
};

export function parseBookingSettings(value: unknown): BookingSettings {
  const parsed = bookingSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_BOOKING_SETTINGS;
}

/** 예약 규칙 폼 (설정 화면) */
export const bookingRulesFormSchema = z.object({
  openDaysBefore: z
    .number({ error: 'required' })
    .int()
    .min(0, { error: 'invalid' })
    .max(90, { error: 'invalid' }),
  closeMinutesBefore: z
    .number({ error: 'required' })
    .int()
    .min(0, { error: 'invalid' })
    .max(1440, { error: 'invalid' }),
  freeCancelHoursBefore: z
    .number({ error: 'required' })
    .min(0, { error: 'invalid' })
    .max(168, { error: 'invalid' }),
  autoPromoteWaitlist: z.boolean(),
});
export type BookingRulesFormValues = z.infer<typeof bookingRulesFormSchema>;

const phoneField = z
  .string()
  .trim()
  .transform((value) => normalizePhone(value))
  .refine((value) => value === '' || /^[0-9]{8,11}$/.test(value), { error: 'phone' });

/** 센터 정보 폼 */
export const centerInfoFormSchema = z.object({
  name: z.string().trim().min(1, { error: 'required' }).max(100),
  phone: phoneField,
  address: z.string().trim().max(200),
  timezone: z.string().min(1, { error: 'required' }),
});
export type CenterInfoFormValues = z.input<typeof centerInfoFormSchema>;

/** 알림 설정 (대표): 알림톡 실패 시 SMS 대체발송 */
export const notificationSettingsSchema = z.object({
  smsFallback: z.boolean(),
});
export type NotificationSettingsValues = z.infer<typeof notificationSettingsSchema>;
