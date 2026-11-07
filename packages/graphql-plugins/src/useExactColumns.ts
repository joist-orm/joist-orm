import { createHash } from "node:crypto";

import { type Plugin } from "@envelop/core";
import {
  type ExecutionArgs,
  type ExecutionResult,
  GraphQLError,
  Kind,
  execute,
  getOperationAST,
  print,
  visit,
} from "graphql";
import { type ExactColumnsPlugin, MissingColumnError } from "joist-core";

export interface UseExactColumnsOpts<TContext extends object> {
  exactColumns: ExactColumnsPlugin;
  /**
   * Creates a complete, fresh context and EntityManager inside each track attempt.
   * Register exactColumns on that EM. The input is a snapshot of the outer request context;
   * do not reuse its EM, loaders, or entities. Skipped operations use the normal outer context.
   * Preserve every desired framework/plugin field in the returned context. Its enumerable own
   * string and symbol keys replace the outer context's enumerable state, including deletions.
   */
  createAttemptContext: (context: Readonly<TContext>) => TContext | Promise<TContext>;
}

/**
 * Retries ordinary, read-only queries with fresh application state after a missing column.
 * Requires GraphQL.js 17.0.2+ execute and placement after all other onExecute plugins.
 * JIT/custom executors are rejected; mutations, subscriptions, and @defer/@stream bypass tracking.
 * Outer context/onExecute hooks run once, before attempt creation; their context object is updated
 * to the final attempt for onExecuteDone. They must not capture an EM before execution or read
 * partial entities after execution. Resolvers must await all work and must be safe to replay.
 * Use a bounded persisted-operation set: profiles are retained for every distinct operation key.
 * GraphQL may suppress a late missing-column error after another non-null failure. That failed
 * result is not retried, but the entity field guard still records the field for future requests.
 */
export function useExactColumns<TContext extends object>(opts: UseExactColumnsOpts<TContext>): Plugin<TContext> {
  const plugin: Plugin<TContext> = {
    onPluginInit(event) {
      // Check after initialization too: another plugin can insert onExecute plugins during init.
      plugin.onEnveloped = () => {
        if (event.plugins.slice(event.plugins.indexOf(plugin) + 1).some((p) => p.onExecute)) {
          throw new Error("useExactColumns must follow all other onExecute plugins");
        }
      };
    },
    onExecute(event) {
      const key = operationKey(event.args);
      if (key === undefined) return;
      if (event.executeFn !== execute) {
        throw new Error("useExactColumns requires GraphQL.js execute; JIT and custom executors are unsupported");
      }
      // Let public execute reject incremental schemas before creating any attempt state.
      if (event.args.schema.getDirective("defer") || event.args.schema.getDirective("stream")) return;
      event.args.contextValue = event.context;
      event.setExecuteFn(async (args: ExecutionArgs) => {
        const requestContext = { ...event.context };
        let previousContext: TContext | undefined;
        let lastResult: ExecutionResult | undefined;
        let forwardedMissing: MissingColumnError | undefined;
        try {
          return await opts.exactColumns.track(key, async () => {
            lastResult = undefined;
            forwardedMissing = undefined;
            const context = await opts.createAttemptContext(requestContext);
            if (context === event.context || context === previousContext || context === requestContext) {
              throw new Error("createAttemptContext must return a fresh context for each attempt");
            }
            // Envelop captures the outer context before invoking executeFn. Keep that bag current
            // for hooks, while each resolver attempt receives its own context identity.
            reconcileContext(event.context, context);
            previousContext = context;
            let finish!: () => void;
            const drained = new Promise<void>((resolve) => (finish = resolve));
            const result = execute({
              ...args,
              contextValue: context,
              hooks: {
                ...args.hooks,
                asyncWorkFinished(info) {
                  try {
                    args.hooks?.asyncWorkFinished?.(info);
                  } finally {
                    finish();
                  }
                },
              },
            });
            try {
              lastResult = await result;
            } finally {
              // GraphQL can return data:null while sibling resolvers (including writes) still run.
              // Its async-work hook includes value completion, list items, and abstract type checks.
              // Coercion failures return errors without data and never start the execution hook.
              // Synchronous throws (including pre-aborted requests) occur before this try block.
              if ("then" in result || "data" in result) await drained;
              reconcileContext(event.context, context);
            }
            for (const error of lastResult.errors ?? []) {
              const missing = missingColumn(error);
              if (missing) {
                forwardedMissing = missing;
                throw missing;
              }
            }
            return lastResult;
          });
        } catch (error) {
          // A refused retry or a second missing column must retain GraphQL paths, locations,
          // sibling errors, partial data, and extensions from the terminal attempt.
          if (lastResult && forwardedMissing && error === forwardedMissing) return lastResult;
          throw error;
        }
      });
    },
  };
  return plugin;
}

/** Replaces enumerable outer context state with the complete attempt state, including symbol keys. */
function reconcileContext(outer: object, attempt: object): void {
  for (const key of Reflect.ownKeys(outer)) {
    if (
      Object.prototype.propertyIsEnumerable.call(outer, key) &&
      !Object.prototype.propertyIsEnumerable.call(attempt, key)
    ) {
      if (!Reflect.deleteProperty(outer, key)) throw new TypeError(`Cannot remove context key ${String(key)}`);
    }
  }
  Object.assign(outer, attempt);
}

/**
 * Hashes the printed selected query and its sorted, transitively reachable fragments.
 * Runtime variables and unrelated definitions do not affect the key. I.e. Read($last: Boolean!)
 * shares its profile for both variable values, but changing a reachable fragment creates a new key.
 * Returns undefined for non-query or incremental operations, even when @defer/@stream is disabled.
 */
function operationKey(args: ExecutionArgs): string | undefined {
  const operation = getOperationAST(args.document, args.operationName);
  if (!operation || operation.operation !== "query") return undefined;
  const fragments = new Map(
    args.document.definitions.filter((d) => d.kind === Kind.FRAGMENT_DEFINITION).map((d) => [d.name.value, d]),
  );
  const reachable = new Set<string>();
  let incremental = false;
  // Visiting a growing queue handles nested spreads without recursion or fragment-cycle loops.
  const queue = [operation as (typeof args.document.definitions)[number]];
  for (const definition of queue) {
    visit(definition, {
      Directive(node) {
        if (node.name.value === "defer" || node.name.value === "stream") incremental = true;
      },
      FragmentSpread(node) {
        const name = node.name.value;
        const fragment = fragments.get(name);
        if (fragment && !reachable.has(name)) {
          reachable.add(name);
          queue.push(fragment);
        }
      },
    });
  }
  if (incremental) return undefined;
  const document = {
    kind: Kind.DOCUMENT,
    definitions: [operation, ...[...reachable].sort().map((name) => fragments.get(name)!)],
  } as const;
  return `graphql:${createHash("sha256").update(print(document)).digest("hex")}`;
}

/** Unwraps GraphQL's originalError chain without mistaking application errors for missing columns. */
function missingColumn(error: Error): MissingColumnError | undefined {
  const seen = new Set<Error>();
  while (!seen.has(error)) {
    if (error instanceof MissingColumnError) return error;
    seen.add(error);
    if (!(error instanceof GraphQLError) || !error.originalError) return undefined;
    error = error.originalError;
  }
  return undefined;
}
