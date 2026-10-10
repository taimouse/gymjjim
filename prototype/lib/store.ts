'use client';

import { useSyncExternalStore } from 'react';

import { createSeed } from './seed';
import type { ProtoProgram, ProtoSession, ProtoState } from './types';

/**
 * 프로토타입 저장소: 메모리 + localStorage. 서버(DB) 대신 이 브라우저 안에서만 바뀐다.
 * 정적 HTML 을 만들 때(prerender)는 null 이라 화면은 불러오는 중 상태로 그려진다.
 */
// 저장 모양이 바뀌면 키를 올린다 (예전 데이터는 버리고 처음 상태로)
const STORAGE_KEY = 'jackygym-prototype-v2';

let state: ProtoState | null = null;
const listeners = new Set<() => void>();

function load(): ProtoState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProtoState;
      if (parsed.version === 1) return parsed;
    }
  } catch {
    // 저장소를 못 쓰는 브라우저(사생활 보호 모드 등)는 매번 처음 상태로 시작한다
  }
  return createSeed();
}

function save(next: ProtoState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 저장 실패는 무시 (이번 방문 동안은 메모리에 남는다)
  }
}

function getSnapshot(): ProtoState | null {
  if (typeof window === 'undefined') return null;
  state ??= load();
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function update(recipe: (current: ProtoState) => ProtoState) {
  const current = getSnapshot();
  if (!current) return;
  state = recipe(current);
  save(state);
  listeners.forEach((listener) => listener());
}

export function useProtoState(): ProtoState | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

// 폼 스키마(z.uuid)를 통과하도록 uuid 로 만든다
const newId = () => crypto.randomUUID();

/** 내 예약 기준 예약 인원 (다른 회원 + 나) */
export function bookedCount(current: ProtoState, session: ProtoSession): number {
  const mine = current.bookings.some((b) => b.session_id === session.id && b.status === 'booked');
  return Math.min(session.capacity + 1, session.others_booked + (mine ? 1 : 0));
}

export function isPublished(current: ProtoState, session: ProtoSession, now = Date.now()): boolean {
  const program = current.programs.find((p) => p.id === session.program_id);
  const times = [session.publish_at, program?.publish_at ?? null];
  return times.every((value) => !value || Date.parse(value) <= now);
}

export const protoActions = {
  reset: () => update(() => createSeed()),

  completeOnboarding: (marketing: boolean) =>
    update((s) => {
      const now = new Date().toISOString();
      return { ...s, privacyAgreedAt: now, marketingAgreedAt: marketing ? now : null };
    }),
  resetOnboarding: () => update((s) => ({ ...s, privacyAgreedAt: null, marketingAgreedAt: null })),
  setMarketing: (on: boolean) =>
    update((s) => ({ ...s, marketingAgreedAt: on ? new Date().toISOString() : null })),

  /** 예약: 자리가 있으면 예약, 없으면 대기 (실제 앱의 book_session 과 같은 결과) */
  book: (sessionId: string): 'booked' | 'waitlisted' | null => {
    const current = getSnapshot();
    const session = current?.sessions.find((s) => s.id === sessionId);
    if (!current || !session) return null;
    const full = bookedCount(current, session) >= session.capacity;
    const status = full ? 'waitlisted' : 'booked';
    update((s) => ({
      ...s,
      bookings: [
        ...s.bookings.filter((b) => b.session_id !== sessionId),
        {
          id: newId(),
          session_id: sessionId,
          status,
          waitlist_position: full ? 1 : null,
          created_at: new Date().toISOString(),
        },
      ],
    }));
    return status;
  },
  cancel: (sessionId: string) =>
    update((s) => ({
      ...s,
      bookings: s.bookings.map((b) =>
        b.session_id === sessionId && b.status !== 'cancelled' ? { ...b, status: 'cancelled' } : b,
      ),
    })),

  saveProgram: (program: Omit<ProtoProgram, 'id'> & { id?: string }) =>
    update((s) => {
      if (!program.id) return { ...s, programs: [...s.programs, { ...program, id: newId() }] };
      return { ...s, programs: s.programs.map((p) => (p.id === program.id ? { ...p, ...program } : p)) };
    }),
  deleteProgram: (id: string) =>
    update((s) => ({
      ...s,
      programs: s.programs.filter((p) => p.id !== id),
      sessions: s.sessions.filter((session) => session.program_id !== id),
    })),

  createSessions: (sessions: Array<Omit<ProtoSession, 'id' | 'recurrence_group_id' | 'others_booked'>>) =>
    update((s) => {
      const groupId = sessions.length > 1 ? newId() : null;
      return {
        ...s,
        sessions: [
          ...s.sessions,
          ...sessions.map((session) => ({
            ...session,
            id: newId(),
            recurrence_group_id: groupId,
            others_booked: 0,
          })),
        ],
      };
    }),
  moveSession: (id: string, startsAt: string, endsAt: string) =>
    update((s) => ({
      ...s,
      sessions: s.sessions.map((session) =>
        session.id === id ? { ...session, starts_at: startsAt, ends_at: endsAt } : session,
      ),
    })),
  /** 지금 공개: 이 수업 또는 같은 반복의 이후 수업 전체 */
  publishNow: (id: string, scope: 'this' | 'following') =>
    update((s) => {
      const target = s.sessions.find((session) => session.id === id);
      if (!target) return s;
      const hit = (session: ProtoSession) =>
        session.id === id ||
        (scope === 'following' &&
          !!target.recurrence_group_id &&
          session.recurrence_group_id === target.recurrence_group_id &&
          session.starts_at >= target.starts_at);
      return {
        ...s,
        sessions: s.sessions.map((session) => (hit(session) ? { ...session, publish_at: null } : session)),
      };
    }),
  deleteSession: (id: string) =>
    update((s) => ({
      ...s,
      sessions: s.sessions.filter((session) => session.id !== id),
      bookings: s.bookings.filter((b) => b.session_id !== id),
    })),
};
