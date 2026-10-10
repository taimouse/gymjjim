'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** /m → 수업 예약 */
export default function MemberHome() {
  const router = useRouter();
  useEffect(() => router.replace('/m/book/'), [router]);
  return null;
}
