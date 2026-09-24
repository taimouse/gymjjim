import { readFileSync } from 'node:fs';

import type ko from '@/i18n/messages/ko.json';

/** 화면 문구(ko.json). 선택자는 문구를 직접 적지 않고 여기서 가져온다 */
export const messages: typeof ko = JSON.parse(
  readFileSync(new URL('../../../src/i18n/messages/ko.json', import.meta.url), 'utf8'),
);

/** `{name} 님을 예약했어요` 같은 문구의 자리표시자를 채운다 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)(?:, number)?\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}
