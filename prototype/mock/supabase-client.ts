/**
 * @/lib/supabase/client · server · admin 대신 쓰는 가짜 Supabase 클라이언트.
 * 테이블 조회는 query.ts, RPC 는 rpc/ 의 함수가 브라우저 DB(db.ts)로 처리한다.
 */
import { AppError, commit, ME_MEMBER_ID, onChange, OWNER_STAFF_ID, restore, snapshot } from './db';
import { QueryBuilder } from './query';
import { RPCS } from './rpc';
import { currentUser } from './session';

type Handler = { table: string | undefined; callback: (payload: unknown) => void };

class FakeChannel {
  private handlers: Handler[] = [];
  private stop: (() => void) | null = null;

  on(_type: string, filter: { table?: string }, callback: (payload: unknown) => void) {
    this.handlers.push({ table: filter.table, callback });
    return this;
  }
  subscribe() {
    // 브라우저 DB 가 바뀌면 Realtime 처럼 알린다
    this.stop = onChange((changed) => {
      for (const handler of this.handlers) {
        if (!handler.table || changed.has(handler.table))
          handler.callback({ eventType: 'UPDATE', new: {}, old: {} });
      }
    });
    return this;
  }
  unsubscribe() {
    this.stop?.();
    return Promise.resolve('ok');
  }
}

const client = {
  from: (name: string) => new QueryBuilder(name),
  async rpc(name: string, args: Record<string, unknown> = {}) {
    const fn = RPCS[name];
    if (!fn) return { data: null, error: { message: 'UNKNOWN', code: 'PGRST202' } };
    const saved = fn.mutates.length ? snapshot() : null;
    try {
      const result = fn.run(args);
      if (fn.mutates.length) commit(fn.mutates);
      return { data: result ?? null, error: null };
    } catch (error) {
      if (saved) restore(saved);
      if (error instanceof AppError) return { data: null, error: { message: error.message } };
      console.error(`[prototype] rpc ${name}`, error);
      return { data: null, error: { message: 'UNKNOWN' } };
    }
  },
  channel: () => new FakeChannel(),
  removeChannel: (channel: FakeChannel) => channel.unsubscribe(),
  auth: {
    getUser: async () => ({ data: { user: currentUser() }, error: null }),
    getClaims: async () => ({ data: { claims: { sub: currentUser().id } }, error: null }),
    signOut: async () => ({ error: null }),
    admin: {
      // 직원 초대 메일: 프로토타입에서는 보내지 않고 계정만 만든 것으로 친다
      inviteUserByEmail: async () => ({ data: { user: { id: crypto.randomUUID() } }, error: null }),
      generateLink: async () => ({ data: { properties: { action_link: '#' } }, error: null }),
    },
  },
};

export type FakeClient = typeof client;

/** 브라우저 클라이언트 (@/lib/supabase/client) */
export function createClient() {
  return client as never;
}

export { ME_MEMBER_ID, OWNER_STAFF_ID };
