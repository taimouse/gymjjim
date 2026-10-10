import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@/components/admin/page-header';
import { ProductTable } from '@/components/admin/products/product-table';
import { requireStaff } from '@/lib/auth/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('products');
  return { title: t('title') };
}

/** 이용권: 판매용 이용권 상품(기간권·횟수권) */
export default async function PassesPage() {
  const { staff } = await requireStaff();
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t('products.title')} description={t('products.description')} />
      {staff.role !== 'owner' && <p className="mb-4 text-sm text-muted-foreground">{t('admin.readOnly')}</p>}
      <ProductTable />
    </>
  );
}
