/**
 * 회원 화면용 "이 이용권·크레딧으로 들을 수 있는 수업".
 * 서버(내 정보 페이지)와 클라이언트(프로토타입)에서 함께 쓰므로 'use client' 를 붙이지 않는다.
 */

/** programs 조회 select 문자열 (회원도 RLS 로 자기 센터의 공개된 프로그램만 본다) */
export const PROGRAM_USAGE_SELECT = 'id, name, color, credit_cost, program_allowed_products(product_id)';

export interface ProgramUsageRow {
  id: string;
  name: string;
  color: string;
  credit_cost: number | null;
  program_allowed_products: { product_id: string }[];
}

export interface UsableProgram {
  id: string;
  name: string;
  color: string;
}

/** 이 상품(이용권)으로 예약할 수 있는 프로그램 */
export function programsForProduct(rows: ProgramUsageRow[], productId: string | null): UsableProgram[] {
  if (!productId) return [];
  return rows
    .filter((row) => row.program_allowed_products.some((link) => link.product_id === productId))
    .map(({ id, name, color }) => ({ id, name, color }));
}

/** 크레딧으로 예약할 수 있는 프로그램과 1회 차감 크레딧 */
export function creditPrograms(rows: ProgramUsageRow[]): (UsableProgram & { cost: number })[] {
  return rows.flatMap(({ id, name, color, credit_cost }) =>
    credit_cost === null ? [] : [{ id, name, color, cost: credit_cost }],
  );
}
