'use client';

import { useTranslations } from 'next-intl';

import { useAdmin } from '@/components/admin/admin-context';
import { PageHeader } from '@/components/admin/page-header';
import { ProductTable } from '@/components/admin/products/product-table';

/** 이용권 (src/app/admin/(shell)/passes/page.tsx) */
export default function PassesPage() {
  const t = useTranslations();
  const { isOwner } = useAdmin();
  return (
    <>
      <PageHeader title={t('products.title')} description={t('products.description')} />
      {!isOwner && <p className="mb-4 text-sm text-muted-foreground">{t('admin.readOnly')}</p>}
      <ProductTable />
    </>
  );
}
