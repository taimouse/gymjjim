'use client';

import { useTranslations } from 'next-intl';

import { useAdmin } from '@/components/admin/admin-context';
import { ErrorAlert } from '@/components/form-messages';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { UsageMeter } from '@/components/usage-meter';
import { useCenterPlanUsage } from '@/features/centers/queries';
import { toAppErrorCode } from '@/lib/errors';
import { formatDateKey, formatWon } from '@/lib/format';

/** 설정 > 일반: gymjjim 이용 요금제와 회원·직원 사용량 (변경은 운영팀) */
export function PlanUsageCard() {
  const t = useTranslations('settings.plan');
  const { centerId } = useAdmin();
  const usage = useCenterPlanUsage(centerId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
        {usage.data && (
          <CardAction>
            {usage.data.status === 'trial' ? (
              <Badge variant="info">
                {usage.data.trial_ends_at
                  ? t('trialUntil', { date: formatDateKey(usage.data.trial_ends_at) })
                  : t('trial')}
              </Badge>
            ) : (
              usage.data.plan_name && <Badge variant="brand">{usage.data.plan_name}</Badge>
            )}
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {usage.isPending ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : usage.isError ? (
          <ErrorAlert code={toAppErrorCode(usage.error)} />
        ) : (
          <div className="space-y-5">
            <p className="text-lg font-semibold">
              {usage.data.plan_name ?? t('noPlan')}
              {usage.data.monthly_price !== null && (
                <span className="ml-2 text-base font-normal text-muted-foreground">
                  {t('perMonth', { price: formatWon(usage.data.monthly_price) })}
                </span>
              )}
            </p>
            <UsageMeter
              label={t('members')}
              count={usage.data.member_count}
              limit={usage.data.max_members}
              unit={t('peopleUnit')}
              unlimitedLabel={t('unlimited')}
            />
            <UsageMeter
              label={t('staff')}
              count={usage.data.staff_count}
              limit={usage.data.max_staff}
              unit={t('peopleUnit')}
              unlimitedLabel={t('unlimited')}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
