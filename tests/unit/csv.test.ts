import { describe, expect, it } from 'vitest';

import { csvMemberSchema } from '@/features/members/schema';
import { decodeCsv, guessMapping, normalizeDate, parseCsv } from '@/lib/csv';

describe('parseCsv', () => {
  it('따옴표 안의 쉼표·줄바꿈·따옴표를 처리한다', () => {
    const text =
      '이름,전화번호,메모\r\n홍길동,010-1234-5678,"무릎 부상, 주의"\r\n"김""민지""",01099998888,"첫줄\n둘째줄"\r\n';
    expect(parseCsv(text)).toEqual([
      ['이름', '전화번호', '메모'],
      ['홍길동', '010-1234-5678', '무릎 부상, 주의'],
      ['김"민지"', '01099998888', '첫줄\n둘째줄'],
    ]);
  });

  it('탭 구분도 읽고 빈 줄은 건너뛴다', () => {
    expect(parseCsv('이름\t전화\n\n홍길동\t01012345678')).toEqual([
      ['이름', '전화'],
      ['홍길동', '01012345678'],
    ]);
  });
});

describe('decodeCsv', () => {
  it('UTF-8 BOM 을 지운다', () => {
    const bytes = new TextEncoder().encode('﻿이름,전화');
    expect(decodeCsv(bytes.buffer)).toBe('이름,전화');
  });

  it('UTF-8 이 아니면 EUC-KR 로 읽는다', () => {
    // "홍길동" (EUC-KR)
    const euckr = new Uint8Array([0xc8, 0xab, 0xb1, 0xe6, 0xb5, 0xbf]);
    expect(decodeCsv(euckr.buffer)).toBe('홍길동');
  });
});

describe('컬럼 매핑·값 정리', () => {
  it('헤더 이름으로 매핑을 추측한다', () => {
    expect(guessMapping(['회원명', '휴대폰번호', '생년월일', '성별', '비고', '가입일'])).toEqual({
      name: 0,
      phone: 1,
      birth: 2,
      gender: 3,
      memo: 4,
      tags: null,
      joinedAt: 5,
    });
  });

  it('여러 날짜 형식을 YYYY-MM-DD 로 바꾼다', () => {
    expect(normalizeDate('2026.9.4')).toBe('2026-09-04');
    expect(normalizeDate('20260924')).toBe('2026-09-24');
    expect(normalizeDate('2026/09/24')).toBe('2026-09-24');
    expect(normalizeDate('')).toBe('');
  });

  it('행 검증: 전화번호 정규화, 성별 한국어 표기, 잘못된 번호는 오류', () => {
    const ok = csvMemberSchema.parse({
      name: ' 홍길동 ',
      phone: '010-1234-5678',
      birth: '1990-01-02',
      gender: '여',
      memo: '',
      tags: '아침반, PT',
      joinedAt: '',
    });
    expect(ok).toEqual({
      name: '홍길동',
      phone: '01012345678',
      birth: '1990-01-02',
      gender: 'female',
      memo: '',
      tags: ['아침반', 'PT'],
      joinedAt: null,
    });
    const bad = csvMemberSchema.safeParse({
      name: '',
      phone: '02-123-4567',
      birth: '',
      gender: '',
      memo: '',
      tags: '',
      joinedAt: '',
    });
    expect(bad.success).toBe(false);
  });
});
