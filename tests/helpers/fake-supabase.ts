// A small in-memory stand-in for the Supabase client, good enough to run the
// server actions end to end without a database.
//
// It really applies the filters rather than nodding along: `.eq("user_id", …)`
// actually narrows the rows. That matters, because the thing most worth testing
// in an action is whether it scoped the write to the signed-in user at all — a
// mock that just records the call and returns canned rows would pass whether or
// not the filter was there.
//
// What it deliberately does NOT model: row-level security (the DB enforces that,
// so RLS is tested against a real Postgres in tests/rls), triggers, and defaults
// other than an auto id/created_at.

export type Row = Record<string, unknown>;

export interface FakeDb {
  [table: string]: Row[];
}

type FilterOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "ilike" | "is" | "not-is" | "in";
interface Filter {
  column: string;
  op: FilterOp;
  value: unknown;
}

let idCounter = 0;
const nextId = () => `row-${++idCounter}`;

function matches(row: Row, f: Filter): boolean {
  const v = row[f.column];
  switch (f.op) {
    case "eq":
      return String(v) === String(f.value);
    case "neq":
      return String(v) !== String(f.value);
    case "gt":
      return (v as number) > (f.value as number);
    case "gte":
      return (v as number) >= (f.value as number);
    case "lt":
      return (v as number) < (f.value as number);
    case "lte":
      return (v as number) <= (f.value as number);
    case "ilike": {
      // Postgres ILIKE: % is any run of characters, _ is one.
      const pattern = String(f.value)
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/%/g, ".*")
        .replace(/_/g, ".");
      return new RegExp(`^${pattern}$`, "i").test(String(v ?? ""));
    }
    case "is":
      return f.value === null ? v == null : v === f.value;
    case "not-is":
      return f.value === null ? v != null : v !== f.value;
    case "in":
      return (f.value as unknown[]).some((x) => String(x) === String(v));
    default:
      return true;
  }
}

export class FakeQuery implements PromiseLike<{ data: unknown; error: { message: string } | null; count?: number }> {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Row[] = [];
  private conflictCols: string[] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private limitTo: number | null = null;
  private wantSingle = false;
  private maybe = false;
  private headOnly = false;
  private wantCount = false;
  private returnsRows = true;

  constructor(
    private db: FakeDb,
    private table: string,
    private failWith: string | null,
  ) {}

