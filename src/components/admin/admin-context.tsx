'use client';

import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

import type { BookingSettings } from '@/features/centers/schema';

export interface AdminSession {
  centerId: string;
  centerName: string;
  timezone: string;
  bookingSettings: BookingSettings;
  staffId: string;
  staffName: string;
  role: 'owner' | 'staff';
}

interface AdminContextValue extends AdminSession {
  isOwner: boolean;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
}

const AdminContext = createContext<AdminContextValue | null>(null);

/** 관리자 화면 공통 정보(현재 센터·직원·권한)와 ⌘K 검색 열림 상태 */
export function AdminProvider({ session, children }: { session: AdminSession; children: ReactNode }) {
  const [commandOpen, setCommandOpen] = useState(false);
  const value = useMemo(
    () => ({ ...session, isOwner: session.role === 'owner', commandOpen, setCommandOpen }),
    [session, commandOpen],
  );
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminContextValue {
  const value = useContext(AdminContext);
  if (!value) throw new Error('useAdmin must be used inside <AdminProvider>');
  return value;
}
