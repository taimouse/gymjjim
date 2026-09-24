import { z } from 'zod';

/** 회원 기기의 웹 푸시 구독 (브라우저 PushSubscription.toJSON() 값) */
export const pushSubscriptionSchema = z.object({
  centerId: z.uuid(),
  endpoint: z.url().startsWith('https://').max(2000),
  p256dh: z.string().min(20).max(200),
  auth: z.string().min(8).max(100),
  userAgent: z.string().max(300).optional(),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushEndpointSchema = z.url().startsWith('https://').max(2000);
