'use client';

import { Copy, Link2, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { useAdmin } from '@/components/admin/admin-context';
import { ErrorAlert } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { createMemberInvite } from '@/features/members/actions';
import type { AppErrorCode } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';

/** 앱 초대 링크 만들기 · 복사 · 알림톡 발송 */
export function InviteDialog({ memberId, onClose }: { memberId: string; onClose: () => void }) {
  const t = useTranslations('members.invite');
  const tCommon = useTranslations('common');
  const { timezone } = useAdmin();
  const [invite, setInvite] = useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  const create = (send: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await createMemberInvite(memberId, send);
      if (!result.ok) {
        setError(result.code);
        return;
      }
      setInvite(result.data);
      if (send) toast.success(t('sent'));
    });
  };

  const copy = async () => {
    if (!invite) return;
    await navigator.clipboard.writeText(invite.url);
    toast.success(t('copied'));
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {invite ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                readOnly
                value={invite.url}
                onFocus={(event) => event.target.select()}
                className="font-mono text-sm"
              />
              <Button variant="outline" onClick={copy} aria-label={t('copy')}>
                <Copy aria-hidden />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('expires', { date: formatDateTime(invite.expiresAt, timezone) })}
            </p>
          </div>
        ) : null}
        <ErrorAlert code={error} />
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={onClose}>
            {tCommon('close')}
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" onClick={() => create(false)} disabled={pending}>
              {pending ? <Spinner /> : <Link2 aria-hidden />}
              {t('create')}
            </Button>
            <Button onClick={() => create(true)} disabled={pending}>
              <Send aria-hidden />
              {t('send')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
