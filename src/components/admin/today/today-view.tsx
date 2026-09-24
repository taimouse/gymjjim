'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/admin/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDateKey } from '@/lib/format';

import { Followups } from './followups';
import { StatsPanel } from './stats-panel';
import { TodayNumbers } from './today-numbers';
import { TodayTimeline } from './today-timeline';
import { useDashboardRefresh } from './use-dashboard-refresh';

const TABS = ['today', 'week', 'month'] as const;
type Tab = (typeof TABS)[number];

/** 관리자 첫 화면 "오늘": 오늘 운영(숫자 4개 · 수업 타임라인 · 챙겨야 할 회원) + 주간/월간 통계 탭 */
export function TodayView({ today }: { today: string }) {
  const t = useTranslations('today');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab: Tab = TABS.find((value) => value === searchParams.get('tab')) ?? 'today';
  useDashboardRefresh();

  // 탭은 URL(?tab=)에 남긴다. 서버 왕복 없이 주소만 바꾼다 (?session= 드로어와 함께 쓸 수 있다)
  const selectTab = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'today') params.delete('tab');
    else params.set('tab', value);
    const query = params.toString();
    window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname);
  };

  return (
    <>
      <PageHeader title={t('title')} description={formatDateKey(today, { year: true, weekday: true })} />
      <Tabs value={tab} onValueChange={selectTab} className="gap-6">
        <TabsList aria-label={t('tabs.label')}>
          {TABS.map((value) => (
            <TabsTrigger key={value} value={value} className="px-4 text-base">
              {t(`tabs.${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="today" className="space-y-6 text-base">
          <TodayNumbers today={today} />
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
            <TodayTimeline today={today} />
            <Followups />
          </div>
        </TabsContent>
        <TabsContent value="week" className="text-base">
          <StatsPanel period="week" />
        </TabsContent>
        <TabsContent value="month" className="text-base">
          <StatsPanel period="month" />
        </TabsContent>
      </Tabs>
    </>
  );
}
