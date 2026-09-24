'use client';

import { createContext, type ReactNode, useContext } from 'react';

import type { BookingSettings } from '@/features/centers/schema';

export interface MemberSession {
  memberId: string;
  name: string;
  centerId: string;
  centerName: string;
  timezone: string;
  bookingSettings: BookingSettings;
  notifyEnabled: boolean;
  marketingAgreed: boolean;
}

const MemberContext = createContext<MemberSession | null>(null);

export function MemberProvider({ session, children }: { session: MemberSession; children: ReactNode }) {
  return <MemberContext.Provider value={session}>{children}</MemberContext.Provider>;
}

export function useMember(): MemberSession {
  const value = useContext(MemberContext);
  if (!value) throw new Error('useMember must be used inside <MemberProvider>');
  return value;
}
