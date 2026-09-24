/**
 * 로그인 후 이동할 경로(next)를 같은 사이트의 상대 경로로만 허용한다.
 * `//evil.com`, `/\evil.com`, `https://…` 같은 오픈 리다이렉트를 막는다.
 */
export function safeNext(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1000) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  try {
    const url = new URL(value, 'http://localhost');
    if (url.origin !== 'http://localhost') return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
