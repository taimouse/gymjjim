import { z } from 'zod';

/**
 * JWT app_metadata.gymjjim 에 담긴 소속 정보 (DB 트리거가 동기화).
 * 라우팅을 빠르게 하는 용도일 뿐이며, 실제 권한은 서버(RLS·RPC)와 레이아웃의 DB 조회가 판단한다.
 */
const rolesSchema = z.object({
  staff: z.array(z.object({ center_id: z.string(), role: z.enum(['owner', 'staff']) })).default([]),
  member: z.array(z.object({ center_id: z.string(), member_id: z.string() })).default([]),
  platform: z.boolean().default(false),
});

export type RoleClaims = z.infer<typeof rolesSchema>;

/** 클레임이 없거나 형식이 다르면 null (= 판단 보류, DB 로 확인) */
export function parseRoleClaims(appMetadata: unknown): RoleClaims | null {
  if (!appMetadata || typeof appMetadata !== 'object') return null;
  const raw = (appMetadata as Record<string, unknown>).gymjjim;
  const parsed = rolesSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export type Area = 'admin' | 'platform' | 'member' | 'public' | 'root';

const PUBLIC_PREFIXES = ['/login', '/admin-login', '/invite', '/auth', '/403', '/offline', '/privacy'];

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function areaOf(pathname: string): Area {
  if (pathname === '/') return 'root';
  if (PUBLIC_PREFIXES.some((prefix) => matches(pathname, prefix))) return 'public';
  if (matches(pathname, '/admin')) return 'admin';
  if (matches(pathname, '/platform')) return 'platform';
  return 'member';
}

/** 영역별 접근 판단. null 이면 클레임만으로는 판단하지 않고 통과시킨다. */
export function canEnter(area: Area, roles: RoleClaims | null): boolean | null {
  if (!roles) return null;
  if (area === 'admin') return roles.staff.length > 0;
  if (area === 'platform') return roles.platform;
  if (area === 'member') return roles.member.length > 0;
  return true;
}
