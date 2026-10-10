// 정적 export 뒤처리 (pnpm proto:build 가 실행)
// 1) 라우터가 미리 받는 세그먼트 파일을 요청 이름(점 구분)으로도 둔다.
//    export 결과는 `m/book/__next.m/book/__PAGE__.txt` 처럼 폴더로 나오는데
//    브라우저는 `m/book/__next.m.book.__PAGE__.txt` 를 요청해서 정적 호스팅에서는 404 가 난다.
// 2) GitHub Pages 가 _next 폴더를 건너뛰지 않도록 .nojekyll 을 둔다.
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '..', 'out');

function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

let copied = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (entry.name === '_next') continue;
    if (entry.name.startsWith('__next.')) {
      for (const file of filesUnder(full)) {
        const flat = [entry.name, ...path.relative(full, file).split(path.sep)].join('.');
        fs.copyFileSync(file, path.join(dir, flat));
        copied += 1;
      }
      continue;
    }
    walk(full);
  }
}

if (!fs.existsSync(OUT)) {
  console.error(`정적 export 결과가 없어요: ${OUT}`);
  process.exit(1);
}
walk(OUT);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log(`✓ prototype/out 정리: 세그먼트 파일 ${copied}개, .nojekyll`);
