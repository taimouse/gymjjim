import { describe, expect, it } from 'vitest';

import {
  formatKoreanDateKey,
  formatKoreanDateTime,
  NOTIFICATION_TEMPLATES,
  NOTIFICATION_TYPES,
  previewNotification,
  renderNotification,
  templateVariableNames,
} from '@/features/notifications/templates';
import { formatDateTime } from '@/lib/format';

// 광고성 메시지로 보일 수 있는 표현 (알림톡은 정보성만 가능)
const PROMOTIONAL = ['할인', '이벤트', '쿠폰', '특가', '프로모션', '혜택', '(광고)', '무료 체험', '구매하'];

describe('알림톡 템플릿', () => {
  it('9종 모두 있고, 코드는 DB template_code(upper(type))와 같다', () => {
    expect(NOTIFICATION_TYPES).toHaveLength(9);
    for (const type of NOTIFICATION_TYPES) {
      expect(NOTIFICATION_TEMPLATES[type].code).toBe(type.toUpperCase());
    }
  });

  it('원문의 변수마다 값을 채우고, 원문에 있는 변수만 보낸다', () => {
    const context = { memberName: '홍길동', centerName: '강남점' };
    for (const type of NOTIFICATION_TYPES) {
      const template = NOTIFICATION_TEMPLATES[type];
      const names = templateVariableNames(type);
      expect(Object.keys(template.variables(template.sample, context))).toEqual(
        expect.arrayContaining(names),
      );
      const preview = previewNotification(type);
      expect(Object.keys(preview.variables).sort()).toEqual(names.sort());
      expect(preview.text).not.toMatch(/#\{/);
      expect(Object.values(preview.variables).every((value) => value.length > 0)).toBe(true);
    }
  });

  it('모든 알림에 받는 회원 이름이 들어간다', () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(templateVariableNames(type)).toContain('#{회원명}');
      const rendered = renderNotification(type, NOTIFICATION_TEMPLATES[type].sample, {
        memberName: '김민지',
        centerName: '강남점',
      });
      expect(rendered?.text).toContain('김민지님');
    }
    // 이름이 없으면 '회원님'
    const unnamed = renderNotification('reminder_2h', {}, { memberName: null, centerName: null });
    expect(unnamed?.text).toContain('회원님');
  });

  it('정보성 문구만 쓴다', () => {
    for (const type of NOTIFICATION_TYPES) {
      for (const word of PROMOTIONAL) expect(NOTIFICATION_TEMPLATES[type].body).not.toContain(word);
    }
  });

  it('날짜는 화면 표기와 같다: 9월 24일 (목) 오후 7:00', () => {
    const value = '2026-09-24T10:00:00Z';
    expect(formatKoreanDateTime(value)).toBe('9월 24일 (목) 오후 7:00');
    expect(formatKoreanDateTime(value)).toBe(formatDateTime(value, 'Asia/Seoul'));
    expect(formatKoreanDateTime('2026-09-24T00:05:00Z', 'Asia/Seoul')).toBe('9월 24일 (목) 오전 9:05');
    expect(formatKoreanDateKey('2026-10-01')).toBe('10월 1일 (목)');
    expect(formatKoreanDateTime('not-a-date')).toBe('-');
  });

  it('알림 데이터로 변수를 채운다 (센터 이름은 알림 데이터 우선)', () => {
    const rendered = renderNotification(
      'session_changed',
      {
        program_name: 'WOD',
        starts_at: '2026-09-24T11:00:00Z',
        previous_starts_at: '2026-09-24T10:00:00Z',
        timezone: 'Asia/Seoul',
        center_name: '강남점',
        instructor_name: null,
      },
      { memberName: '홍길동', centerName: '다른 이름' },
    );
    expect(rendered).toMatchObject({
      code: 'SESSION_CHANGED',
      variables: {
        '#{센터명}': '강남점',
        '#{수업명}': 'WOD',
        '#{수업일시}': '9월 24일 (목) 오후 8:00',
        '#{변경전일시}': '9월 24일 (목) 오후 7:00',
      },
    });
    expect(rendered?.text).toContain('■ 변경 후: 9월 24일 (목) 오후 8:00');
    // 원문에 없는 변수(강사명)는 보내지 않는다
    expect(rendered?.variables).not.toHaveProperty(['#{강사명}']);

    const confirmed = renderNotification(
      'booking_confirmed',
      { program_name: 'WOD', starts_at: '2026-09-24T11:00:00Z', instructor_name: null },
      { memberName: '홍길동', centerName: '강남점' },
    );
    expect(confirmed?.variables).toMatchObject({ '#{센터명}': '강남점', '#{강사명}': '미정' });

    const pass = renderNotification(
      'pass_remaining_one',
      { pass_name: '10회권' },
      { memberName: '김민지', centerName: '강남점' },
    );
    expect(pass?.text).toContain('김민지님');
    expect(renderNotification('free_text', {}, { memberName: null, centerName: null })).toBeNull();
  });
});
