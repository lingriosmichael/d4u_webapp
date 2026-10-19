// A small in-memory stand-in for the supabase-js query builder, for testing
// the read-only query mappers in src/lib/supabase/queries/ without a
// database. It supports exactly the builder calls those files use (select,
// eq, in, gte, lte, order, single, maybeSingle, await) and applies the
// filters to the fixture rows, so a test checks what the mapper does with
// the rows a real query would return. `select` ignores its column list:
// fixtures carry only the columns (and embedded relations) a test needs.
//
// Timestamps without an offset are compared as UTC, as Postgres does for a
// timestamptz column in Supabase's default UTC session.

export type FakeRow = Record<string, unknown>;

export interface RecordedFilter {
  operator: "eq" | "in" | "gte" | "lte";
  column: string;
  value: unknown;
}

export interface RecordedQuery {
  table: string;
  filters: RecordedFilter[];
}

interface FakeResult {
  data: unknown;
  error: { message: string } | null;
}

interface FakeQueryBuilder extends PromiseLike<FakeResult> {
  select(columns?: string): FakeQueryBuilder;
  eq(column: string, value: unknown): FakeQueryBuilder;
  in(column: string, values: unknown[]): FakeQueryBuilder;
  gte(column: string, value: string): FakeQueryBuilder;
  lte(column: string, value: string): FakeQueryBuilder;
  order(column: string, options?: { ascending?: boolean }): FakeQueryBuilder;
  single(): Promise<FakeResult>;
  maybeSingle(): Promise<FakeResult>;
}

function asUtcMillis(value: unknown): number {
  const text = String(value);
  const hasTime = text.includes("T");
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(text);
  return Date.parse(hasTime && !hasOffset ? `${text}Z` : text);
}

export function createFakeSupabase(
  tables: Record<string, FakeRow[]>,
  options: { failingTables?: string[] } = {},
) {
  const queries: RecordedQuery[] = [];

  function from(table: string): FakeQueryBuilder {
    const recorded: RecordedQuery = { table, filters: [] };
    queries.push(recorded);
    let rows = [...(tables[table] ?? [])];
    const error = options.failingTables?.includes(table) ? { message: "query failed" } : null;

    const builder: FakeQueryBuilder = {
      select() {
        return builder;
      },
      eq(column, value) {
        recorded.filters.push({ operator: "eq", column, value });
        rows = rows.filter((row) => row[column] === value);
        return builder;
      },
      in(column, values) {
        recorded.filters.push({ operator: "in", column, value: values });
        rows = rows.filter((row) => values.includes(row[column]));
        return builder;
      },
      gte(column, value) {
        recorded.filters.push({ operator: "gte", column, value });
        rows = rows.filter((row) => asUtcMillis(row[column]) >= asUtcMillis(value));
        return builder;
      },
      lte(column, value) {
        recorded.filters.push({ operator: "lte", column, value });
        rows = rows.filter((row) => asUtcMillis(row[column]) <= asUtcMillis(value));
        return builder;
      },
      order(column, { ascending = true } = {}) {
        rows.sort((a, b) => {
          const left = String(a[column] ?? "");
          const right = String(b[column] ?? "");
          return ascending ? left.localeCompare(right) : right.localeCompare(left);
        });
        return builder;
      },
      async single() {
        if (error) return { data: null, error };
        return rows.length === 1
          ? { data: rows[0], error: null }
          : { data: null, error: { message: "expected exactly one row" } };
      },
      async maybeSingle() {
        if (error) return { data: null, error };
        return { data: rows[0] ?? null, error: null };
      },
      then(onFulfilled, onRejected) {
        const result: FakeResult = error ? { data: null, error } : { data: rows, error: null };
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  return {
    client: { from },
    queries,
    /** Every recorded query against `table`, in the order they were built. */
    queriesOn(table: string): RecordedQuery[] {
      return queries.filter((query) => query.table === table);
    },
  };
}
