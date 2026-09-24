'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { useErrorText } from '@/components/form-messages';
import { useMember } from '@/components/member/member-context';
import { Switch } from '@/components/ui/switch';
import { deletePushSubscription, savePushSubscription } from '@/features/notifications/actions';
import { publicEnv } from '@/lib/env';

type PushState = 'loading' | 'unsupported' | 'needsInstall' | 'denied' | 'off' | 'on';

/** VAPID 공개키(base64url) → applicationServerKey */
function toApplicationServerKey(base64: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function isInstalledIos(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || window.matchMedia('(display-mode: standalone)').matches;
}

/** 이 기기의 현재 상태 (서비스 워커는 배포 환경에서만 등록된다) */
async function detect(publicKey: string | undefined): Promise<PushState> {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!supported) {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !isInstalledIos() ? 'needsInstall' : 'unsupported';
  }
  if (!publicKey) return 'unsupported';
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return (await registration.pushManager.getSubscription()) ? 'on' : 'off';
}

/** 웹 푸시(보조 채널) 켜기·끄기. 기기마다 따로 켠다 */
export function PushToggle() {
  const t = useTranslations('member.me.push');
  const errorText = useErrorText();
  const { centerId } = useMember();
  const publicKey = publicEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [state, setState] = useState<PushState>('loading');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void detect(publicKey)
      .catch((): PushState => 'unsupported')
      .then((next) => {
        if (!cancelled) setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  const enable = () =>
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted' || !publicKey) {
          setState(permission === 'denied' ? 'denied' : 'off');
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toApplicationServerKey(publicKey),
        });
        const json = subscription.toJSON();
        const result = await savePushSubscription({
          centerId,
          endpoint: json.endpoint ?? subscription.endpoint,
          p256dh: json.keys?.p256dh ?? '',
          auth: json.keys?.auth ?? '',
          userAgent: navigator.userAgent.slice(0, 300),
        });
        if (!result.ok) {
          await subscription.unsubscribe();
          toast.error(errorText(result.code));
          return;
        }
        setState('on');
        toast.success(t('enabled'));
      } catch {
        toast.error(t('failed'));
      }
    });

  const disable = () =>
    startTransition(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await deletePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState('off');
      toast.success(t('disabled'));
    });

  const hint =
    state === 'unsupported' || state === 'needsInstall' || state === 'denied' ? t(state) : t('hint');
  const usable = state === 'on' || state === 'off';

  return (
    <label className="flex min-h-16 cursor-pointer items-center justify-between gap-4 p-4 has-disabled:cursor-default">
      <span className="min-w-0">
        <span className="block font-medium">{t('label')}</span>
        <span className="block text-sm text-muted-foreground">{hint}</span>
      </span>
      <Switch
        checked={state === 'on'}
        disabled={!usable || pending}
        onCheckedChange={(checked) => (checked ? enable() : disable())}
      />
    </label>
  );
}
