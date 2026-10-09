'use client';

import { useQueryClient } from '@tanstack/react-query';
import { type LucideIcon, Mail, MapPin, Phone, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useTransition } from 'react';
import { toast } from 'sonner';

import { EditSheet } from '@/components/admin/edit-sheet';
import { ErrorAlert, useErrorText } from '@/components/form-messages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { UsageMeter } from '@/components/usage-meter';
import { resendOwnerInvite } from '@/features/platform/actions';
import {
  type PlatformCenterRow,
  platformKeys,
  useInvoices,
  usePlatformCenter,
} from '@/features/platform/queries';
import { toAppErrorCode } from '@/lib/errors';
import {
  daysUntil,
  formatDateKey,
  formatDateWithYear,
  formatDDay,
  formatPhone,
  formatWon,
} from '@/lib/format';

import { CenterEditForm } from './center-edit-form';
import { InvoiceTable } from './invoice-table';
import { CenterStatusBadge } from './status-badges';

/** 센터 상세 드로어 (?center=): 대표·연락처 · 사용량 · 요금제·상태 변경 · 청구 내역 */
export function CenterDrawer({
  centerId,
  today,
  onClose,
}: {
  centerId: string | null;
  today: string;
  onClose: () => void;
}) {
  const t = useTranslations('platform.centers.detail');
  const query = usePlatformCenter(centerId);
  const center = query.data;

  return (
    <EditSheet
      open={!!centerId}
      onOpenChange={(open) => !open && onClose()}
      title={center?.name ?? t('title')}
      className="sm:max-w-2xl"
    >
      {query.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : query.isError ? (
        <ErrorAlert code={toAppErrorCode(query.error)} />
      ) : !center ? (
        <ErrorAlert code="CENTER_NOT_FOUND" />
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <CenterStatusBadge status={center.status} />
              {center.status === 'trial' && center.trial_ends_at && (
                <Badge variant="outline">
                  {t('trialUntil', {
                    date: formatDateKey(center.trial_ends_at),
                    dday: formatDDay(daysUntil(center.trial_ends_at, today)),
                  })}
                </Badge>
              )}
              {center.plan_name && (
                <span className="text-muted-foreground">
                  {center.plan_name}
                  {center.monthly_price !== null && ` · ${formatWon(center.monthly_price)}`}
                </span>
              )}
            </div>
            <dl className="grid gap-2 text-base">
              {center.phone && (
                <InfoRow icon={Phone} label={t('phone')}>
                  {formatPhone(center.phone)}
                </InfoRow>
              )}
              {center.address && (
                <InfoRow icon={MapPin} label={t('address')}>
                  {center.address}
                </InfoRow>
              )}
            </dl>
            <p className="text-sm text-muted-foreground">
              {t('createdAt', { date: formatDateWithYear(center.created_at) })}
            </p>
          </section>

          <OwnerSection center={center} />

          <section className="space-y-4">
            <h3 className="text-lg font-bold">{t('usage')}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <UsageMeter
                label={t('members')}
                count={center.member_count}
                limit={center.max_members}
                unit={t('peopleUnit')}
                unlimitedLabel={t('unlimited')}
              />
              <UsageMeter
                label={t('staff')}
                count={center.staff_count}
                limit={center.max_staff}
                unit={t('peopleUnit')}
                unlimitedLabel={t('unlimited')}
              />
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-lg font-bold">{t('settings')}</h3>
            <CenterEditForm key={`${center.id}:${center.status}:${center.plan_id}`} center={center} />
          </section>

          <CenterInvoices centerId={center.id} today={today} />
        </div>
      )}
    </EditSheet>
  );
}

function InfoRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="flex items-center gap-1 pt-1 text-muted-foreground">
        <Icon className="size-4" aria-hidden />
        <span className="sr-only">{label}</span>
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function OwnerSection({ center }: { center: PlatformCenterRow }) {
  const t = useTranslations('platform.centers.detail');
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();

  const resend = () => {
    startTransition(async () => {
      const result = await resendOwnerInvite(center.id);
      if (!result.ok) {
        toast.error(errorText(result.code));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: platformKeys.all });
      toast.success(result.data.existing ? t('linkedExisting') : t('resent'));
    });
  };

  return (
    <section className="space-y-3">
      <h3 className="text-lg font-bold">{t('owner')}</h3>
      {center.owner_name ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border p-4">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-semibold">
              {center.owner_name}
              {!center.owner_linked && <Badge variant="warning">{t('ownerPending')}</Badge>}
            </p>
            <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
              <Mail className="size-3.5 shrink-0" aria-hidden />
              {center.owner_email ?? '—'}
            </p>
          </div>
          {!center.owner_linked && (
            <Button variant="outline" size="sm" onClick={resend} disabled={pending}>
              {pending ? <Spinner /> : <Send aria-hidden />}
              {t('resendInvite')}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground">{t('noOwner')}</p>
      )}
    </section>
  );
}

function CenterInvoices({ centerId, today }: { centerId: string; today: string }) {
  const t = useTranslations('platform.centers.detail');
  const invoices = useInvoices({ month: null, status: null, centerId });
  const rows = invoices.data ?? [];

  return (
    <section className="space-y-3">
      <h3 className="text-lg font-bold">{t('invoices')}</h3>
      {invoices.isPending ? (
        <Skeleton className="h-28 rounded-xl" />
      ) : invoices.isError ? (
        <ErrorAlert code={toAppErrorCode(invoices.error)} />
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">{t('invoicesEmpty')}</p>
      ) : (
        <InvoiceTable rows={rows} today={today} showCenter={false} />
      )}
    </section>
  );
}
