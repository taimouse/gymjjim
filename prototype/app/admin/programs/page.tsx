'use client';

import { useTranslations } from 'next-intl';

import { useAdmin } from '@/components/admin/admin-context';
import { PageHeader } from '@/components/admin/page-header';
import { ProgramList } from '@/components/admin/programs/program-list';

/** 프로그램 (src/app/admin/(shell)/programs/page.tsx) */
export default function ProgramsPage() {
  const t = useTranslations();
  const { isOwner } = useAdmin();
  return (
    <>
      <PageHeader title={t('programs.title')} description={t('programs.description')} />
      {!isOwner && <p className="mb-4 text-sm text-muted-foreground">{t('admin.readOnly')}</p>}
      <ProgramList />
    </>
  );
}
