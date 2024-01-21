import { Context, ContextFn, run } from "joist-test-utils";
import { Resolver } from "./context";
import { ResolverResult } from "./typeUtils";

/**
 * Creates a `makeRunInputMutation` function for each project's `testUtils` file.
 *
 * This is called `makeMake` because it's a factory for each project's `testUtils` to make its own factory
 * that is customized (basically curried) to their own `newContext` function.
 */
export function makeMakeRunInputMutation<C extends Context>(newContext: ContextFn<C>): MakeRunInputMutation<C> {
  return (resolver) => {
    return (ctx, args) =>
      run(
        ctx,
        async (ctx) => {
          const key = Object.keys(resolver)[0];
          return ((resolver as any)[key] as any)(
            {},
            { input: args instanceof Function ? args() : args ?? {} },
            ctx,
            undefined!,
          );
        },
        newContext,
      );
  };
}

/**
 * Creates a `run` method to invoke a mutation resolver that uses the `input` convention.
 *
 * Following our `mutation / foo` conventions, `resolver` will have a single `fooResolver.foo` method.
 */
export type MakeRunInputMutation<C extends Context> = <T extends object>(resolver: T) => RunInputMutationMethod<C, T>;

type RunInputMutationMethod<C, T> = <I extends MutationInput<T>, R = ResolverResult<T, keyof T>>(
  ctx: C,
  input: I | (() => I),
) => Promise<R>;

/** Matches a mutation resolver that has a single `input` field. */
type MutationInput<T> = T[keyof T] extends Resolver<any, { input: infer I }, any> ? I : never;
