'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Link2, Pencil, Smartphone, UserX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { useAdmin } from '@/components/admin/admin-context';
import { MemberCredits } from '@/components/admin/credits/member-credits';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { EditSheet } from '@/components/admin/edit-sheet';
import { useErrorText } from '@/components/form-messages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { withdrawMember } from '@/features/members/actions';
import { memberKeys, type MemberPassRow, useMemberDetail } from '@/features/members/queries';
import { formatDate, formatPhone, todayKey } from '@/lib/format';
import { pickPrimaryPass } from '@/lib/pass-status';

import { GrantPassDialog } from './grant-pass-dialog';
import { HoldDialog } from './hold-dialog';
import { InviteDialog } from './invite-dialog';
import { MemberFormSheet } from './member-form-sheet';
import { MemberHistory } from './member-history';
import { MemberPassCard } from './member-pass-card';
import { useMemberDrawer } from './use-member-drawer';

type Dialog =
  { kind: 'grant' } | { kind: 'hold'; pass: MemberPassRow } | { kind: 'invite' } | { kind: 'edit' } | null;

/** 회원 상세 드로어. 관리자 셸에 한 번 두고 URL ?member=<id> 로 연다 */
export function MemberDrawer() {
  const t = useTranslations('members');
  const errorText = useErrorText();
  const { memberId, close } = useMemberDrawer();
  const { timezone, isOwner } = useAdmin();
  const queryClient = useQueryClient();
  const detail = useMemberDetail(memberId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [pending, startTransition] = useTransition();
  const today = todayKey(timezone);

  if (!memberId) return null;
  const data = detail.data;
  const member = data?.member;
  const primary = data ? pickPrimaryPass(data.passes, today) : null;

  const onWithdraw = () =>
    startTransition(async () => {
      const result = await withdrawMember(memberId);
      if (!result.ok) {
        toast.error(errorText(result.code));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: memberKeys.all });
      toast.success(t('withdraw.done'));
      setConfirmWithdraw(false);
      close();
    });

  return (
    <>
      <EditSheet
        open
        onOpenChange={(open) => !open && close()}
        title={member?.name ?? (detail.isPending ? t('drawer.loading') : t('drawer.notFound'))}
        description={
          member ? (
            <span className="flex flex-wrap items-center gap-2 text-base">
              <span className="font-medium text-foreground tabular-nums">{formatPhone(member.phone)}</span>
              <Badge variant={member.user_id ? 'success' : 'muted'}>
                <Smartphone aria-hidden />
                {member.user_id ? t('appLinked') : t('appNotLinked')}
              </Badge>
              <span>{t('drawer.joined', { date: formatDate(member.joined_at, timezone) })}</span>
            </span>
          ) : undefined
        }
        className="sm:max-w-xl"
      >
        {detail.isPending ? (
          <div className="space-y-4">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : !data || !member ? (
          <p className="py-10 text-center text-muted-foreground">{t('drawer.notFound')}</p>
        ) : (
          <div className="space-y-5">
            {member.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {member.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            <MemberPassCard
              pass={primary}
              today={today}
              onHold={(pass) => setDialog({ kind: 'hold', pass })}
              onGrant={() => setDialog({ kind: 'grant' })}
            />
            <MemberCredits memberId={member.id} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setDialog({ kind: 'edit' })}>
                <Pencil aria-hidden />
                {t('drawer.edit')}
              </Button>
              {!member.user_id && (
                <Button variant="outline" size="sm" onClick={() => setDialog({ kind: 'invite' })}>
                  <Link2 aria-hidden />
                  {t('drawer.invite')}
                </Button>
              )}
              {isOwner && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-danger"
                  onClick={() => setConfirmWithdraw(true)}
                >
                  <UserX aria-hidden />
                  {t('drawer.withdraw')}
                </Button>
              )}
            </div>
            <MemberHistory key={member.id} detail={data} today={today} />
          </div>
        )}
      </EditSheet>

      {dialog?.kind === 'grant' && <GrantPassDialog memberId={memberId} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'hold' && <HoldDialog pass={dialog.pass} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'invite' && <InviteDialog memberId={memberId} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'edit' && member && (
        <MemberFormSheet
          memberId={member.id}
          initialValues={{
            name: member.name,
            phone: formatPhone(member.phone),
            birth: member.birth ?? '',
            gender: member.gender,
            tags: member.tags.join(', '),
            memo: member.memo ?? '',
            privacyAgreed: true,
            marketingAgreed: !!member.marketing_agreed_at,
            notifyEnabled: member.notify_enabled,
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {member && (
        <ConfirmDialog
          open={confirmWithdraw}
          onOpenChange={setConfirmWithdraw}
          title={t('withdraw.title', { name: member.name })}
          description={t('withdraw.description')}
          confirmLabel={t('withdraw.confirm')}
          onConfirm={onWithdraw}
          pending={pending}
        />
      )}
    </>
  );
}
