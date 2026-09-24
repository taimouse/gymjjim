import type { ReactNode } from 'react';

import { BrandMark } from '@/components/brand-mark';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh justify-center bg-surface px-4 py-10 sm:items-center">
      <div className="w-full max-w-sm space-y-8">
        <BrandMark />
        {children}
      </div>
    </main>
  );
}
