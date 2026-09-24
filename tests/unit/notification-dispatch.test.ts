import { describe, expect, it, vi } from 'vitest';

import {
  type AlimtalkChannel,
  createAlimtalkChannel,
  mockChannel,
  type PushChannel,
} from '@/features/notifications/channels';
import { type ClaimedNotification, deliverAll, parseClaimed } from '@/features/notifications/dispatch';

const row = (overrides: Partial<ClaimedNotification> = {}): ClaimedNotification => ({
  id: crypto.randomUUID(),
  type: 'reminder_2h',
  payload: {
    program_name: 'WOD',
    starts_at: '2026-09-24T10:00:00Z',
    timezone: 'Asia/Seoul',
    center_name: '강남점',
    instructor_name: '이코치',
  },
  attempts: 1,
  member_name: '홍길동',
  phone: '01012345678',
  center_name: '강남점',
  center_timezone: 'Asia/Seoul',
  sms_fallback: true,
  push_subscriptions: [],
  ...overrides,
});

const okAlimtalk = () => {
  const send = vi.fn<AlimtalkChannel['send']>().mockResolvedValue({ ok: true, retryable: false });
  return { channel: { provider: 'test', send } satisfies AlimtalkChannel, send };
};

describe('알림 발송 루프', () => {
  it('가져온 행을 검증하고 형식이 다른 행은 버린다', () => {
    const good = row();
    const { rows, invalid } = parseClaimed([good, { ...good, phone: '010-1234' }, null, { id: 'x' }]);
    expect(rows).toEqual([good]);
    expect(invalid).toBe(3);
    expect(parseClaimed(null)).toEqual({ rows: [], invalid: 0 });
  });

  it('템플릿으로 채워 보내고, 결과를 건마다 기록한다', async () => {
    const { channel, send } = okAlimtalk();
    const finish = vi.fn(() => Promise.resolve());
    const first = row();
    const unknown = row({ type: 'free_text' });

    expect(await deliverAll(parseClaimed([first, unknown]).rows, { alimtalk: channel }, finish)).toEqual({
      sent: 1,
      failed: 1,
      pushed: 0,
      expired: [],
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toMatchObject({
      to: '01012345678',
      code: 'REMINDER_2H',
      smsFallback: true,
      variables: { '#{수업일시}': '9월 24일 (목) 오후 7:00', '#{센터명}': '강남점' },
    });
    expect(finish).toHaveBeenCalledWith({
      id: first.id,
      ok: true,
      error: null,
      retry: false,
      provider: 'test',
    });
    expect(finish).toHaveBeenCalledWith({
      id: unknown.id,
      ok: false,
      error: 'UNKNOWN_TEMPLATE free_text',
      retry: false,
      provider: 'test',
    });
  });

  it('채널이 예외를 던지면 다시 시도할 실패로 기록한다', async () => {
    const channel: AlimtalkChannel = { provider: 'test', send: () => Promise.reject(new Error('boom')) };
    const finish = vi.fn(() => Promise.resolve());
    const target = row();
    expect(await deliverAll(parseClaimed([target]).rows, { alimtalk: channel }, finish)).toMatchObject({
      sent: 0,
      failed: 1,
    });
    expect(finish).toHaveBeenCalledWith({
      id: target.id,
      ok: false,
      error: 'EXCEPTION boom',
      retry: true,
      provider: 'test',
    });
  });

  it('켜 둔 기기로 웹 푸시도 보내고(첫 시도만), 만료된 구독을 모은다', async () => {
    const { channel } = okAlimtalk();
    const pushSend = vi
      .fn<PushChannel['send']>()
      .mockResolvedValue({ sent: 1, failed: 0, expired: ['https://push.example.com/old'] });
    const subscriptions = [
      { endpoint: 'https://push.example.com/new', p256dh: 'key', auth: 'auth' },
      { endpoint: 'https://push.example.com/old', p256dh: 'key', auth: 'auth' },
    ];
    const first = row({ push_subscriptions: subscriptions });
    const retry = row({ push_subscriptions: subscriptions, attempts: 2 });

    const result = await deliverAll(
      parseClaimed([first, retry]).rows,
      { alimtalk: channel, push: { send: pushSend } },
      () => Promise.resolve(),
    );
    expect(result).toEqual({ sent: 2, failed: 0, pushed: 1, expired: ['https://push.example.com/old'] });
    expect(pushSend).toHaveBeenCalledTimes(1);
    expect(pushSend.mock.calls[0]![1]).toMatchObject({
      title: '[강남점] 예약하신 수업이 2시간 뒤에 시작합니다.',
      url: '/m/my-bookings',
      tag: `reminder_2h:${first.id}`,
    });
  });
});

describe('알림톡 채널 선택', () => {
  it('기본은 mock: 보내지 않고 전화번호를 가려서 로그만 남긴다', async () => {
    const lines: string[] = [];
    const channel = mockChannel((line) => lines.push(line));
    expect(
      await channel.send({
        to: '01012345678',
        code: 'REMINDER_2H',
        variables: {},
        text: '본문',
        smsFallback: false,
      }),
    ).toEqual({ ok: true, retryable: false });
    expect(lines[0]).toContain('010-****-5678');
    expect(lines[0]).not.toContain('01012345678');
    expect(createAlimtalkChannel({})?.provider).toBe('mock');
  });

  it('solapi 는 설정이 모두 있어야 쓰고, 모르는 대행사면 보내지 않는다', () => {
    expect(createAlimtalkChannel({ NOTIFY_ALIMTALK_PROVIDER: 'solapi' })).toBeNull();
    expect(
      createAlimtalkChannel({
        NOTIFY_ALIMTALK_PROVIDER: 'solapi',
        SOLAPI_API_KEY: 'key',
        SOLAPI_API_SECRET: 'secret',
        SOLAPI_SENDER_NUMBER: '0212345678',
        SOLAPI_KAKAO_PFID: 'pf',
        SOLAPI_TEMPLATE_IDS: '{"REMINDER_2H":"TP"}',
      })?.provider,
    ).toBe('solapi');
    expect(createAlimtalkChannel({ NOTIFY_ALIMTALK_PROVIDER: 'unknown' })).toBeNull();
  });
});
