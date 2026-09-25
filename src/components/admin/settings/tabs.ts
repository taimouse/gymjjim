/** 설정 탭 목록. 서버 페이지도 쓰므로 'use client' 모듈 밖에 둔다 (클라이언트 모듈의 값은 서버에서 참조만 된다) */
export const SETTINGS_TABS = ['general', 'staff', 'notifications'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** URL ?tab= → 탭. 모르는 값이면 첫 탭 */
export function parseSettingsTab(value: string | undefined): SettingsTab {
  return SETTINGS_TABS.find((tab) => tab === value) ?? 'general';
}
