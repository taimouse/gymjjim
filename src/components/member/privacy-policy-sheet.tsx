'use client';

import { ArrowDown, CheckCircle2, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { readPercent } from '@/components/privacy/sections';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

/**
 * 개인정보 처리방침 전문 바텀시트. 본문을 끝까지 스크롤해야 "확인" 버튼이 켜진다.
 * 본문(children)은 서버에서 그린 <PrivacyPolicy /> 를 받는다.
 */
export function PrivacyPolicySheet({
  open,
  onOpenChange,
  onConfirm,
  children,
  privacyHref = '/privacy',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 끝까지 읽고 확인을 눌렀을 때 */
  onConfirm: () => void;
  children: ReactNode;
  privacyHref?: string;
}) {
  const t = useTranslations('privacy.sheet');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [percent, setPercent] = useState(0);
  const read = percent >= 100;

  const measure = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const next = readPercent(element.scrollTop, element.clientHeight, element.scrollHeight);
    // 한 번 끝까지 읽었으면 다시 올려도 읽은 상태를 유지한다
    setPercent((previous) => Math.max(previous, next));
  }, []);

  // 열릴 때(내용이 영역보다 짧은 화면 포함) 한 번 잰다
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [open, measure]);

  const scrollDown = () => {
    const element = scrollRef.current;
    element?.scrollBy({ top: element.clientHeight * 0.8, behavior: 'smooth' });
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[92dvh] max-w-md text-base">
        <DrawerHeader className="gap-2">
          <DrawerTitle className="text-xl font-bold">{t('title')}</DrawerTitle>
          <DrawerDescription className="text-base">{t('description')}</DrawerDescription>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={t('progress', { percent })}
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
          </div>
        </DrawerHeader>

        <div
          ref={scrollRef}
          onScroll={measure}
          data-testid="privacy-scroll"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4"
          tabIndex={0}
        >
          {children}
        </div>

        <DrawerFooter className="border-t">
          <p
            className="text-right text-sm font-semibold text-muted-foreground tabular-nums"
            aria-live="polite"
          >
            {t('progress', { percent })}
          </p>
          {read ? (
            <Button size="lg" className="w-full" onClick={onConfirm}>
              <CheckCircle2 aria-hidden />
              {t('confirm')}
            </Button>
          ) : (
            <Button size="lg" variant="secondary" className="w-full" onClick={scrollDown}>
              <ArrowDown aria-hidden />
              {t('scrollMore')}
            </Button>
          )}
          <Button asChild variant="ghost" size="sm">
            <a href={privacyHref} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden />
              {t('openFull')}
            </a>
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
