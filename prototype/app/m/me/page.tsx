'use client';

import { FileText, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { formatDateTime, maskPhone } from '@/lib/format';

import { protoActions, useProtoState } from '../../../lib/store';

/** 내 정보: 동의 내역 · 마케팅 수신 · 처리방침 */
export default function MePage() {
  const t = useTranslations('member.me');
  const tProto = useTranslations('prototype.member.me');
  const router = useRouter();
  const state = useProtoState();
  if (!state) return null;
  const me = state.members.find((member) => member.id === state.meId);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <section className="space-y-1 rounded-xl border bg-background p-4">
        <p className="text-xl font-bold">{me?.name}</p>
        <p className="text-muted-foreground">{maskPhone(me?.phone)}</p>
        {state.privacyAgreedAt && (
          <p className="pt-2 text-sm text-muted-foreground">
            {tProto('agreedAt', { date: formatDateTime(state.privacyAgreedAt, state.center.timezone) })}
          </p>
        )}
      </section>
      <label className="flex min-h-14 items-center justify-between gap-3 rounded-xl border bg-background px-4">
        <span className="font-medium">{tProto('marketing')}</span>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          {state.marketingAgreedAt ? tProto('marketingOn') : tProto('marketingOff')}
          <Switch checked={!!state.marketingAgreedAt} onCheckedChange={protoActions.setMarketing} />
        </span>
      </label>
      <div className="grid gap-2">
        <Button asChild variant="outline" size="lg" className="justify-start">
          <Link href="/privacy/">
            <FileText aria-hidden />
            {tProto('privacyLink')}
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="justify-start"
          onClick={() => {
            protoActions.resetOnboarding();
            router.replace('/m/welcome/');
          }}
        >
          <RotateCcw aria-hidden />
          {tProto('redo')}
        </Button>
      </div>
    </div>
  );
}
