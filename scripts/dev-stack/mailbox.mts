// 개발용 메일함: 실제 메일 대신 로그인·초대 링크를 모아 보여준다 (Supabase 로컬의 Inbucket 역할)
import type { AuthStore } from './auth-store.mts';

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const TIME = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
});

export async function renderMailbox(store: AuthStore): Promise<string> {
  const mails = await store.recentMails(50);
  const rows = mails
    .map(
      (mail) => `<tr>
  <td>${escape(TIME.format(mail.created_at))}</td>
  <td>${escape(mail.recipient)}</td>
  <td>${escape(mail.subject)}</td>
  <td><a href="${escape(mail.link)}">링크 열기</a></td>
</tr>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="5">
<title>gymjjim 개발용 메일함</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; color: #1f2937; }
  h1 { font-size: 20px; }
  p { color: #6b7280; }
  table { border-collapse: collapse; width: 100%; max-width: 960px; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; }
  a { color: #4d51de; font-weight: 600; }
</style>
</head>
<body>
<h1>개발용 메일함</h1>
<p>로컬 개발 스택은 메일을 보내지 않고 여기에 모읍니다. 5초마다 새로고침돼요. 링크는 1시간 동안 한 번만 쓸 수 있어요.</p>
<table>
<thead><tr><th>받은 시각</th><th>받는 사람</th><th>종류</th><th>링크</th></tr></thead>
<tbody>
${rows || '<tr><td colspan="4">아직 받은 메일이 없어요.</td></tr>'}
</tbody>
</table>
</body>
</html>`;
}
