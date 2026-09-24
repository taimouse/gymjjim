import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * 명도 대비 (WCAG 2.x): globals.css 의 디자인 토큰을 읽어 실제로 쓰는 글자/배경 조합이
 * 본문 기준 4.5:1 이상인지 라이트·다크 모두 확인한다.
 */
const css = fs.readFileSync(path.join(import.meta.dirname, '../../src/app/globals.css'), 'utf8');

function blockAfter(source: string, marker: string): string {
  const open = source.indexOf('{', source.indexOf(marker));
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(open + 1, index);
  }
  throw new Error(`block not found: ${marker}`);
}

function declarations(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2]!.trim()]),
  );
}

const light = declarations(blockAfter(css, ':root {'));
const dark = {
  ...light,
  ...declarations(blockAfter(blockAfter(css, '@media (prefers-color-scheme: dark) {'), ':root')),
};

function resolve(tokens: Record<string, string>, name: string): string {
  let value = tokens[name];
  for (let depth = 0; value && depth < 10; depth += 1) {
    const reference = /^var\(--([\w-]+)\)$/.exec(value);
    if (!reference) return value;
    value = tokens[reference[1]!];
  }
  throw new Error(`cannot resolve --${name}`);
}

/** oklch(L C H) → 선형 sRGB → 상대 휘도 */
function luminance(value: string): number {
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(value);
  if (!match) throw new Error(`not an opaque oklch color: ${value}`);
  const [l, c, h] = [Number(match[1]), Number(match[2]), (Number(match[3]) * Math.PI) / 180];
  const [a, b] = [c * Math.cos(h), c * Math.sin(h)];
  const lms = [
    (l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    (l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    (l - 0.0894841775 * a - 1.291485548 * b) ** 3,
  ] as const;
  const rgb = [
    4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
    -1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
    -0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2],
  ].map((channel) => Math.min(1, Math.max(0, channel)));
  return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
}

function contrast(tokens: Record<string, string>, foreground: string, background: string): number {
  const [x, y] = [luminance(resolve(tokens, foreground)), luminance(resolve(tokens, background))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// [글자, 배경] — 컴포넌트에서 실제로 함께 쓰는 조합
const BODY_TEXT: [string, string][] = [
  ['foreground', 'background'],
  ['foreground', 'surface'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'muted'],
  ['muted-foreground', 'surface'],
  ['primary-foreground', 'primary'],
  ['primary', 'background'],
  ['primary', 'card'],
  ['secondary-foreground', 'secondary'],
  ['accent-foreground', 'accent'],
  ['brand-soft-foreground', 'brand-soft'],
  ['success-soft-foreground', 'success-soft'],
  ['warning-soft-foreground', 'warning-soft'],
  ['danger-soft-foreground', 'danger-soft'],
  ['info-soft-foreground', 'info-soft'],
  ['success-foreground', 'success'],
  ['danger-foreground', 'danger'],
  ['info-foreground', 'info'],
  ['warning-foreground', 'warning'],
  ['danger', 'background'],
  ['danger', 'card'],
  ['info', 'background'],
  ['info', 'card'],
  ['sidebar-foreground', 'sidebar'],
  ['sidebar-accent-foreground', 'sidebar-accent'],
  ['sidebar-primary-foreground', 'sidebar-primary'],
];

describe.each([
  ['라이트', light],
  ['다크', dark],
])('명도 대비 (%s)', (_, tokens) => {
  it.each(BODY_TEXT)('%s / %s ≥ 4.5:1', (foreground, background) => {
    expect(contrast(tokens, foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
});
