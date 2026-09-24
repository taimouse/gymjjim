import { createHmac } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  buildSolapiBody,
  parseSolapiConfig,
  parseSolapiResponse,
  sendSolapiAlimtalk,
  SOLAPI_SEND_URL,
  solapiAuthorization,
  type SolapiConfig,
} from '@/features/notifications/solapi';

const config: SolapiConfig = {
  apiKey: 'NCSTESTKEY',
  apiSecret: 'test-secret',
  senderNumber: '0212345678',
  pfId: 'KA01PF000000000000000000000001',
  templateIds: { BOOKING_CONFIRMED: 'KA01TP000000000000000000000001' },
};
const message = {
  to: '01012345678',
  code: 'BOOKING_CONFIRMED',
  variables: { '#{센터명}': '강남점' },
  smsFallback: true,
};

describe('Solapi 알림톡 어댑터', () => {
  it('HMAC-SHA256 서명 헤더를 만든다', async () => {
    const date = '2026-09-25T00:00:00.000Z';
    const salt = 'abcdef0123456789';
    const expected = createHmac('sha256', config.apiSecret)
      .update(date + salt)
      .digest('hex');
    expect(await solapiAuthorization(config.apiKey, config.apiSecret, date, salt)).toBe(
      `HMAC-SHA256 apiKey=NCSTESTKEY, date=${date}, salt=${salt}, signature=${expected}`,
    );
  });

  it('변수 방식 본문 (대체발송 여부는 disableSms)', () => {
    expect(buildSolapiBody(config, message, 'TPL')).toEqual({
      messages: [
        {
          to: '01012345678',
          from: '0212345678',
          kakaoOptions: {
            pfId: config.pfId,
            templateId: 'TPL',
            variables: message.variables,
            disableSms: false,
          },
        },
      ],
    });
    const noFallback = buildSolapiBody(config, { ...message, smsFallback: false }, 'TPL');
    expect(noFallback.messages[0]!.kakaoOptions.disableSms).toBe(true);
  });

  it('응답: 접수 성공 / 실패 목록 / 다시 시도할 수 있는 오류', () => {
    expect(parseSolapiResponse(200, { groupInfo: {}, failedMessageList: [] })).toEqual({
      ok: true,
      retryable: false,
    });
    expect(
      parseSolapiResponse(200, { failedMessageList: [{ statusCode: '3059', statusMessage: '변수 불일치' }] }),
    ).toEqual({ ok: false, retryable: false, error: '3059 변수 불일치' });
    expect(parseSolapiResponse(400, { errorCode: 'ValidationError', errorMessage: 'bad' })).toEqual({
      ok: false,
      retryable: false,
      error: 'HTTP_400 ValidationError bad',
    });
    expect(parseSolapiResponse(503, null)).toEqual({ ok: false, retryable: true, error: 'HTTP_503' });
    expect(parseSolapiResponse(429, null).retryable).toBe(true);
  });

  it('등록되지 않은 템플릿은 보내지 않고, 네트워크 오류는 다시 시도한다', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    expect(await sendSolapiAlimtalk(config, { ...message, code: 'REMINDER_2H' }, fetchMock)).toEqual({
      ok: false,
      retryable: false,
      error: 'TEMPLATE_NOT_REGISTERED REMINDER_2H',
    });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(Response.json({ failedMessageList: [] }));
    expect(await sendSolapiAlimtalk(config, message, fetchMock)).toEqual({ ok: true, retryable: false });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(SOLAPI_SEND_URL);
    expect(new Headers(init?.headers).get('Authorization')).toMatch(/^HMAC-SHA256 apiKey=NCSTESTKEY, date=/);

    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    expect(await sendSolapiAlimtalk(config, message, fetchMock)).toEqual({
      ok: false,
      retryable: true,
      error: 'NETWORK ECONNRESET',
    });
  });

  it('환경 변수에서 설정을 읽는다 (빠진 값이 있으면 null)', () => {
    const env = {
      SOLAPI_API_KEY: 'key',
      SOLAPI_API_SECRET: 'secret',
      SOLAPI_SENDER_NUMBER: '02-1234-5678',
      SOLAPI_KAKAO_PFID: 'pf',
      SOLAPI_TEMPLATE_IDS: '{"BOOKING_CONFIRMED":"TP1"}',
    };
    expect(parseSolapiConfig(env)).toEqual({
      apiKey: 'key',
      apiSecret: 'secret',
      senderNumber: '0212345678',
      pfId: 'pf',
      templateIds: { BOOKING_CONFIRMED: 'TP1' },
    });
    expect(parseSolapiConfig({ ...env, SOLAPI_API_KEY: '' })).toBeNull();
    expect(
      parseSolapiConfig({ ...env, SOLAPI_TEMPLATE_IDS: '{"BOOKING_CONFIRMED":"TP1","REMINDER_2H":""}' })
        ?.templateIds,
    ).toEqual({ BOOKING_CONFIRMED: 'TP1' });
    expect(parseSolapiConfig({ ...env, SOLAPI_TEMPLATE_IDS: '[1]' })).toBeNull();
    expect(parseSolapiConfig({ ...env, SOLAPI_TEMPLATE_IDS: '{"BOOKING_CONFIRMED":1}' })).toBeNull();
    expect(parseSolapiConfig({ ...env, SOLAPI_TEMPLATE_IDS: 'not json' })).toBeNull();
  });
});
