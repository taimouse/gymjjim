// HS256 JWT (개발 스택 전용). Supabase 로컬처럼 대칭키 하나로 anon·service_role·세션 토큰을 서명한다.
import { createHmac, timingSafeEqual } from 'node:crypto';

export type JwtClaims = Record<string, unknown>;

const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

function signature(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('base64url');
}

export function signJwt(claims: JwtClaims, secret: string): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${HEADER}.${payload}.${signature(`${HEADER}.${payload}`, secret)}`;
}

/** 서명·만료를 확인하고 클레임을 돌려준다. 잘못된 토큰이면 null */
export function verifyJwt(token: string, secret: string): JwtClaims | null {
  const [header, payload, sig] = token.split('.');
  if (!header || !payload || !sig) return null;
  const expected = Buffer.from(signature(`${header}.${payload}`, secret));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return null;
    const exp = (claims as JwtClaims).exp;
    if (typeof exp === 'number' && exp * 1000 < Date.now()) return null;
    return claims as JwtClaims;
  } catch {
    return null;
  }
}

/** Authorization: Bearer <token> 또는 apikey 헤더에서 토큰을 꺼낸다 */
export function bearerToken(headers: Record<string, string | string[] | undefined>): string | null {
  const authorization = headers.authorization;
  if (typeof authorization === 'string' && authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }
  return typeof headers.apikey === 'string' ? headers.apikey : null;
}
