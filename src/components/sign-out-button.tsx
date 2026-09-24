import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { signOut } from '@/features/auth/actions';

export function SignOutButton({
  to = 'member',
  variant = 'ghost',
  className,
}: {
  to?: 'admin' | 'member';
  variant?: 'ghost' | 'outline';
  className?: string;
}) {
  const t = useTranslations('auth');
  return (
    <form action={signOut}>
      <input type="hidden" name="to" value={to} />
      <Button type="submit" variant={variant} className={className}>
        <LogOut aria-hidden />
        {t('signOut')}
      </Button>
    </form>
  );
}
