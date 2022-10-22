import { run } from "joist-test-utils";
import { Context, Resolver } from "./context";
import { ResolverResult } from "./makeRunObject";

/**
 * Creates a `run` method to invoke a mutation resolver that uses the `input` convention.
 *
 * Following our `mutation / foo` conventions, `resolver` will have a single `fooResolver.foo` method.
 */
export function makeRunInputMutation<T extends object>(resolver: T): RunInputMutationMethod<T> {
  return (ctx, args) =>
    run(ctx, async (ctx) => {
      const key = Object.keys(resolver)[0];
      return ((resolver as any)[key] as any)(
        {},
        { input: args instanceof Function ? args() : args ?? {} },
        ctx,
        undefined!,
      );
    });
}

type RunInputMutationMethod<T> = <I extends MutationInput<T>, R = ResolverResult<T, keyof T>>(
  ctx: Context,
  input: I | (() => I),
) => Promise<R>;

type MutationInput<T> = T[keyof T] extends Resolver<any, { input: infer I }, any> ? I : never;
