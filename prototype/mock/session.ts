/**
 * 프로토타입의 "로그인한 사람": 관리자 화면은 대표(또는 ?as=staff 로 트레이너), 회원 화면은 홍길동.
 * 실제 앱의 dev-login 과 같은 시드 계정이다.
 */
import type { StaffContext } from '@/lib/auth/session';

import { byId, CENTER_ID, ME_MEMBER_ID, OWNER_STAFF_ID, type Row, table } from './db';

const STAFF_KEY = 'jackygym-prototype-staff';
const COACH_STAFF_ID = 'b0000000-0000-4000-8000-000000000002';

export function currentStaffId(): string {
  try {
    return window.localStorage.getItem(STAFF_KEY) === 'staff' ? COACH_STAFF_ID : OWNER_STAFF_ID;
  } catch {
    return OWNER_STAFF_ID;
  }
}

/** 관리자 화면 계정 바꾸기 (대표 ↔ 트레이너) */
export function setStaffRole(role: 'owner' | 'staff') {
  try {
    window.localStorage.setItem(STAFF_KEY, role);
  } catch {
    // 무시
  }
}

export function currentStaff(): Row {
  return byId('staff', currentStaffId()) ?? table('staff')[0]!;
}

export function currentCenter(): Row {
  return byId('centers', CENTER_ID)!;
}

export function currentMember(): Row {
  return byId('members', ME_MEMBER_ID)!;
}

export function currentUser() {
  return {
    id: String(currentStaff().user_id ?? currentStaffId()),
    email: String(currentStaff().email ?? ''),
  };
}

export function staffContext(): StaffContext {
  const staff = currentStaff();
  const center = currentCenter();
  return {
    userId: String(staff.user_id),
    staff: {
      id: String(staff.id),
      name: String(staff.name),
      role: staff.role as 'owner' | 'staff',
      color: String(staff.color),
      center_id: CENTER_ID,
      email: (staff.email as string | null) ?? null,
    },
    center: {
      id: CENTER_ID,
      name: String(center.name),
      timezone: String(center.timezone),
      booking_settings: center.booking_settings as StaffContext['center']['booking_settings'],
    },
  } as StaffContext;
}
