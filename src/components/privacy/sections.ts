/** 개인정보 처리방침 항목 순서 (문구는 messages/ko.json 의 privacy.sections) */
export const PRIVACY_SECTIONS = [
  'purpose',
  'items',
  'retention',
  'thirdParty',
  'outsourcing',
  'overseas',
  'destruction',
  'rights',
  'security',
  'cookies',
  'officer',
  'remedy',
  'changes',
] as const;

/** 스크롤이 끝에서 이만큼(px) 안쪽이면 끝까지 읽은 것으로 본다 */
export const READ_END_THRESHOLD_PX = 24;

/** 스크롤 위치 → 읽은 비율(0~100). 내용이 영역보다 짧으면 100 */
export function readPercent(scrollTop: number, clientHeight: number, scrollHeight: number): number {
  const scrollable = scrollHeight - clientHeight;
  if (scrollable <= READ_END_THRESHOLD_PX) return 100;
  if (scrollTop >= scrollable - READ_END_THRESHOLD_PX) return 100;
  return Math.max(0, Math.min(99, Math.floor((scrollTop / scrollable) * 100)));
}
