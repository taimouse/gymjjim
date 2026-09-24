'use client';

import { Mail, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useAdmin } from '@/components/admin/admin-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { type StaffItem, useStaffQuery } from '@/features/staff/queries';
import { maskPhone } from '@/lib/format';

import { StaffSheet } from './staff-sheet';

/** 직원 목록 · 초대 · 권한 변경 (대표만 편집) */
export function StaffSection() {
  const t = useTranslations('settings.staff');
  const tRole = useTranslations('admin.topbar.role');
  const { centerId, staffId, isOwner } = useAdmin();
  const staff = useStaffQuery(centerId);
  const [editing, setEditing] = useState<{ staff: StaffItem | null } | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
        {isOwner && (
          <CardAction>
            <Button onClick={() => setEditing({ staff: null })}>
              <UserPlus aria-hidden />
              {t('invite')}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {staff.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </div>
        ) : (staff.data ?? []).length === 0 ? (
          <p className="text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {(staff.data ?? []).map((member) => (
              <li key={member.id}>
                <button
                  type="button"
                  disabled={!isOwner}
                  onClick={() => setEditing({ staff: member })}
                  className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 enabled:hover:bg-muted/50 disabled:cursor-default"
                >
                  <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: member.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-semibold">
                      {member.name}
                      {member.id === staffId && <Badge variant="muted">{t('you')}</Badge>}
                    </span>
                    <span className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                      <Mail className="size-3.5 shrink-0" aria-hidden />
                      {member.email ?? '—'}
                      {member.phone ? ` · ${maskPhone(member.phone)}` : ''}
                    </span>
                  </span>
                  {!member.user_id && <Badge variant="warning">{t('pending')}</Badge>}
                  <Badge variant={member.role === 'owner' ? 'brand' : 'secondary'}>
                    {tRole(member.role)}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {editing && <StaffSheet staff={editing.staff} onClose={() => setEditing(null)} />}
    </Card>
  );
}
