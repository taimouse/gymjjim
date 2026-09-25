'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { SETTINGS_TABS, type SettingsTab } from './tabs';

/** 설정 탭: 센터·예약 규칙 / 직원 / 알림 (선택한 탭은 URL ?tab= 에 남긴다) */
export function SettingsTabs({ tab, panels }: { tab: SettingsTab; panels: Record<SettingsTab, ReactNode> }) {
  const t = useTranslations('settings.tabs');
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => router.replace(value === 'general' ? pathname : `${pathname}?tab=${value}`)}
      className="gap-4"
    >
      <TabsList aria-label={t('label')}>
        {SETTINGS_TABS.map((value) => (
          <TabsTrigger key={value} value={value} className="px-4 text-base">
            {t(value)}
          </TabsTrigger>
        ))}
      </TabsList>
      {SETTINGS_TABS.map((value) => (
        <TabsContent key={value} value={value} className="text-base">
          {panels[value]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
