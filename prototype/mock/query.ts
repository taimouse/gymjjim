/**
 * PostgREST 쿼리 빌더 흉내 (실제 앱이 쓰는 만큼만):
 * select(임베드 포함) · insert · update · delete · eq/neq/is/in/gte/gt/lt/lte · order · limit · range · single · maybeSingle
 */
import { commit, nowIso, type Row, table, uuid } from './db';
import { applyDefaults } from './defaults';

type Filter = (row: Row) => boolean;
type Order = { column: string; ascending: boolean; nullsFirst: boolean };

interface Result {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

/** 테이블 이름 → 다른 테이블에서 이 테이블을 가리키는 컬럼 접두어 */
const SINGULAR: Record<string, string> = {
  members: 'member',
  member_passes: 'member_pass',
  pass_products: 'product',
  pass_holds: 'hold',
  programs: 'program',
  sessions: 'session',
  staff: 'staff',
  centers: 'center',
  bookings: 'booking',
  program_allowed_products: 'program_allowed_product',
  notification_logs: 'notification_log',
};

/** `table!제약이름` 힌트 → 부모 행의 외래 키 컬럼 */
const FK_HINTS: Record<string, string> = {
  sessions_instructor_fk: 'instructor_id',
  bookings_pass_center_fk: 'member_pass_id',
  notification_logs_member_fk: 'member_id',
};

interface Embed {
  alias: string;
  table: string;
  hint: string | null;
  fields: Field[];
}
type Field = { kind: 'all' } | { kind: 'column'; name: string } | { kind: 'embed'; embed: Embed };

/** 'id, name, program:programs(id, name), instructor:staff!sessions_instructor_fk(id)' 파싱 */
function parseSelect(text: string): Field[] {
  const fields: Field[] = [];
  let depth = 0;
  let current = '';
  const flush = () => {
    const part = current.trim();
    current = '';
    if (!part) return;
    if (part === '*') return fields.push({ kind: 'all' });
    const open = part.indexOf('(');
    if (open < 0) return fields.push({ kind: 'column', name: part });
    const head = part.slice(0, open);
    const inner = part.slice(open + 1, part.lastIndexOf(')'));
    const [aliasOrTable, rest] = head.includes(':') ? head.split(':') : [null, head];
    const [tableName, hint] = (rest ?? head).split('!') as [string, string | undefined];
    fields.push({
      kind: 'embed',
      embed: {
        alias: aliasOrTable ?? tableName,
        table: tableName,
        hint: hint ?? null,
        fields: parseSelect(inner),
      },
    });
  };
  for (const char of text) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) flush();
    else current += char;
  }
  flush();
  return fields;
}

function resolveEmbed(parentTable: string, parent: Row, embed: Embed): unknown {
  const localKey = embed.hint ? FK_HINTS[embed.hint] : `${SINGULAR[embed.table] ?? embed.table}_id`;
  if (localKey && localKey in parent) {
    const target = table(embed.table).find((row) => row.id === parent[localKey]);
    return target ? project(embed.table, target, embed.fields) : null;
  }
  const foreignKey = `${SINGULAR[parentTable] ?? parentTable}_id`;
  return table(embed.table)
    .filter((row) => row[foreignKey] === parent.id)
    .map((row) => project(embed.table, row, embed.fields));
}

function project(tableName: string, row: Row, fields: Field[]): Row {
  const out: Row = {};
  for (const field of fields) {
    if (field.kind === 'all') Object.assign(out, row);
    else if (field.kind === 'column') out[field.name] = row[field.name] ?? null;
    else out[field.embed.alias] = resolveEmbed(tableName, row, field.embed);
  }
  return out;
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return String(a) < String(b) ? -1 : 1;
}

export class QueryBuilder implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private limitCount: number | null = null;
  private offset = 0;
  private selectText: string | null = null;
  private mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: Row[] = [];
  private patch: Row = {};
  private countExact = false;
  private singleMode: 'one' | 'maybe' | null = null;

  constructor(private readonly name: string) {}

  select(columns = '*', options?: { count?: string; head?: boolean }) {
    this.selectText = columns;
    if (options?.count === 'exact') this.countExact = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.mode = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(values: Row, options?: { count?: string }) {
    this.mode = 'update';
    this.patch = values;
    if (options?.count === 'exact') this.countExact = true;
    return this;
  }
  delete(options?: { count?: string }) {
    this.mode = 'delete';
    if (options?.count === 'exact') this.countExact = true;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }
  is(column: string, value: unknown) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  gte(column: string, value: unknown) {
    this.filters.push((row) => compare(row[column], value) >= 0);
    return this;
  }
  gt(column: string, value: unknown) {
    this.filters.push((row) => compare(row[column], value) > 0);
    return this;
  }
  lt(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== null && compare(row[column], value) < 0);
    return this;
  }
  lte(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== null && compare(row[column], value) <= 0);
    return this;
  }
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push({
      column,
      ascending: options?.ascending ?? true,
      nullsFirst: options?.nullsFirst ?? !(options?.ascending ?? true),
    });
    return this;
  }
  limit(count: number) {
    this.limitCount = count;
    return this;
  }
  range(from: number, to: number) {
    this.offset = from;
    this.limitCount = to - from + 1;
    return this;
  }
  maybeSingle() {
    this.singleMode = 'maybe';
    return this;
  }
  single() {
    this.singleMode = 'one';
    return this;
  }

  private matching(): Row[] {
    let rows = table(this.name).filter((row) => this.filters.every((filter) => filter(row)));
    for (const order of [...this.orders].reverse()) {
      rows = [...rows].sort((a, b) => {
        const left = a[order.column] ?? null;
        const right = b[order.column] ?? null;
        if (left === null || right === null) {
          if (left === right) return 0;
          return (left === null) === order.nullsFirst ? -1 : 1;
        }
        return order.ascending ? compare(left, right) : compare(right, left);
      });
    }
    return rows;
  }

  private execute(): Result {
    let rows: Row[];
    if (this.mode === 'insert') {
      rows = this.payload.map((values) =>
        applyDefaults(this.name, { id: uuid(), created_at: nowIso(), updated_at: nowIso(), ...values }),
      );
      table(this.name).push(...rows);
      commit([this.name]);
    } else if (this.mode === 'update') {
      rows = this.matching();
      for (const row of rows) Object.assign(row, this.patch, { updated_at: nowIso() });
      if (rows.length) commit([this.name]);
    } else if (this.mode === 'delete') {
      rows = this.matching();
      const all = table(this.name);
      for (const row of rows) all.splice(all.indexOf(row), 1);
      if (rows.length) commit([this.name]);
    } else {
      rows = this.matching();
    }
    const count = rows.length;
    if (this.mode === 'select')
      rows = rows.slice(this.offset, this.limitCount === null ? undefined : this.offset + this.limitCount);

    const fields = parseSelect(this.selectText ?? '*');
    const shaped =
      this.selectText === null && this.mode !== 'select'
        ? null
        : rows.map((row) => project(this.name, row, fields));
    if (this.singleMode) {
      if (!shaped || shaped.length === 0) {
        return this.singleMode === 'maybe'
          ? { data: null, error: null, count }
          : { data: null, error: { message: 'no rows', code: 'PGRST116' }, count };
      }
      return { data: shaped[0], error: null, count };
    }
    return { data: shaped, error: null, count: this.countExact ? count : null };
  }

  then<T1 = Result, T2 = never>(
    onFulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onRejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve()
      .then(() => this.execute())
      .then(onFulfilled, onRejected);
  }
}
