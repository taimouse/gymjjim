/**
 * 가벼운 CSV 파서 (RFC 4180: 따옴표·따옴표 이스케이프·줄바꿈 포함 필드).
 * 엑셀에서 저장한 한국어 CSV 는 CP949(EUC-KR)인 경우가 많아 인코딩을 자동으로 판별한다.
 */

/** UTF-8 로 읽어 보고 깨지면 EUC-KR(CP949)로 다시 읽는다. BOM 은 제거 */
export function decodeCsv(buffer: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder('euc-kr').decode(buffer);
  }
  return text.replace(/^﻿/, '');
}

function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  const counts = [',', '\t', ';'].map((delimiter) => ({
    delimiter,
    count: firstLine.split(delimiter).length,
  }));
  counts.sort((a, b) => b.count - a.count);
  return counts[0]!.delimiter;
}

export function parseCsv(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === '') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

export const CSV_FIELDS = ['name', 'phone', 'birth', 'gender', 'memo', 'tags', 'joinedAt'] as const;
export type CsvField = (typeof CSV_FIELDS)[number];

const HEADER_HINTS: Record<CsvField, RegExp> = {
  name: /^(이름|성명|회원명|name)$/i,
  phone: /(전화|연락처|휴대|핸드폰|폰|phone|mobile|tel)/i,
  birth: /(생년월일|생일|birth)/i,
  gender: /(성별|gender|sex)/i,
  memo: /(메모|비고|특이사항|memo|note)/i,
  tags: /(태그|그룹|분류|tag)/i,
  joinedAt: /(가입일|등록일|joined|registered)/i,
};

/** 헤더 이름으로 컬럼 매핑을 추측한다. 값은 CSV 컬럼 번호(없으면 null) */
export function guessMapping(headers: string[]): Record<CsvField, number | null> {
  const mapping = Object.fromEntries(CSV_FIELDS.map((field) => [field, null])) as Record<
    CsvField,
    number | null
  >;
  headers.forEach((header, index) => {
    const value = header.trim();
    for (const field of CSV_FIELDS) {
      if (mapping[field] === null && HEADER_HINTS[field].test(value)) {
        mapping[field] = index;
        break;
      }
    }
  });
  return mapping;
}

/** 2026.09.24 / 2026/9/24 / 20260924 → 2026-09-24. 알 수 없는 형식은 그대로 */
export function normalizeDate(value: string): string {
  const text = value.trim();
  if (!text) return '';
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const parts = /^(\d{4})[-./ ](\d{1,2})[-./ ](\d{1,2})\.?$/.exec(text);
  if (parts) return `${parts[1]}-${parts[2]!.padStart(2, '0')}-${parts[3]!.padStart(2, '0')}`;
  return text;
}
