import { type CsvField, normalizeDate } from '@/lib/csv';

import { type CsvMemberInput, type CsvMemberOutput, csvMemberSchema } from './schema';

export type CsvMapping = Record<CsvField, number | null>;

export type PreviewStatus = 'ok' | 'invalid' | 'existing' | 'duplicate';

export interface PreviewRow {
  /** 원본 파일의 줄 번호 (1부터) */
  line: number;
  input: CsvMemberInput;
  status: PreviewStatus;
  errorFields: (keyof CsvMemberInput)[];
  output?: CsvMemberOutput;
}

function cell(row: string[], index: number | null): string {
  return index === null ? '' : (row[index] ?? '').trim();
}

/** 매핑한 컬럼으로 행을 만들고 검증한다. 같은 파일 안 중복·이미 등록된 번호도 표시 */
export function buildPreview(
  rows: string[][],
  mapping: CsvMapping,
  hasHeader: boolean,
  existingPhones: ReadonlySet<string>,
): PreviewRow[] {
  const seen = new Set<string>();
  const body = hasHeader ? rows.slice(1) : rows;
  return body.map((row, index) => {
    const input: CsvMemberInput = {
      name: cell(row, mapping.name),
      phone: cell(row, mapping.phone),
      birth: normalizeDate(cell(row, mapping.birth)),
      gender: cell(row, mapping.gender),
      memo: cell(row, mapping.memo),
      tags: cell(row, mapping.tags),
      joinedAt: normalizeDate(cell(row, mapping.joinedAt)),
    };
    const line = index + (hasHeader ? 2 : 1);
    const parsed = csvMemberSchema.safeParse(input);
    if (!parsed.success) {
      const errorFields = Array.from(
        new Set(
          parsed.error.issues
            .map((issue) => issue.path[0])
            .filter((key): key is keyof CsvMemberInput => typeof key === 'string'),
        ),
      );
      return { line, input, status: 'invalid', errorFields };
    }
    if (existingPhones.has(parsed.data.phone)) {
      return { line, input, status: 'existing', errorFields: [], output: parsed.data };
    }
    if (seen.has(parsed.data.phone)) {
      return { line, input, status: 'duplicate', errorFields: ['phone'], output: parsed.data };
    }
    seen.add(parsed.data.phone);
    return { line, input, status: 'ok', errorFields: [], output: parsed.data };
  });
}

export function summarize(preview: PreviewRow[]) {
  return {
    valid: preview.filter((row) => row.status === 'ok').length,
    invalid: preview.filter((row) => row.status === 'invalid' || row.status === 'duplicate').length,
    existing: preview.filter((row) => row.status === 'existing').length,
  };
}
