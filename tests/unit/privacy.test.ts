import { describe, expect, it } from 'vitest';

import { PRIVACY_SECTIONS, readPercent } from '@/components/privacy/sections';
import messages from '@/i18n/messages/ko.json';

describe('개인정보 처리방침', () => {
  it('끝까지 스크롤해야 100%', () => {
    // 내용 2000px, 보이는 영역 500px → 스크롤 가능 1500px
    expect(readPercent(0, 500, 2000)).toBe(0);
    expect(readPercent(750, 500, 2000)).toBe(50);
    expect(readPercent(1400, 500, 2000)).toBe(93);
    expect(readPercent(1480, 500, 2000)).toBe(100);
    expect(readPercent(1500, 500, 2000)).toBe(100);
  });

  it('내용이 영역보다 짧으면 바로 다 읽은 것', () => {
    expect(readPercent(0, 800, 600)).toBe(100);
  });

  it('항목마다 제목과 본문 문구가 있다', () => {
    for (const key of PRIVACY_SECTIONS) {
      expect(messages.privacy.sections[key].title).toMatch(/^\d+\. /);
      expect(messages.privacy.sections[key].body.length).toBeGreaterThan(10);
    }
  });
});
