import { addDays, startOfISOWeek } from 'date-fns';

import { localToUtc } from '@/features/sessions/recurrence';
import { todayKey } from '@/lib/format';

import type { ProtoProgram, ProtoSession, ProtoState } from './types';

const TIME_ZONE = 'Asia/Seoul';

// 폼 스키마가 uuid 를 검사하므로 supabase/seed.sql 과 같은 id 를 쓴다
const programId = (n: number) => `f0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const staffId = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const memberId = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const ME_ID = memberId(1);
const PROGRAM_BUNGEE = programId(6);

export const CENTER = {
  name: '재키 피트니스 구미점',
  phone: '050713743962',
  address: '경상북도 구미시 상사동로 58 (임은동)',
  timezone: TIME_ZONE,
};

/** supabase/seed.sql 과 같은 센터·직원·프로그램 */
const PROGRAMS: ProtoProgram[] = [
  [programId(1), '아침 요가', 'group', 12, 60, '#A7F3D0', '하루를 여는 60분 빈야사 요가', staffId(2)],
  [programId(2), '크로스핏 WOD', 'group', 16, 60, '#FECACA', '오늘의 운동(WOD) 그룹 수업', staffId(3)],
  [programId(3), '필라테스 기구', 'group', 6, 50, '#DDD6FE', '리포머 기구 필라테스 소그룹', staffId(2)],
  [programId(4), '저녁 스피닝', 'group', 20, 45, '#BFDBFE', '음악과 함께하는 실내 사이클', staffId(2)],
  [programId(5), '1:1 PT', 'private', 1, 50, '#FDE68A', '담당 트레이너와 1:1 수업', staffId(2)],
  [
    programId(6),
    '번지피지오',
    'group',
    8,
    50,
    '#FBCFE8',
    '번지 코드로 관절 부담을 줄인 재활·근력 운동',
    staffId(2),
  ],
].map(([id, name, type, capacity, minutes, color, description, instructor]) => ({
  id: id as string,
  name: name as string,
  type: type as 'group' | 'private',
  default_capacity: capacity as number,
  duration_min: minutes as number,
  color: color as string,
  description: description as string,
  default_instructor_id: instructor as string,
  publish_at: null,
}));

/** [프로그램, 강사, 요일(1=월), 시작, 분, 정원] — supabase/seed/20_sessions.sql 과 같은 시간표 */
const TEMPLATE: Array<[string, string, number[], string, number, number]> = [
  [programId(1), staffId(2), [1, 3, 5], '07:00', 60, 12],
  [programId(2), staffId(3), [1, 2, 3, 4, 5], '19:00', 60, 16],
  [programId(2), staffId(3), [6], '10:00', 60, 16],
  [programId(3), staffId(2), [2, 4], '12:00', 50, 6],
  [programId(3), staffId(2), [2, 4], '20:30', 50, 6],
  [programId(4), staffId(2), [1, 3, 5], '20:30', 45, 20],
  [programId(5), staffId(2), [2, 4], '15:00', 50, 1],
  [programId(6), staffId(2), [2, 4], '10:00', 50, 8],
];

function keyOf(day: Date): string {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

/** 이번 주 월요일부터 3주치 수업. 셋째 주 번지피지오는 공개 예약 시연용(이번 주 일요일 오후 9시 공개) */
function seedSessions(now: Date): ProtoSession[] {
  const monday = startOfISOWeek(new Date(`${todayKey(TIME_ZONE, now)}T00:00:00`));
  const publishAt = localToUtc(keyOf(addDays(monday, 6)), '21:00', TIME_ZONE);
  const sessions: ProtoSession[] = [];
  TEMPLATE.forEach(([program, instructorId, weekdays, time, minutes, capacity], row) => {
    const groupId = `g${row}`;
    for (let offset = 0; offset < 21; offset += 1) {
      const day = addDays(monday, offset);
      const isoDay = ((day.getDay() + 6) % 7) + 1;
      if (!weekdays.includes(isoDay)) continue;
      const startsAt = localToUtc(keyOf(day), time, TIME_ZONE);
      const scheduled = program === PROGRAM_BUNGEE && offset >= 14;
      sessions.push({
        id: `s-${row}-${offset}`,
        program_id: program,
        instructor_id: instructorId,
        starts_at: startsAt,
        ends_at: new Date(Date.parse(startsAt) + minutes * 60_000).toISOString(),
        capacity,
        status: 'scheduled',
        note: null,
        recurrence_group_id: groupId,
        publish_at: scheduled ? publishAt : null,
        // 정원의 30~100% 사이에서 고르게 섞는다 (시연용)
        others_booked: Math.min(capacity, Math.round(capacity * (0.3 + ((row * 7 + offset * 3) % 8) / 10))),
      });
    }
  });
  return sessions;
}

export function createSeed(now: Date = new Date()): ProtoState {
  return {
    version: 1,
    center: CENTER,
    staff: [
      { id: staffId(1), name: '김대표', color: '#4F46E5' },
      { id: staffId(2), name: '이코치', color: '#0EA5E9' },
      { id: staffId(3), name: '박코치', color: '#F97316' },
    ],
    members: [
      { id: memberId(1), name: '홍길동', phone: '01012345678' },
      { id: memberId(2), name: '김민지', phone: '01023456789' },
      { id: memberId(3), name: '이서준', phone: '01034567890' },
      { id: memberId(4), name: '박지우', phone: '01045678901' },
      { id: memberId(5), name: '최유나', phone: '01056789012' },
    ],
    meId: ME_ID,
    privacyAgreedAt: null,
    marketingAgreedAt: null,
    programs: PROGRAMS,
    sessions: seedSessions(now),
    bookings: [],
  };
}
