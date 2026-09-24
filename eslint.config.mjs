import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// JSX 텍스트에 그대로 써도 되는 기호 (화면 문구는 next-intl 메시지 키로만 쓴다)
const ALLOWED_JSX_STRINGS = [
  '·',
  '/',
  '-',
  '–',
  '—',
  '~',
  ':',
  '|',
  '(',
  ')',
  '%',
  '+',
  '×',
  '•',
  '…',
  '*',
  '⌘K',
];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // CLAUDE.md 6번: 한 파일이 300줄을 넘으면 분리
      'max-lines': ['error', { max: 300, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    // CLAUDE.md 6번: 화면 문자열 하드코딩 금지
    files: ['src/app/**/*.tsx', 'src/components/**/*.tsx'],
    ignores: ['src/components/ui/**'],
    rules: {
      'react/jsx-no-literals': [
        'error',
        { noStrings: false, allowedStrings: ALLOWED_JSX_STRINGS, ignoreProps: true },
      ],
    },
  },
  {
    // shadcn 원본 컴포넌트와 자동 생성 파일은 길이 제한에서 제외
    files: ['src/components/ui/**', 'src/lib/supabase/database.types.ts'],
    rules: { 'max-lines': 'off' },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    '.cache/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'public/sw.js',
    'public/swe-worker-*.js',
    'supabase/functions/**',
  ]),
]);
