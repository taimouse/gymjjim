import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { devLoginEnabled } from '@/lib/auth/dev-login';
import { cn } from '@/lib/utils';

const ENTRIES = [
  { account: 'owner', href: '/admin?as=owner' },
  { account: 'staff', href: '/admin?as=staff' },
  { account: 'member', href: '/m?as=member' },
] as const;

/** 로컬 개발 스택(pnpm dev:local)에서만 보이는 "로그인 없이 둘러보기". 운영에서는 아무것도 그리지 않는다 */
export async function DevLoginPanel({ className }: { className?: string }) {
  if (!devLoginEnabled()) return null;
  const t = await getTranslations('dev.login');

  return (
    <section
      aria-labelledby="dev-login-title"
      className={cn('space-y-3 rounded-xl border border-dashed bg-background p-4', className)}
    >
      <div className="space-y-1">
        <h2 id="dev-login-title" className="font-semibold">
          {t('title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>
      <div className="grid gap-2">
        {ENTRIES.map(({ account, href }) => (
          <Button key={account} asChild variant="outline">
            {/* 세션 쿠키가 바뀌므로 Link(프리페치) 대신 전체 페이지로 이동한다 */}
            <a href={href}>{t(account)}</a>
          </Button>
        ))}
      </div>
    </section>
  );
}
