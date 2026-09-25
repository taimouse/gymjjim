// 개발용 인증 서버: 앱이 쓰는 Supabase Auth API 만 흉내 낸다 (/auth/v1/*).
// 비밀번호 로그인 · 토큰 갱신 · 매직링크(메일함으로) · 직원 초대 · 비밀번호 설정 · 로그아웃.
// 카카오 로그인은 지원하지 않는다 → 로그인 화면으로 돌려보낸다.
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { type AuthStore, type AuthUser, type SignOutScope } from './auth-store.mts';
import { API_URL, JWT_SECRET, SITE_URL } from './config.mts';
import { bearerToken, type JwtClaims, signJwt, verifyJwt } from './jwt.mts';

const ACCESS_TOKEN_SECONDS = 3600;

type Json = Record<string, unknown>;

function send(res: ServerResponse, status: number, body?: Json): void {
  res.writeHead(status, body ? { 'content-type': 'application/json' } : {});
  res.end(body ? JSON.stringify(body) : undefined);
}

/** GoTrue 와 같은 오류 형태 (auth-js 가 error_code·msg 를 읽는다) */
function fail(res: ServerResponse, status: number, errorCode: string, msg: string): void {
  send(res, status, { code: status, error_code: errorCode, msg });
}

async function readJson(req: IncomingMessage): Promise<Json> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  if (chunks.length === 0) return {};
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const record = (value: unknown): Json =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};

function userJson(user: AuthUser): Json {
  return {
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email ?? '',
    phone: '',
    email_confirmed_at: user.email_confirmed_at,
    confirmed_at: user.email_confirmed_at,
    invited_at: user.invited_at,
    last_sign_in_at: user.last_sign_in_at,
    app_metadata: user.raw_app_meta_data ?? {},
    user_metadata: user.raw_user_meta_data ?? {},
    identities: [],
    created_at: user.created_at,
    updated_at: user.updated_at,
    is_anonymous: false,
  };
}

/** Supabase 세션 응답: access token(1시간) + refresh token + user */
function sessionJson(user: AuthUser, sessionId: string, refreshToken: string, method: string): Json {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = signJwt(
    {
      aud: 'authenticated',
      exp: now + ACCESS_TOKEN_SECONDS,
      iat: now,
      iss: `${API_URL}/auth/v1`,
      sub: user.id,
      email: user.email ?? '',
      phone: '',
      app_metadata: user.raw_app_meta_data ?? {},
      user_metadata: user.raw_user_meta_data ?? {},
      role: 'authenticated',
      aal: 'aal1',
      amr: [{ method, timestamp: now }],
      session_id: sessionId,
      is_anonymous: false,
    },
    JWT_SECRET,
  );
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: ACCESS_TOKEN_SECONDS,
    expires_at: now + ACCESS_TOKEN_SECONDS,
    refresh_token: refreshToken,
    user: userJson(user),
  };
}

async function newSession(store: AuthStore, user: AuthUser, method: string): Promise<Json> {
  const sessionId = randomUUID();
  const refreshToken = await store.createRefreshToken(user.id, sessionId);
  return sessionJson(user, sessionId, refreshToken, method);
}

/** 메일 템플릿과 같은 링크: {{ .RedirectTo }}&token_hash=…&type=… */
function mailLink(redirectTo: string | null, tokenHash: string, type: string): string {
  const base = redirectTo || SITE_URL;
  return `${base}${base.includes('?') ? '&' : '?'}token_hash=${tokenHash}&type=${type}`;
}

/** 로그인한 사용자(authenticated) 토큰 확인. 로그아웃한 세션이면 null */
async function sessionClaims(req: IncomingMessage, store: AuthStore): Promise<JwtClaims | null> {
  const token = bearerToken(req.headers);
  const claims = token ? verifyJwt(token, JWT_SECRET) : null;
  if (!claims || claims.role !== 'authenticated' || typeof claims.sub !== 'string') return null;
  if (typeof claims.session_id === 'string' && !(await store.sessionActive(claims.session_id))) return null;
  return claims;
}

const OTP_TYPES: Record<string, string[]> = {
  email: ['magiclink', 'signup'],
  magiclink: ['magiclink', 'signup'],
  signup: ['signup'],
  invite: ['invite'],
};

