/** 공개 예약 판단 (화면 공용 · 서버 의존 없음) */
export interface PublishTimes {
  publish_at: string | null;
  program: { publish_at: string | null } | null;
}

/** 수업이 아직 회원에게 안 보이면 공개 시각(수업·프로그램 중 늦은 쪽), 공개됐으면 null */
export function pendingPublishAt(session: PublishTimes, now = Date.now()): string | null {
  const times = [session.publish_at, session.program?.publish_at].filter(
    (value): value is string => !!value && new Date(value).getTime() > now,
  );
  return times.sort().at(-1) ?? null;
}
