// 개발용 인증 서버의 저장소: auth.users(시드 계정 포함)와 dev_stack 의 세션·일회용 토큰·메일함
import { randomBytes } from 'node:crypto';

import type pg from 'pg';

export interface AuthUser {
  id: string;
  email: string | null;
  email_confirmed_at: Date | null;
  invited_at: Date | null;
  last_sign_in_at: Date | null;
  raw_app_meta_data: Record<string, unknown> | null;
  raw_user_meta_data: Record<string, unknown> | null;
  created_at: Date | null;
  updated_at: Date | null;
}

const USER_COLUMNS =
  'id, email, email_confirmed_at, invited_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at';

export type SignOutScope = 'global' | 'local' | 'others';

export function createAuthStore(pool: pg.Pool) {
  async function one(sql: string, params: unknown[]): Promise<AuthUser | null> {
    const { rows } = await pool.query<AuthUser>(sql, params);
    return rows[0] ?? null;
  }

  return {
    findById(id: string) {
      return one(`select ${USER_COLUMNS} from auth.users where id = $1 and deleted_at is null`, [id]);
    },

    findByEmail(email: string) {
      return one(
        `select ${USER_COLUMNS} from auth.users where lower(email) = lower($1) and deleted_at is null`,
        [email],
      );
    },

    /** 비밀번호가 맞으면 사용자 (pgcrypto bcrypt — 시드와 같은 방식) */
    verifyPassword(email: string, password: string) {
      return one(
        `select ${USER_COLUMNS} from auth.users
         where lower(email) = lower($1) and deleted_at is null and coalesce(encrypted_password, '') <> ''
           and encrypted_password = extensions.crypt($2, encrypted_password)`,
        [email, password],
      );
    },

    async createUser(email: string, options: { invited: boolean; metadata: Record<string, unknown> }) {
      const user = await one(
        `insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
           invited_at, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new,
           email_change)
         values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
           lower($1), '{"provider":"email","providers":["email"]}', $2, case when $3 then now() end, now(), now(),
           '', '', '', '')
         returning ${USER_COLUMNS}`,
        [email, JSON.stringify(options.metadata), options.invited],
      );
      if (!user) throw new Error('사용자를 만들지 못했습니다.');
      await pool.query(
        `insert into auth.identities (user_id, provider_id, identity_data, provider, created_at, updated_at)
         values ($1, $2, jsonb_build_object('sub', $2::text, 'email', $3::text), 'email', now(), now())`,
        [user.id, user.id, user.email],
      );
      return user;
    },

    async update(
      id: string,
      changes: {
        password?: string;
        metadata?: Record<string, unknown>;
        confirm?: boolean;
        signedIn?: boolean;
      },
    ) {
      return one(
        `update auth.users set
           encrypted_password = coalesce(extensions.crypt($2, extensions.gen_salt('bf')), encrypted_password),
           raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || coalesce($3::jsonb, '{}'::jsonb),
           email_confirmed_at = case when $4 then coalesce(email_confirmed_at, now()) else email_confirmed_at end,
           last_sign_in_at = case when $5 then now() else last_sign_in_at end,
           updated_at = now()
         where id = $1
         returning ${USER_COLUMNS}`,
        [
          id,
          changes.password ?? null,
          changes.metadata ? JSON.stringify(changes.metadata) : null,
          changes.confirm ?? false,
          changes.signedIn ?? false,
        ],
      );
    },

    async createRefreshToken(userId: string, sessionId: string): Promise<string> {
      const token = randomBytes(24).toString('base64url');
      await pool.query(
        'insert into dev_stack.refresh_tokens (token, user_id, session_id) values ($1, $2, $3)',
        [token, userId, sessionId],
      );
      return token;
    },

    /** 쓴 refresh token 은 바로 폐기하고 같은 세션의 새 토큰을 준다 (Supabase 와 같은 회전 방식) */
    async rotateRefreshToken(token: string) {
      const { rows } = await pool.query<{ user_id: string; session_id: string }>(
        `update dev_stack.refresh_tokens set revoked = true where token = $1 and not revoked
         returning user_id, session_id`,
        [token],
      );
      const row = rows[0];
      if (!row) return null;
      return { userId: row.user_id, sessionId: row.session_id };
    },

    async sessionActive(sessionId: string): Promise<boolean> {
      const { rowCount } = await pool.query(
        'select 1 from dev_stack.refresh_tokens where session_id = $1 and not revoked limit 1',
        [sessionId],
      );
      return (rowCount ?? 0) > 0;
    },

    async revokeSessions(userId: string, sessionId: string, scope: SignOutScope) {
      const condition =
        scope === 'global' ? 'true' : scope === 'local' ? 'session_id = $2' : 'session_id <> $2';
      await pool.query(
        `update dev_stack.refresh_tokens set revoked = true where user_id = $1 and ${condition}`,
        [userId, sessionId],
      );
    },

    async createOneTimeToken(userId: string, type: 'magiclink' | 'signup' | 'invite'): Promise<string> {
      const tokenHash = randomBytes(28).toString('hex');
      await pool.query(
        'insert into dev_stack.one_time_tokens (token_hash, user_id, type) values ($1, $2, $3)',
        [tokenHash, userId, type],
      );
      return tokenHash;
    },

    /** 메일 링크는 1시간 동안 한 번만 쓸 수 있다 */
    async consumeOneTimeToken(tokenHash: string, types: string[]) {
      const { rows } = await pool.query<{ user_id: string; type: string }>(
        `update dev_stack.one_time_tokens set used_at = now()
         where token_hash = $1 and used_at is null and created_at > now() - interval '1 hour' and type = any($2)
         returning user_id, type`,
        [tokenHash, types],
      );
      return rows[0] ?? null;
    },

    async sendMail(recipient: string, subject: string, link: string) {
      await pool.query('insert into dev_stack.mails (recipient, subject, link) values ($1, $2, $3)', [
        recipient,
        subject,
        link,
      ]);
    },

    async recentMails(limit: number) {
      const { rows } = await pool.query<{
        recipient: string;
        subject: string;
        link: string;
        created_at: Date;
      }>('select recipient, subject, link, created_at from dev_stack.mails order by id desc limit $1', [
        limit,
      ]);
      return rows;
    },
  };
}

export type AuthStore = ReturnType<typeof createAuthStore>;
