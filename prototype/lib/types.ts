/** 프로토타입 데이터 (실제 앱의 테이블을 단순화한 모양. 브라우저 localStorage 에 저장) */

export interface ProtoCenter {
  name: string;
  phone: string;
  address: string;
  timezone: string;
}

export interface ProtoStaff {
  id: string;
  name: string;
  color: string;
}

export interface ProtoMember {
  id: string;
  name: string;
  phone: string;
}

export interface ProtoProgram {
  id: string;
  name: string;
  type: 'group' | 'private';
  default_capacity: number;
  duration_min: number;
  color: string;
  description: string | null;
  default_instructor_id: string | null;
  publish_at: string | null;
}

export interface ProtoSession {
  id: string;
  program_id: string;
  instructor_id: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  status: 'scheduled' | 'cancelled';
  note: string | null;
  recurrence_group_id: string | null;
  publish_at: string | null;
  /** 다른 회원들의 예약 수 (시연용 고정값) */
  others_booked: number;
}

/** 로그인한 회원(나)의 예약 */
export interface ProtoBooking {
  id: string;
  session_id: string;
  status: 'booked' | 'waitlisted' | 'cancelled';
  waitlist_position: number | null;
  created_at: string;
}

export interface ProtoState {
  version: 1;
  center: ProtoCenter;
  staff: ProtoStaff[];
  members: ProtoMember[];
  /** 회원 화면에서 로그인한 회원 */
  meId: string;
  privacyAgreedAt: string | null;
  marketingAgreedAt: string | null;
  programs: ProtoProgram[];
  sessions: ProtoSession[];
  bookings: ProtoBooking[];
}
