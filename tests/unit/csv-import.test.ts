import { describe, expect, it } from 'vitest';

import { buildPreview, summarize } from '@/features/members/csv-import';
import { guessMapping, parseCsv } from '@/lib/csv';

const CSV = [
  '이름,휴대폰,생년월일,성별,비고',
  '홍길동,010-1111-2222,1990.1.2,남,',
  '김민지,01033334444,19950505,여,무릎 주의',
  ',01055556666,,,',
  '이서준,02-123-4567,,,',
  '박지우,010-3333-4444,,,',
  '최도윤,010-7777-8888,,,',
].join('\n');

describe('CSV 가져오기 미리보기', () => {
  const rows = parseCsv(CSV);
  const mapping = guessMapping(rows[0]!);
  const preview = buildPreview(rows, mapping, true, new Set(['01077778888']));

  it('정상 행은 정규화된 값으로 가져온다', () => {
    expect(preview[0]).toMatchObject({
      line: 2,
      status: 'ok',
      output: { name: '홍길동', phone: '01011112222', birth: '1990-01-02', gender: 'male' },
    });
    expect(preview[1]!.output).toMatchObject({ birth: '1995-05-05', gender: 'female', memo: '무릎 주의' });
  });

  it('오류 행은 어느 칸이 틀렸는지 표시한다', () => {
    expect(preview[2]).toMatchObject({ line: 4, status: 'invalid', errorFields: ['name'] });
    expect(preview[3]).toMatchObject({ status: 'invalid', errorFields: ['phone'] });
  });

  it('파일 안 중복과 이미 등록된 번호를 구분한다', () => {
    expect(preview[4]).toMatchObject({ status: 'duplicate' });
    expect(preview[5]).toMatchObject({ status: 'existing' });
    expect(summarize(preview)).toEqual({ valid: 2, invalid: 3, existing: 1 });
  });
});