export async function handleAuth(req: IncomingMessage, res: ServerResponse, url: URL, store: AuthStore) {
  const route = `${req.method} ${url.pathname.replace(/^\/auth\/v1/, '') || '/'}`;
  const redirectTo = url.searchParams.get('redirect_to');

  switch (route) {
    case 'GET /health':
      return send(res, 200, { name: 'gymjjim-dev-auth', description: '개발용 인증 서버' });
    case 'GET /settings':
      return send(res, 200, {
        external: { email: true, kakao: false },
        disable_signup: false,
        mailer_autoconfirm: false,
      });

    case 'POST /token': {
      const body = await readJson(req);
      const grant = url.searchParams.get('grant_type');
      if (grant === 'password') {
        const user = await store.verifyPassword(text(body.email), text(body.password));
        if (!user) return fail(res, 400, 'invalid_credentials', 'Invalid login credentials');
        if (!user.email_confirmed_at) return fail(res, 400, 'email_not_confirmed', 'Email not confirmed');
        const signedIn = (await store.update(user.id, { signedIn: true })) ?? user;
        return send(res, 200, await newSession(store, signedIn, 'password'));
      }
      if (grant === 'refresh_token') {
        const rotated = await store.rotateRefreshToken(text(body.refresh_token));
        const user = rotated ? await store.findById(rotated.userId) : null;
        if (!rotated || !user)
          return fail(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
        const refreshToken = await store.createRefreshToken(user.id, rotated.sessionId);
        return send(res, 200, sessionJson(user, rotated.sessionId, refreshToken, 'token_refresh'));
      }
      return fail(res, 400, 'unsupported_grant_type', `개발용 인증 서버가 지원하지 않는 방식: ${grant}`);
    }

    case 'POST /otp': {
      const body = await readJson(req);
      const email = text(body.email).toLowerCase();
      if (!email) return fail(res, 422, 'validation_failed', 'email required');
      let user = await store.findByEmail(email);
      const isNew = !user;
      if (!user) {
        if (body.create_user === false) return fail(res, 422, 'otp_disabled', 'Signups not allowed for otp');
        user = await store.createUser(email, { invited: false, metadata: record(body.data) });
      }
      const tokenHash = await store.createOneTimeToken(user.id, isNew ? 'signup' : 'magiclink');
      const link = mailLink(redirectTo, tokenHash, 'email');
      await store.sendMail(email, '로그인 링크', link);
      console.log(`  ✉  ${email} 로그인 링크: ${link}`);
      return send(res, 200, {});
    }

    case 'POST /verify': {
      const body = await readJson(req);
      const allowed = OTP_TYPES[text(body.type)] ?? [];
      const token = await store.consumeOneTimeToken(text(body.token_hash), allowed);
      if (!token) return fail(res, 403, 'otp_expired', 'Email link is invalid or has expired');
      const user = await store.update(token.user_id, { confirm: true, signedIn: true });
      if (!user) return fail(res, 404, 'user_not_found', 'User not found');
      return send(res, 200, await newSession(store, user, token.type === 'invite' ? 'invite' : 'otp'));
    }

    case 'GET /user':
    case 'PUT /user': {
      const claims = await sessionClaims(req, store);
      if (!claims)
        return fail(res, 403, 'session_not_found', 'Session from session_id claim in JWT does not exist');
      const userId = String(claims.sub);
      if (req.method === 'GET') {
        const user = await store.findById(userId);
        return user ? send(res, 200, userJson(user)) : fail(res, 403, 'user_not_found', 'User not found');
      }
      const body = await readJson(req);
      const password = typeof body.password === 'string' ? body.password : undefined;
      if (password !== undefined && password.length < 6)
        return send(res, 422, {
          code: 422,
          error_code: 'weak_password',
          msg: 'Password should be at least 6 characters.',
          weak_password: { reasons: ['length'] },
        });
      const user = await store.update(userId, {
        password,
        metadata: body.data ? record(body.data) : undefined,
      });
      return user ? send(res, 200, userJson(user)) : fail(res, 404, 'user_not_found', 'User not found');
    }

    case 'POST /logout': {
      const claims = await sessionClaims(req, store);
      if (claims && typeof claims.session_id === 'string') {
        const requested = url.searchParams.get('scope');
        const scope: SignOutScope = requested === 'local' || requested === 'others' ? requested : 'global';
        await store.revokeSessions(String(claims.sub), claims.session_id, scope);
      }
      return send(res, 204);
    }

    case 'POST /invite': {
      const token = bearerToken(req.headers);
      if (!token || verifyJwt(token, JWT_SECRET)?.role !== 'service_role')
        return fail(res, 401, 'not_admin', 'User not allowed');
      const body = await readJson(req);
      const email = text(body.email).toLowerCase();
      const existing = await store.findByEmail(email);
      if (existing?.email_confirmed_at)
        return fail(res, 422, 'email_exists', 'A user with this email address has already been registered');
      const user =
        existing ?? (await store.createUser(email, { invited: true, metadata: record(body.data) }));
      const tokenHash = await store.createOneTimeToken(user.id, 'invite');
      const link = mailLink(redirectTo, tokenHash, 'invite');
      await store.sendMail(email, '직원 초대', link);
      console.log(`  ✉  ${email} 직원 초대 링크: ${link}`);
      return send(res, 200, userJson(user));
    }

    case 'GET /authorize': {
      // 카카오 등 외부 로그인: 로컬 개발 스택에서는 쓸 수 없다 → 로그인 화면에 안내
      const origin = redirectTo ? new URL(redirectTo).origin : SITE_URL;
      res.writeHead(302, { location: `${origin}/login?error=KAKAO_UNAVAILABLE` });
      return res.end();
    }

    default:
      return fail(res, 404, 'not_found', `개발용 인증 서버에 없는 API: ${route}`);
  }
}
