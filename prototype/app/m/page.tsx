'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** /m → /m/book */
export default function MemberHome() {
  const router = useRouter();
  useEffect(() => router.replace('/m/book/'), [router]);
  return null;
}
