import { saveBook } from "src/resolvers/mutations/book/saveBookResolver";
import { makeRunInputMutation } from "src/resolvers/testUtils";
import "src/setupDbTests";

describe("saveBook", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSaveBook(ctx, () => ({}));
    // const b = await em.load(Book, result.Book);
  });
});

type MaybePromise<T> = T | Promise<T>;
type Resolver<R, A, T> = (root: R, args: A, ctx: any, info: any) => MaybePromise<T>;
type T = typeof saveBook;
type T1 = T[keyof T];
type MutationInput<T> = T[keyof T] extends Resolver<any, { input: infer I }, any> ? I : 2;
type T2 = MutationInput<typeof saveBook>;
type T3 = typeof saveBook["saveBook"] extends Resolver<any, infer A, any> ? A : 2;

const runSaveBook = makeRunInputMutation(saveBook);
