/** 가짜 Supabase 의 RPC 목록 (이름은 실제 Postgres 함수와 같다) */
import { adminRpcs } from './admin';
import { bookingRpcs } from './booking';
import { creditRpcs } from './credits';
import { dashboardRpcs } from './dashboard';
import { memberAppRpcs } from './member-app';
import { memberRpcs } from './members';

export interface FakeRpc {
  /** 바뀌는 테이블 (저장·Realtime 알림 대상) */
  mutates: string[];
  run: (args: Record<string, unknown>) => unknown;
}

export const RPCS: Record<string, FakeRpc> = {
  ...bookingRpcs,
  ...memberRpcs,
  ...memberAppRpcs,
  ...dashboardRpcs,
  ...adminRpcs,
  ...creditRpcs,
};
