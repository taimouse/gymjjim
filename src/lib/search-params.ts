/** searchParams 값 중 첫 번째 문자열만 꺼낸다 */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