  private rows(): Row[] {
    return (this.db[this.table] ??= []);
  }

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") this.op = "select";
    if (opts?.count) this.wantCount = true;
    if (opts?.head) this.headOnly = true;
    this.returnsRows = true;
    return this;
  }

  insert(payload: Row | Row[]) {
    this.op = "insert";
    this.payload = Array.isArray(payload) ? payload : [payload];
    this.returnsRows = false;
    return this;
  }

  upsert(payload: Row | Row[], opts?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = Array.isArray(payload) ? payload : [payload];
    this.conflictCols = opts?.onConflict?.split(",").map((c) => c.trim()) ?? [];
    this.returnsRows = false;
    return this;
  }

  update(patch: Row) {
    this.op = "update";
    this.payload = [patch];
    this.returnsRows = false;
    return this;
  }

  delete() {
    this.op = "delete";
    this.returnsRows = false;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, op: "eq", value });
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push({ column, op: "neq", value });
    return this;
  }
  gt(column: string, value: unknown) {
    this.filters.push({ column, op: "gt", value });
    return this;
  }
  gte(column: string, value: unknown) {
    this.filters.push({ column, op: "gte", value });
    return this;
  }
  lt(column: string, value: unknown) {
    this.filters.push({ column, op: "lt", value });
    return this;
  }
  lte(column: string, value: unknown) {
    this.filters.push({ column, op: "lte", value });
    return this;
  }
  ilike(column: string, value: unknown) {
    this.filters.push({ column, op: "ilike", value });
    return this;
  }
  is(column: string, value: unknown) {
    this.filters.push({ column, op: "is", value });
    return this;
  }
  in(column: string, value: unknown[]) {
    this.filters.push({ column, op: "in", value });
    return this;
  }
  // Supabase spells "is not null" as .not("col", "is", null).
  not(column: string, op: string, value: unknown) {
    this.filters.push({ column, op: op === "is" ? "not-is" : "neq", value });
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: opts?.ascending ?? true };
    return this;
  }

  limit(n: number) {
    this.limitTo = n;
    return this;
  }

  maybeSingle() {
    this.maybe = true;
    this.wantSingle = true;
    return this;
  }

  single() {
    this.wantSingle = true;
    return this;
  }

  private matching(): Row[] {
    return this.rows().filter((r) => this.filters.every((f) => matches(r, f)));
  }

  private conflictKey(row: Row): string {
    return this.conflictCols.map((c) => String(row[c])).join("|");
    }

  private run(): { data: unknown; error: { message: string } | null; count?: number } {
    if (this.failWith) return { data: null, error: { message: this.failWith } };

    let result: Row[] = [];

    switch (this.op) {
      case "insert": {
        const added = this.payload.map((r) => ({
          id: nextId(),
          logged_at: new Date().toISOString(),
          ...r,
        }));
        this.rows().push(...added);
        result = added;
        break;
      }
      case "upsert": {
        const added: Row[] = [];
        for (const r of this.payload) {
          const existing = this.conflictCols.length
            ? this.rows().find((x) => this.conflictKey(x) === this.conflictKey(r))
            : undefined;
          if (existing) {
            Object.assign(existing, r);
            added.push(existing);
          } else {
            const row = { id: nextId(), ...r };
            this.rows().push(row);
            added.push(row);
          }
        }
        result = added;
        break;
      }
      case "update": {
        const hit = this.matching();
        for (const r of hit) Object.assign(r, this.payload[0]);
        result = hit;
        break;
      }
      case "delete": {
        const hit = this.matching();
        this.db[this.table] = this.rows().filter((r) => !hit.includes(r));
        result = hit;
        break;
      }
      case "select": {
        result = this.matching();
        if (this.orderBy) {
          const { column, ascending } = this.orderBy;
          result = [...result].sort((a, b) => {
            const x = a[column] as never;
            const y = b[column] as never;
            if (x === y) return 0;
            return (x < y ? -1 : 1) * (ascending ? 1 : -1);
          });
        }
        if (this.limitTo != null) result = result.slice(0, this.limitTo);
        break;
      }
    }

    if (this.wantCount) {
      return { data: this.headOnly ? null : result, error: null, count: result.length };
    }
    if (this.wantSingle) {
      if (result.length === 0) {
        return this.maybe
          ? { data: null, error: null }
          : { data: null, error: { message: "No rows found" } };
      }
      return { data: result[0], error: null };
    }
    // An insert/update/delete without .select() returns no rows, like PostgREST.
    return { data: this.returnsRows ? result : null, error: null };
  }

  then<T1 = unknown, T2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: { message: string } | null; count?: number }) => T1 | PromiseLike<T1>)
      | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export interface FakeSupabaseOptions {
  // The signed-in user. null makes requireUser() throw, like a logged-out call.
  user?: { id: string } | null;
  // Starting table contents.
  db?: FakeDb;
  // Force every query on a table to come back as an error, to test error paths.
  failTable?: string | null;
}

export function createFakeSupabase(opts: FakeSupabaseOptions = {}) {
  const db: FakeDb = opts.db ?? {};
  const user = opts.user === undefined ? { id: "user-1" } : opts.user;

  const client = {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
    from(table: string) {
      return new FakeQuery(db, table, opts.failTable === table ? "boom" : null);
    },
  };

  return { client, db };
}

// The client the mocked `@/lib/supabase/server` hands out. A test file points
// the real module at this holder (see installFakeSupabase's doc comment), then
// swaps the contents per test.
export const supabaseHolder: { client: unknown } = { client: null };

// Load a fresh database for one test and wire the fake client to it. Returns the
// tables so a test can assert on what the action actually wrote.
//
// The test file must first redirect the Supabase module to the holder — vi.mock
// is hoisted above every import, so the factory has to reach the holder lazily:
//
//   vi.mock("@/lib/supabase/server", async () => {
//     const { supabaseHolder } = await import("./helpers/fake-supabase");
//     return { createClient: async () => supabaseHolder.client };
//   });
//   vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
export function installFakeSupabase(opts: FakeSupabaseOptions = {}) {
  const fake = createFakeSupabase(opts);
  supabaseHolder.client = fake.client;
  return fake;
}
