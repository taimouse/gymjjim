import { describe, expect, it, vi } from 'vitest';

import { createPushChannel } from '@/features/notifications/channels';
import {
  parsePushConfig,
  type SendNotification,
  sendWebPush,
  toPushPayload,
} from '@/features/notifications/webpush';

const config = { publicKey: 'BPUBLIC', privateKey: 'PRIVATE', subject: 'mailto:admin@gymjjim.app' };
const subscription = (name: string) => ({
  endpoint: `https://push.example.com/${name}`,
  p256dh: 'p256dh',
  auth: 'auth',
});

describe('웹 푸시', () => {
  it('VAPID 설정이 모두 있어야 푸시 채널을 만든다', () => {
    const env = { VAPID_PUBLIC_KEY: 'BPUBLIC', VAPID_PRIVATE_KEY: 'PRIVATE', VAPID_SUBJECT: 'mailto:a@b.c' };
    expect(parsePushConfig(env)).toEqual({
      publicKey: 'BPUBLIC',
      privateKey: 'PRIVATE',
      subject: 'mailto:a@b.c',
    });
    expect(parsePushConfig({ ...env, VAPID_SUBJECT: 'admin@b.c' })).toBeNull();
    expect(parsePushConfig({ ...env, VAPID_PRIVATE_KEY: '' })).toBeNull();
    expect(createPushChannel({})).toBeNull();
  });

  it('알림톡 문구의 첫 줄을 제목으로, 나머지를 본문으로 쓴다', () => {
    const text =
      '[강남점] 내일 예약하신 수업을 안내해 드립니다.\n\n■ 수업: WOD\n■ 일시: 9월 24일 (목) 오후 7:00';
    expect(toPushPayload('reminder_day_before', text, 'tag-1')).toEqual({
      title: '[강남점] 내일 예약하신 수업을 안내해 드립니다.',
      body: '■ 수업: WOD\n■ 일시: 9월 24일 (목) 오후 7:00',
      url: '/m/my-bookings',
      tag: 'tag-1',
    });
    expect(toPushPayload('pass_remaining_one', '제목', 't').url).toBe('/m/me');
  });

  it('기기마다 보내고, 404·410 은 만료된 구독으로 모은다', async () => {
    const send = vi.fn<SendNotification>(async (target) => {
      if (target.endpoint.endsWith('/gone')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
      if (target.endpoint.endsWith('/error')) throw Object.assign(new Error('Server'), { statusCode: 500 });
      return {};
    });
    const payload = { title: '제목', body: '본문', url: '/m/my-bookings', tag: 't' };
    const result = await sendWebPush(
      config,
      [subscription('ok'), subscription('gone'), subscription('error')],
      payload,
      send,
    );
    expect(result).toEqual({ sent: 1, failed: 1, expired: ['https://push.example.com/gone'] });
    expect(send).toHaveBeenCalledWith(
      { endpoint: 'https://push.example.com/ok', keys: { p256dh: 'p256dh', auth: 'auth' } },
      JSON.stringify(payload),
      expect.objectContaining({ vapidDetails: config, urgency: 'normal' }),
    );
  });
});
