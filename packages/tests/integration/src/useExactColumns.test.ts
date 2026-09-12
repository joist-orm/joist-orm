import { type Plugin, envelop, useEngine, useSchema } from "@envelop/core";
import { useGraphQlJit } from "@envelop/graphql-jit";
import {
  type ExecutionArgs,
  type ExecutionResult,
  GraphQLError,
  buildSchema,
  execute,
  experimentalExecuteIncrementally,
  parse,
  subscribe,
  validate,
} from "graphql";
import { ExactColumnsPlugin, type ExactColumnsTrackOutcome, MissingColumnError } from "joist-orm";
import { useExactColumns } from "joist-orm/graphql-plugins";
import { Deferred } from "joist-utils";
import { Author, type EntityManager, newAuthor } from "src/entities";
import { insertAuthor, select } from "src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "src/testEm";

describe("useExactColumns", () => {
  it("learns real entity reads and retries with a fresh context and EM when variables change", async () => {
    // Given an author whose lastName is not read during learning.
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    // And an ordinary query whose branch depends on a variable, not its profile key.
    const api = newApi({
      label: (args: { last: boolean }, ctx: Context) => (args.last ? ctx.author.lastName : ctx.author.firstName),
    });
    for (let i = 0; i < 4; i++) {
      expect(await api.run()).toEqual({ data: { label: "a1" } });
    }
    resetQueryCount();
    expect(await api.run()).toEqual({ data: { label: "a1" } });
    expect(queries).toEqual([
      "SELECT a.id, a.first_name, a.deleted_at, a.created_at, a.updated_at FROM authors AS a WHERE a.id = ANY($1) ORDER BY a.id ASC LIMIT $2",
    ]);
    expect(await api.run({ last: true })).toEqual({ data: { label: "l1" } });
    expect(api.contexts).toHaveLength(7);
    expect(new Set(api.contexts).size).toBe(7);
    expect(new Set(api.contexts.map((ctx) => ctx.em)).size).toBe(7);
    expect(api.outcomes.at(-1)).toMatchObject({ optimized: true, retried: true });
    expect(new Set(api.outcomes.map((o) => o.endpointKey)).size).toBe(1);
    expect(api.doneContexts).toHaveLength(6);
    expect(api.doneContexts.at(-1)?.em).toBe(api.contexts.at(-1)?.em);
    expect(api.doneArgs.at(-1)?.em).toBe(api.contexts.at(-1)?.em);
  });

  it("keys only the selected operation and its transitively reachable fragments", async () => {
    // Given an author for all requests.
    await insertAuthor({ first_name: "a1" });
    // And a resolver shared by documents with different unrelated definitions.
    const api = newApi({ label: () => "a1", other: () => "other" });
    const operation = "query Read($last: Boolean!) { ...A }";
    const a = "fragment A on Query { ...B }";
    const b = "fragment B on Query { label(last: $last) }";
    await api.run({}, `${operation} ${a} ${b} query Unused { other }`, "Read");
    const key = api.outcomes.at(-1)!.endpointKey;
    await api.run({ last: true }, `${b} ${a} ${operation} fragment Unused on Query { other }`, "Read");
    expect(api.outcomes.at(-1)!.endpointKey).toBe(key);
    await api.run({}, `${operation} ${a} fragment B on Query { other }`, "Read");
    expect(api.outcomes.at(-1)!.endpointKey).not.toBe(key);
    await api.run({}, "query Different($last: Boolean!) { ...A } " + a + b, "Different");
    expect(api.outcomes.at(-1)!.endpointKey).not.toBe(key);
  });

  it("drains slow siblings before starting a non-null missing-column retry", async () => {
    // Given an author whose lastName will be omitted after learning.
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    // And a sibling that remains pending after label fails on the narrowed attempt.
    const started = new Deferred<void>();
    const release = new Deferred<void>();
    let slow = false;
    let finished = false;
    const api = newApi({
      label(args: { last: boolean }, ctx: Context) {
        return args.last ? ctx.author.lastName : ctx.author.firstName;
      },
      async other() {
        if (slow) {
          slow = false;
          started.resolve();
          await release.promise;
          finished = true;
        }
        return "other";
      },
    });
    const query = "query Read($last: Boolean!) { other label(last: $last) }";
    for (let i = 0; i < 4; i++) await api.run({}, query);
    // And the next invocation starts both the omitted-field read and the blocked sibling.
    slow = true;
    const result = api.run({ last: true }, query);
    await started.promise;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(api.contexts).toHaveLength(5);
    expect(api.outcomes).toHaveLength(4);
    release.resolve();
    expect(await result).toEqual({ data: { other: "other", label: "l1" } });
    expect(finished).toBe(true);
    expect(api.contexts).toHaveLength(6);
    expect(api.outcomes.at(-1)?.retried).toBe(true);
  });

  it("waits for a sibling's committed flush before refusing a non-null retry", async () => {
    // Given a persisted author whose lastName will be omitted.
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    // And a query with a deliberately unsafe sibling that writes after label has failed.
    const release = new Deferred<void>();
    const started = new Deferred<void>();
    let write = false;
    const api = newApi({
      label(args: { last: boolean }, ctx: Context) {
        return args.last ? ctx.author.lastName : ctx.author.firstName;
      },
      async other(_args: unknown, ctx: Context) {
        if (write) {
          started.resolve();
          await release.promise;
          newAuthor(ctx.em, { firstName: "committed" });
          await ctx.em.flush();
        }
        return "other";
      },
    });
    const query = "query Read($last: Boolean!) { other label(last: $last) }";
    for (let i = 0; i < 4; i++) await api.run({}, query);
    // And the narrowed request takes the write branch only this time.
    write = true;
    const pending = api.run({ last: true }, query);
    await started.promise;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(api.outcomes).toHaveLength(4);
    release.resolve();
    const result = await pending;
    expect(result.data).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0].path).toEqual(["label"]);
    expect(result.errors![0].locations).toEqual([{ line: 1, column: 37 }]);
    expect(result.errors![0].originalError).toBeInstanceOf(MissingColumnError);
    expect(api.contexts).toHaveLength(5);
    expect(api.outcomes.at(-1)).toMatchObject({ retried: false, missingColumnFailure: true });
    expect(await select("authors")).toMatchObject([{ first_name: "a1" }, { first_name: "committed" }]);
  });

  it("preserves the terminal retry's wrapped errors, partial data, and extensions", async () => {
    // Given a real Author for MissingColumnError's entity metadata.
    await insertAuthor({ first_name: "a1" });
    // And a resolver that deliberately raises a missing column even on the full-row retry.
    const api = newApi({
      optional(_args: unknown, ctx: Context) {
        throw new GraphQLError("wrapped", {
          originalError: new GraphQLError("inner", {
            originalError: new MissingColumnError(ctx.author, "lastName", undefined),
          }),
          extensions: { code: "COLUMN", attempt: api.contexts.length },
        });
      },
      other() {
        throw new GraphQLError("ordinary", { extensions: { code: "ORDINARY" } });
      },
      label: () => "kept",
    });
    const result = await api.run({}, "{ optional other label(last: false) }");
    expect(result.data).toEqual({ optional: null, other: null, label: "kept" });
    expect(result.errors).toHaveLength(2);
    expect(result.errors![0].path).toEqual(["optional"]);
    expect(result.errors![0].extensions).toEqual({ code: "COLUMN", attempt: 2 });
    expect(result.errors![1].extensions).toEqual({ code: "ORDINARY" });
    expect(api.contexts).toHaveLength(2);
    expect(api.outcomes.at(-1)?.retried).toBe(true);
  });

  it("does not retry ordinary resolver errors", async () => {
    // Given an author loaded by the context factory.
    await insertAuthor({ first_name: "a1" });
    // And an application error unrelated to a missing column.
    const error = new Error("denied");
    const api = newApi({
      label() {
        throw error;
      },
    });
    const result = await api.run();
    expect(result.errors![0].originalError).toBe(error);
    expect(api.contexts).toHaveLength(1);
    expect(api.outcomes.at(-1)?.retried).toBe(false);
  });

  it("propagates an onMissingColumn failure instead of returning the GraphQL result", async () => {
    // Given an author whose lastName is omitted after learning.
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    // And a missing-column observer that fails with a different error.
    const error = new Error("observer failed");
    const api = newApi(
      {
        label: (args: { last: boolean }, ctx: Context) => (args.last ? ctx.author.lastName : ctx.author.firstName),
      },
      [],
      () => {
        throw error;
      },
    );
    for (let i = 0; i < 4; i++) await api.run();
    await expect(api.run({ last: true })).rejects.toBe(error);
    expect(api.contexts).toHaveLength(5);
    expect(api.outcomes.at(-1)?.retried).toBe(false);
  });

  it("propagates completion context synchronization failures", async () => {
    // Given an author loaded by the attempt factory.
    await insertAuthor({ first_name: "a1" });
    // And an outer context setter that refuses a resolver's completed state.
    const error = new Error("context synchronization failed");
    const api = newApi(
      {
        label(_args: unknown, ctx: Context) {
          ctx.requestId = "updated";
          return ctx.author.firstName;
        },
      },
      [
        {
          onExecute(event) {
            Object.defineProperty(event.context, "requestId", {
              enumerable: true,
              configurable: true,
              get: () => "request",
              set(value: string) {
                if (value === "updated") throw error;
              },
            });
          },
        },
      ],
    );
    await expect(api.run()).rejects.toBe(error);
    expect(api.doneContexts).toEqual([]);
  });

  it("reconciles complete contexts for omitted input, outer caches, symbols, and resolver deletions", async () => {
    // Given a real author for a deliberately raised missing-column retry.
    await insertAuthor({ first_name: "a1" });
    // And framework state created by an outer hook even though contextValue is omitted.
    const firstAttempt = Symbol("first attempt");
    const removedByResolver = Symbol("removed by resolver");
    const stale = new Map([["author", "stale"]]);
    let outer: object = {};
    let doneContext: unknown;
    let attempts = 0;
    const schema = buildSchema("type Query { value: String }");
    const exactColumns = new ExactColumnsPlugin();
    const getEnveloped = envelop({
      plugins: [
        useEngine({ execute }),
        useSchema(schema),
        {
          onExecute(event) {
            outer = event.context;
            event.extendContext({ stale, framework: "keep" });
            return {
              onExecuteDone(done) {
                doneContext = done.args.contextValue;
              },
            };
          },
        } satisfies Plugin,
        useExactColumns({
          exactColumns,
          async createAttemptContext(request: Readonly<Record<PropertyKey, unknown>>) {
            expect(request.stale).toBe(stale);
            const em = newEntityManager();
            em.addPlugin(exactColumns);
            const author = await em.load(Author, "a:1");
            return {
              framework: request.framework,
              em,
              author,
              transient: "remove",
              [removedByResolver]: "remove",
              ...(++attempts === 1 ? { [firstAttempt]: "first" } : {}),
            };
          },
        }),
      ],
    });
    const env = getEnveloped({});
    const result = await env.execute({
      schema,
      document: parse("{ value }"),
      rootValue: {
        value(_args: unknown, ctx: Record<PropertyKey, unknown>) {
          expect(Object.hasOwn(outer, "stale")).toBe(false);
          expect(Reflect.get(outer, "framework")).toBe("keep");
          if (attempts === 1) {
            expect(Reflect.get(outer, firstAttempt)).toBe("first");
            throw new MissingColumnError(ctx.author as Author, "lastName", undefined);
          }
          expect(Object.hasOwn(outer, firstAttempt)).toBe(false);
          delete ctx.transient;
          delete ctx[removedByResolver];
          return (ctx.author as Author).firstName;
        },
      },
    });
    expect(result).toEqual({ data: { value: "a1" } });
    expect(attempts).toBe(2);
    expect(doneContext).toBe(outer);
    expect(Object.hasOwn(outer, "transient")).toBe(false);
    expect(Object.hasOwn(outer, removedByResolver)).toBe(false);
    expect(Object.hasOwn(outer, firstAttempt)).toBe(false);
    expect(Object.hasOwn(outer, "stale")).toBe(false);
  });

  it("keeps the original non-null failure when GraphQL suppresses a late missing column", async () => {
    // Given an author whose lastName is not part of the learned profile.
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    // And a sibling that reads lastName only after label has failed ordinarily.
    const release = new Deferred<void>();
    const started = new Deferred<void>();
    const error = new Error("original failure");
    let fail = false;
    let lateMissing: unknown;
    const api = newApi({
      label(_args: unknown, ctx: Context) {
        if (fail) throw error;
        return ctx.author.firstName;
      },
      async other(_args: unknown, ctx: Context) {
        if (!fail) return ctx.author.firstName;
        started.resolve();
        await release.promise;
        try {
          return ctx.author.lastName;
        } catch (error) {
          lateMissing = error;
          throw error;
        }
      },
    });
    const query = "{ other label(last: false) }";
    for (let i = 0; i < 4; i++) await api.run({}, query);
    // And the narrowed invocation starts the delayed missing-column read.
    fail = true;
    const pending = api.run({}, query);
    await started.promise;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(api.outcomes).toHaveLength(4);
    release.resolve();
    const result = await pending;
    expect(lateMissing).toBeInstanceOf(MissingColumnError);
    expect(result.data).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0].originalError).toBe(error);
    expect(api.contexts).toHaveLength(5);
    expect(api.outcomes.at(-1)?.retried).toBe(false);
    // And the next request returns to the successful branch with the recorded field retained.
    fail = false;
    resetQueryCount();
    expect(await api.run({}, query)).toEqual({ data: { other: "a1", label: "a1" } });
    expect(queries).toEqual([
      "SELECT a.id, a.first_name, a.last_name, a.deleted_at, a.created_at, a.updated_at FROM authors AS a WHERE a.id = ANY($1) ORDER BY a.id ASC LIMIT $2",
    ]);
  });

  it.each(["defer", "stream"])("retains public execute's schema guard for @%s", async (directive) => {
    // Given an incremental schema but an ordinary query with no incremental directives.
    const schema = buildSchema(`directive @${directive} on FIELD type Query { value: String }`);
    // And an adapter that must not create attempt state for a schema execute rejects.
    let attempts = 0;
    const getEnveloped = envelop({
      plugins: [
        useEngine({ execute }),
        useSchema(schema),
        useExactColumns({
          exactColumns: new ExactColumnsPlugin(),
          createAttemptContext() {
            attempts++;
            return {};
          },
        }),
      ],
    });
    const env = getEnveloped({});
    expect(() => env.execute({ schema, document: parse("{ value }") })).toThrow(
      "The provided schema unexpectedly contains experimental directives",
    );
    expect(attempts).toBe(0);
  });

  it("keeps concurrent request contexts and outcomes separate", async () => {
    // Given an author whose two names are read by different requests.
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    // And a resolver that waits until both requests are executing.
    const release = new Deferred<void>();
    const bothStarted = new Deferred<void>();
    let started = 0;
    const api = newApi({
      async label(args: { last: boolean }, ctx: Context) {
        if (++started === 2) bothStarted.resolve();
        await release.promise;
        return args.last ? ctx.author.lastName : ctx.author.firstName;
      },
    });
    const first = api.run();
    const second = api.run({ last: true });
    await bothStarted.promise;
    expect(api.contexts).toHaveLength(2);
    expect(api.contexts[0].em).not.toBe(api.contexts[1].em);
    release.resolve();
    expect(await first).toEqual({ data: { label: "a1" } });
    expect(await second).toEqual({ data: { label: "l1" } });
    expect(api.outcomes).toHaveLength(2);
    expect(api.outcomes[0].columnsBefore).toBe(37);
    expect(api.outcomes[1].columnsBefore).toBe(37);
  });

  it("exposes resolver context changes to outer completion hooks", async () => {
    // Given an author loaded inside the track scope.
    await insertAuthor({ first_name: "a1" });
    // And a resolver that updates application state on its fresh context.
    const api = newApi({
      label(_args: unknown, ctx: Context) {
        ctx.requestId = "updated";
        return ctx.author.firstName;
      },
    });
    await api.run();
    expect(api.doneContexts[0].requestId).toBe("updated");
    expect(api.doneArgs[0].requestId).toBe("updated");
  });

  it("drains asynchronous list items after a non-null sibling has failed", async () => {
    // Given a pending list value whose completion outlives the initial GraphQL result.
    const release = new Deferred<string>();
    const outcomes: ExactColumnsTrackOutcome[] = [];
    const schema = buildSchema("type Query { values: [String] failure: String! }");
    // And a real GraphQL execution with a synchronous non-null failure.
    const getEnveloped = envelop({
      plugins: [
        useEngine({ execute }),
        useSchema(schema),
        useExactColumns({
          exactColumns: new ExactColumnsPlugin({ onTrack: (outcome) => outcomes.push(outcome) }),
          createAttemptContext: () => ({}),
        }),
      ],
    });
    const env = getEnveloped({});
    const pending = env.execute({
      schema,
      document: parse("{ values failure }"),
      rootValue: {
        values: [release.promise],
        failure() {
          throw new Error("failed");
        },
      },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(outcomes).toEqual([]);
    release.resolve("late");
    const result = await pending;
    expect(result).toMatchObject({ data: null });
    expect(outcomes).toHaveLength(1);
  });

  it("propagates context creation failures without executing resolvers", async () => {
    // Given an application factory that cannot create an EntityManager.
    const error = new Error("context unavailable");
    let resolved = false;
    const schema = buildSchema("type Query { value: String }");
    const getEnveloped = envelop({
      plugins: [
        useEngine({ execute }),
        useSchema(schema),
        useExactColumns<object>({
          exactColumns: new ExactColumnsPlugin(),
          createAttemptContext() {
            throw error;
          },
        }),
      ],
    });
    const env = getEnveloped({});
    await expect(
      env.execute({
        schema,
        document: parse("{ value }"),
        rootValue: {
          value() {
            resolved = true;
            return "unused";
          },
        },
      }),
    ).rejects.toBe(error);
    expect(resolved).toBe(false);
  });

  it("returns variable coercion errors without hanging on an execution hook", async () => {
    // Given an author loaded by attempt creation.
    await insertAuthor({ first_name: "a1" });
    // And a request with an invalid Boolean variable.
    const api = newApi({ label: () => "unused" });
    const result = await api.run({ last: "invalid" });
    expect(result.errors).toHaveLength(1);
    expect(result.data).toBeUndefined();
    expect(api.contexts).toHaveLength(1);
  });

  it.each([true, false])("handles cancellation before execution: %s", async (beforeExecution) => {
    // Given a cancellable query and a resolver that does not finish until released.
    const controller = new AbortController();
    const release = new Deferred<string>();
    const started = new Deferred<void>();
    const outcomes: ExactColumnsTrackOutcome[] = [];
    const schema = buildSchema("type Query { value: String }");
    const getEnveloped = envelop({
      plugins: [
        useEngine({ execute }),
        useSchema(schema),
        useExactColumns({
          exactColumns: new ExactColumnsPlugin({ onTrack: (outcome) => outcomes.push(outcome) }),
          createAttemptContext: () => ({}),
        }),
      ],
    });
    // And cancellation either precedes execution or occurs while its resolver is pending.
    if (beforeExecution) controller.abort(new Error("cancelled"));
    const env = getEnveloped({});
    const args: ExecutionArgs = {
      schema,
      document: parse("{ value }"),
      abortSignal: controller.signal,
      rootValue: {
        value() {
          started.resolve();
          return release.promise;
        },
      },
    };
    const pending = Promise.resolve(env.execute(args)).catch((error: unknown) => error);
    if (!beforeExecution) {
      await started.promise;
      controller.abort(new Error("cancelled"));
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(outcomes).toEqual([]);
      release.resolve("late");
    }
    expect(await pending).toBeInstanceOf(Error);
    expect(outcomes).toHaveLength(1);
  });

  it("rejects JIT instead of claiming its resolver work can be drained", async () => {
    // Given a real JIT plugin before the exact-columns adapter.
    const api = newApi({ label: () => "unused" }, [useGraphQlJit()]);
    await expect(api.run()).rejects.toThrow("JIT and custom executors are unsupported");
    expect(api.contexts).toEqual([]);
    expect(api.outcomes).toEqual([]);
  });

  it("rejects executor replacement after the adapter", () => {
    // Given plugins ordered so that JIT would replace the tracked executor.
    const getEnveloped = envelop({
      plugins: [
        useExactColumns({ exactColumns: new ExactColumnsPlugin(), createAttemptContext: () => ({}) }),
        useGraphQlJit(),
      ],
    });
    expect(() => getEnveloped({})).toThrow("must follow all other onExecute plugins");
  });

  it("bypasses mutations and subscriptions without creating attempt contexts", async () => {
    // Given a schema with non-query operations and the real GraphQL engine.
    let attempts = 0;
    const outcomes: ExactColumnsTrackOutcome[] = [];
    const getEnveloped = envelop({
      plugins: [
        useEngine({ execute, subscribe }),
        useSchema(
          buildSchema(
            "type Query { value: String } type Mutation { value: String } type Subscription { value: String }",
          ),
        ),
        useExactColumns({
          exactColumns: new ExactColumnsPlugin({ onTrack: (outcome) => outcomes.push(outcome) }),
          createAttemptContext() {
            attempts++;
            return {};
          },
        }),
      ],
    });
    const env = getEnveloped({});
    expect(
      await env.execute({ schema: env.schema, document: parse("mutation { value }"), rootValue: { value: "written" } }),
    ).toEqual({ data: { value: "written" } });
    // And a subscription source that yields an actual event stream.
    async function* events() {
      yield { value: "event" };
    }
    const stream = await env.subscribe({
      schema: env.schema,
      document: parse("subscription { value }"),
      rootValue: { value: events },
    });
    if (!(Symbol.asyncIterator in stream)) throw new Error("Expected subscription stream");
    const iterator = stream[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toEqual({ data: { value: "event" } });
    await iterator.return?.();
    expect(attempts).toBe(0);
    expect(outcomes).toEqual([]);
  });

  it.each(["defer", "stream"])(
    "bypasses reachable @%s delivery, including its stream consumption",
    async (directive) => {
      // Given a real incremental executor, which is allowed only for bypassed operations.
      let attempts = 0;
      const outcomes: ExactColumnsTrackOutcome[] = [];
      const schema = buildSchema(`
      directive @defer(if: Boolean = true, label: String) on FRAGMENT_SPREAD | INLINE_FRAGMENT
      directive @stream(if: Boolean = true, label: String, initialCount: Int = 0) on FIELD
      type Query { values: [String] }
    `);
      const getEnveloped = envelop({
        plugins: [
          useEngine({ execute: experimentalExecuteIncrementally }),
          useSchema(schema),
          useExactColumns({
            exactColumns: new ExactColumnsPlugin({ onTrack: (outcome) => outcomes.push(outcome) }),
            createAttemptContext() {
              attempts++;
              return {};
            },
          }),
        ],
      });
      const env = getEnveloped({});
      const document = parse(
        directive === "defer" ? "{ ...A } fragment A on Query { ... @defer { values } }" : "{ values @stream }",
      );
      const result = await env.execute({ schema, document, rootValue: { values: ["one", "two"] } });
      expect("initialResult" in result).toBe(true);
      if (!("subsequentResults" in result)) throw new Error("Expected incremental results");
      for await (const _payload of result.subsequentResults) {
        /* Consume outside any tracking scope. */
      }
      expect(attempts).toBe(0);
      expect(outcomes).toEqual([]);
    },
  );
});

interface Context {
  requestId: string;
  em: EntityManager;
  author: Author;
}

/** Runs real Envelop requests with fresh PostgreSQL-backed attempt contexts and outer hook observations. */
function newApi(
  rootValue: Record<string, unknown>,
  plugins: Plugin[] = [],
  onMissingColumn?: (error: MissingColumnError) => void,
) {
  const contexts: Context[] = [];
  const outcomes: ExactColumnsTrackOutcome[] = [];
  const doneContexts: Context[] = [];
  const doneArgs: Context[] = [];
  const exactColumns = new ExactColumnsPlugin({ onTrack: (outcome) => outcomes.push(outcome), onMissingColumn });
  const schema = buildSchema("type Query { label(last: Boolean!): String! optional: String other: String }");
  const getEnveloped = envelop({
    plugins: [
      useEngine({ execute, parse, validate }),
      useSchema(schema),
      ...plugins,
      {
        onExecute(event) {
          return {
            onExecuteDone(done) {
              doneContexts.push({ ...event.context } as Context);
              doneArgs.push({ ...done.args.contextValue } as Context);
            },
          };
        },
      } satisfies Plugin<Context>,
      useExactColumns<Context>({
        exactColumns,
        async createAttemptContext(request) {
          const em = newEntityManager();
          em.addPlugin(exactColumns);
          const author = await em.load(Author, "a:1");
          const context = { requestId: request.requestId, em, author };
          contexts.push(context);
          return context;
        },
      }),
    ],
  });
  /** Executes one selected operation with a new outer request context. */
  async function run(
    variables: Record<string, unknown> = {},
    source = "query Read($last: Boolean!) { label(last: $last) }",
    operationName?: string,
  ): Promise<ExecutionResult> {
    const env = getEnveloped({ requestId: "request" });
    const contextValue = await env.contextFactory();
    const args: ExecutionArgs = {
      schema,
      document: env.parse(source),
      contextValue,
      rootValue,
      variableValues: { last: false, ...variables },
      operationName,
    };
    return (await env.execute(args)) as ExecutionResult;
  }
  return { run, contexts, outcomes, doneContexts, doneArgs };
}
