'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useAdmin } from '@/components/admin/admin-context';
import { ProductTable } from '@/components/admin/products/product-table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { ProgramList } from './program-list';

export type ProgramsTab = 'programs' | 'products';

/** 프로그램 / 이용권 상품 탭 (선택한 탭은 URL ?tab= 에 남긴다) */
export function ProgramsTabs({ tab }: { tab: ProgramsTab }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const { isOwner } = useAdmin();

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => router.replace(value === 'programs' ? pathname : `${pathname}?tab=${value}`)}
      className="gap-4"
    >
      <TabsList>
        <TabsTrigger value="programs" className="px-4">
          {t('programs.tabs.programs')}
        </TabsTrigger>
        <TabsTrigger value="products" className="px-4">
          {t('programs.tabs.products')}
        </TabsTrigger>
      </TabsList>
      {!isOwner && <p className="text-sm text-muted-foreground">{t('admin.readOnly')}</p>}
      <TabsContent value="programs">
        <ProgramList />
      </TabsContent>
      <TabsContent value="products">
        <ProductTable />
      </TabsContent>
    </Tabs>
  );
}
