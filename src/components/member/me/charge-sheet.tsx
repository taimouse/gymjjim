'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { useErrorText } from '@/components/form-messages';
import { useMember } from '@/components/member/member-context';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { memberBookingKeys } from '@/features/booking/queries';
import { requestCreditCharge } from '@/features/credits/actions';
import { CHARGE_PRESETS, CREDIT_MAX } from '@/features/credits/schema';
import { formatWon } from '@/lib/format';
import { cn } from '@/lib/utils';

/** 크레딧 충전 요청: 개수를 고르면 금액(개수 × 1개 가격)을 보여주고 [충전 요청] */
export function ChargeSheet({
  open,
  onOpenChange,
  price,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  price: number;
}) {
  const t = useTranslations('member.credits.sheet');
  const errorText = useErrorText();
  const { centerId } = useMember();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState<number>(CHARGE_PRESETS[1]);
  const [pending, startTransition] = useTransition();
  const valid = Number.isInteger(amount) && amount >= 1 && amount <= CREDIT_MAX;

  const submit = () =>
    startTransition(async () => {
      const result = await requestCreditCharge({ centerId, amount });
      await queryClient.invalidateQueries({ queryKey: memberBookingKeys.all });
      if (!result.ok) {
        toast.error(errorText(result.code));
        return;
      }
      toast.success(t('done'));
      onOpenChange(false);
    });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-md text-base">
        <DrawerHeader>
          <DrawerTitle className="text-xl font-bold">{t('title')}</DrawerTitle>
          <DrawerDescription className="text-base">{t('description')}</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-4 px-4">
          <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('presets')}>
            {CHARGE_PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant={amount === preset ? 'default' : 'outline'}
                size="lg"
                className="h-12 text-base"
                aria-pressed={amount === preset}
                onClick={() => setAmount(preset)}
              >
                {t('preset', { count: preset })}
              </Button>
            ))}
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t('custom')}</span>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={CREDIT_MAX}
              value={Number.isNaN(amount) ? '' : amount}
              onChange={(event) => setAmount(event.target.valueAsNumber)}
              className="h-12 text-right text-base tabular-nums"
            />
          </label>
          <p
            className={cn(
              'rounded-xl p-4 text-center',
              valid ? 'bg-brand-soft text-brand-soft-foreground' : 'bg-muted text-muted-foreground',
            )}
          >
            {valid ? (
              <>
                <span className="block text-sm">{t('summary', { amount, price: formatWon(price) })}</span>
                <span className="block text-2xl font-bold tabular-nums">{formatWon(amount * price)}</span>
              </>
            ) : (
              t('invalid', { max: CREDIT_MAX })
            )}
          </p>
        </div>
        <DrawerFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Button size="lg" className="h-14 text-lg" onClick={submit} disabled={pending || !valid}>
            {pending && <Spinner />}
            {t('submit')}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
