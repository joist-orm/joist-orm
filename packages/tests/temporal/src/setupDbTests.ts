import { expect } from "@jest/globals";
import { Context } from "@src/context";
import { EntityManager } from "@src/entities";
import {
  plainDateMapper,
  plainDateTimeMapper,
  plainTimeMapper,
  PostgresDriver,
  PostgresDriverOpts,
  zonedDateTimeMapper,
} from "joist-orm";
import { toMatchEntity } from "joist-test-utils";
import { newPgConnectionConfig } from "joist-utils";
import { builtins } from "pg-types";
import postgres from "postgres";
import array from "postgres-array";
import { Temporal } from "temporal-polyfill";

// Don't eagerly parse the strings, instead defer to the serde logic
const noop = (s: string) => s;
const noopArray = (s: string) => array.parse(s, noop);

const { TIMESTAMP, TIMESTAMPTZ, DATE, TIME } = builtins;
const [TIMESTAMP_ARRAY, TIMESTAMPTZ_ARRAY, DATE_ARRAY] = [1182, 1115, 1185];
// types.setTypeParser(DATE, noop);
// types.setTypeParser(TIMESTAMP, noop);
// types.setTypeParser(TIMESTAMPTZ, noop);
// types.setTypeParser(1182, noopArray); // date[]
// types.setTypeParser(1115, noopArray); // timestamp[]
// types.setTypeParser(1185, noopArray); // timestamptz[]
// types.setTypeParser(types.builtins.TIMESTAMPTZ, getTypeParser(builtins.TIMESTAMPTZ));

export const sql = postgres({
  types: {
    timestamp: {
      to: TIMESTAMP,
      from: [TIMESTAMP],
      serialize: plainDateTimeMapper.toDb,
      parse: noop as any,
    } as postgres.PostgresType<Temporal.PlainDateTime>,
    timestamptz: {
      to: TIMESTAMPTZ,
      from: [TIMESTAMPTZ],
      serialize: zonedDateTimeMapper.toDb,
      parse: noop as any,
    } as postgres.PostgresType<Temporal.ZonedDateTime>,
    date: {
      to: DATE,
      from: [DATE],
      serialize: plainDateMapper.toDb,
      parse: noop as any,
    } as postgres.PostgresType<Temporal.PlainDate>,
    time: {
      to: TIME,
      from: [TIME],
      serialize: plainTimeMapper.toDb,
      parse: noop as any,
    } as postgres.PostgresType<Temporal.PlainTime>,
  },
  ...newPgConnectionConfig(),
});

export function newEntityManager(opts?: PostgresDriverOpts) {
  const ctx = { sql };
  const em = new EntityManager(ctx as any, new PostgresDriver(sql, opts));
  Object.assign(ctx, { em });
  return em;
}

expect.extend({ toMatchEntity });

beforeEach(async () => {
  await sql`select flush_database()`;
});

afterAll(async () => {
  await sql.end();
});

type itWithCtxFn = (ctx: Context) => Promise<void>;
it.withCtx = (name: string, fnOrOpts: itWithCtxFn | ContextOpts, maybeFn?: itWithCtxFn) => {
  const fn: itWithCtxFn = typeof fnOrOpts === "function" ? fnOrOpts : maybeFn!;
  it(name, async () => fn({ em: newEntityManager(), sql }));
};

export function areTemporalsEqual(a: unknown, b: unknown) {
  if (a instanceof Temporal.ZonedDateTime && b instanceof Temporal.ZonedDateTime) return a.equals(b);
  if (a instanceof Temporal.PlainDateTime && b instanceof Temporal.PlainDateTime) return a.equals(b);
  if (a instanceof Temporal.PlainDate && b instanceof Temporal.PlainDate) return a.equals(b);
  return undefined;
}

expect.addEqualityTesters([areTemporalsEqual]);
