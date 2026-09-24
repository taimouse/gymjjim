/** 타입 생성기는 RPC 의 returns table 컬럼을 모두 non-null 로 만든다. 실제로 null 이 올 수 있는 컬럼을 바로잡는다. */
export type WithNullable<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };
