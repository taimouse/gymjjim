// 프로토타입 빌드 전용 로더: 서버 액션 파일의 'use server' 와 import 'server-only' 를 떼서
// 브라우저에서 그대로 실행되게 한다. (DB 클라이언트는 next.config 의 resolveAlias 로 브라우저 안의 가짜 DB 로 바뀐다)
module.exports = function stripServerOnly(source) {
  return source
    .replace(/^(\s*)(['"])use server\2;?/, '$1/* prototype: use server removed */')
    .replace(/^import\s+(['"])server-only\1;?[ \t\r]*$/m, '/* prototype: server-only removed */');
};
