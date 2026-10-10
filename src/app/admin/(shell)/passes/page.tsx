import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ProductTable } from '@/components/admin/products/product-table';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('products');
  return { title: t('title') };
}

/** 이용권: 판매용 이용권 상품(기간권·횟수권) */
export default function PassesPage() {
  return <ProductTable />;
}
