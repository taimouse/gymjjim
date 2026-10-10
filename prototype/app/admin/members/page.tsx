'use client';

import { Suspense } from 'react';

import { MembersView } from '@/components/admin/members/members-view';

export default function MembersPage() {
  return (
    <Suspense>
      <MembersView />
    </Suspense>
  );
}
