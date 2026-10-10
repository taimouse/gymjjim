'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Plus, Ticket } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { useAdmin } from '@/components/admin/admin-context';
import { PageHeader } from '@/components/admin/page-header';
import { useErrorText } from '@/components/form-messages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { setProductActive } from '@/features/passes/actions';
import { type ProductItem, productKeys, useProductsQuery } from '@/features/passes/queries';
import { EMPTY_PRODUCT, type ProductFormValues } from '@/features/passes/schema';
import { formatWon } from '@/lib/format';

import { ProductSheet } from './product-sheet';

function toFormValues(product: ProductItem): ProductFormValues {
  return {
    type: product.type,
    name: product.name,
    durationDays: product.duration_days,
    totalCount: product.total_count,
    useLimit: product.period_limit_count !== null,
    limitCount: product.period_limit_count ?? 3,
    limitUnit: product.period_limit_unit ?? 'week',
    price: product.price,
    isActive: product.is_active,
  };
}

/** 이용권: 제목(+ 추가 버튼) · 상품 테이블 · 편집 드로어 */
export function ProductTable() {
  const t = useTranslations('products');
  const tAdmin = useTranslations('admin');
  const errorText = useErrorText();
  const { centerId, isOwner } = useAdmin();
  const queryClient = useQueryClient();
  const products = useProductsQuery(centerId);
  const [editing, setEditing] = useState<{ id?: string; values: ProductFormValues } | null>(null);

  const toggleActive = async (product: ProductItem, isActive: boolean) => {
    const result = await setProductActive(product.id, isActive);
    if (!result.ok) return toast.error(errorText(result.code));
    await queryClient.invalidateQueries({ queryKey: productKeys.list(centerId) });
  };

  const addButton = isOwner ? (
    <Button onClick={() => setEditing({ values: EMPTY_PRODUCT })}>
      <Plus aria-hidden />
      {t('add')}
    </Button>
  ) : null;

  return (
    <div className="space-y-4">
      <PageHeader title={t('title')} description={t('description')} actions={addButton} />
      {!isOwner && <p className="text-sm text-muted-foreground">{tAdmin('readOnly')}</p>}

      {products.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : (products.data ?? []).length === 0 ? (
        <Empty className="border bg-background">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Ticket aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{t('empty.title')}</EmptyTitle>
            <EmptyDescription>{t('empty.description')}</EmptyDescription>
          </EmptyHeader>
          {addButton && <EmptyContent>{addButton}</EmptyContent>}
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table className="text-base">
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.name')}</TableHead>
                <TableHead>{t('columns.type')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('columns.duration')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('columns.count')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('columns.limit')}</TableHead>
                <TableHead className="text-right">{t('columns.price')}</TableHead>
                <TableHead className="w-24 text-center">{t('columns.active')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(products.data ?? []).map((product) => (
                <TableRow
                  key={product.id}
                  className="h-14 cursor-pointer"
                  onClick={() => setEditing({ id: product.id, values: toFormValues(product) })}
                >
                  <TableCell className="font-medium">
                    <button type="button" className="text-left outline-none focus-visible:underline">
                      {product.name}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge variant="muted">{t(`type.${product.type}`)}</Badge>
                  </TableCell>
                  <TableCell className="hidden tabular-nums md:table-cell">
                    {product.duration_days === null
                      ? t('noExpiry')
                      : t('durationDays', { days: product.duration_days })}
                  </TableCell>
                  <TableCell className="hidden tabular-nums md:table-cell">
                    {product.total_count === null
                      ? t('unlimited')
                      : t('countTimes', { count: product.total_count })}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {product.period_limit_count === null || product.period_limit_unit === null
                      ? t('noLimit')
                      : t('limitText', {
                          unit: t(`unit.${product.period_limit_unit}`),
                          count: product.period_limit_count,
                        })}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatWon(product.price)}
                  </TableCell>
                  <TableCell className="text-center" onClick={(event) => event.stopPropagation()}>
                    <Switch
                      checked={product.is_active}
                      disabled={!isOwner}
                      aria-label={t('columns.active')}
                      onCheckedChange={(checked) => toggleActive(product, checked)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editing && (
        <ProductSheet
          open
          onOpenChange={(open) => !open && setEditing(null)}
          productId={editing.id}
          initialValues={editing.values}
        />
      )}
    </div>
  );
}
