import { Author, EntityManager } from "@src/entities";
import { insertAuthor } from "@src/entities/inserts";
import { newEntityManager } from "@src/testEm";
import { Loaded } from "joist-orm";

// WIP prototype tests — see ../scopes.ts. Uses the `AuthorScope` (= `Scope<Author, AuthorScopes>`)
// form, which supports typed named-scope chaining (`Author.adult.popular`). `_scopeTypeChecks` is
// the type-level test (validated by `tsc`, never run); the `describe` block is the runtime test.

// Compile-only. Never called.
export function _scopeTypeChecks(em: EntityManager): void {
  // --- positive: typed named-scope chaining (the key use case) ---
  void Author.adult.popular; // plain + plain
  void Author.adult.popular.senior; // 3 deep
  void Author.named("a").adult.popular; // parameterized, then chained
  void Author.adult.popular.where((a) => a.age.lte(65)).find(em); // chain + ad-hoc where + terminal

  // --- positive: declaration, builders, parameterized scopes ---
  void Author.adult; // object-form scope
  void Author.popular; // alias-form scope
  void Author.adult.where({ firstName: "a1" }); // builder: ad-hoc object where
  void Author.senior.orderBy({ age: "DESC" }).limit(5).popular; // builders preserve the named accessors
  void Author.named("a"); // parameterized scope

  // --- positive: terminal return types ---
  const p1: Promise<Author[]> = Author.adult.find(em);
  const p2: Promise<Author | undefined> = Author.adult.findOne(em);
  const p3: Promise<number> = Author.adult.findCount(em);
  const p4: Promise<Loaded<Author, "books">[]> = Author.adult.find(em, { populate: "books" });
  void [p1, p2, p3, p4];

  // --- negative: each must be exactly one type error ---
  // @ts-expect-error - there is no `bogus` scope on Author
  void Author.adult.bogus;
  // @ts-expect-error - `notAField` is not an Author filter field
  void Author.adult.where({ notAField: 1 });
  // @ts-expect-error - the parameterized scope expects a string
  void Author.named(123);
  // @ts-expect-error - no-populate `find` returns Author[], not Loaded<Author, "books">[]
  const p5: Promise<Loaded<Author, "books">[]> = Author.adult.find(em);
  void p5;
}

describe("EntityManager.scopes", () => {
  it("applies an object-form scope", async () => {
    await insertAuthor({ first_name: "a1", age: 20 });
    await insertAuthor({ first_name: "a2", age: 10 });
    const em = newEntityManager();
    const authors = await Author.adult.find(em);
    expect(authors).toMatchEntity([{ firstName: "a1" }]);
  });

  it("applies an alias-condition scope", async () => {
    await insertAuthor({ first_name: "a1", is_popular: true });
    await insertAuthor({ first_name: "a2", is_popular: false });
    const em = newEntityManager();
    const authors = await Author.popular.find(em);
    expect(authors).toMatchEntity([{ firstName: "a1" }]);
  });

  it("chains named scopes with AND semantics", async () => {
    await insertAuthor({ first_name: "a1", age: 70, is_popular: true });
    await insertAuthor({ first_name: "a2", age: 70, is_popular: false });
    await insertAuthor({ first_name: "a3", age: 10, is_popular: true });
    const em = newEntityManager();
    const authors = await Author.adult.popular.find(em);
    expect(authors).toMatchEntity([{ firstName: "a1" }]);
  });

  it("composes a scope with an ad-hoc same-field where via ANDed conditions", async () => {
    await insertAuthor({ first_name: "a1", age: 20, is_popular: true });
    await insertAuthor({ first_name: "a2", age: 70, is_popular: true });
    const em = newEntityManager();
    const authors = await Author.popular.where((a) => a.age.lte(65)).find(em);
    expect(authors).toMatchEntity([{ firstName: "a1" }]);
  });

  it("supports parameterized scopes", async () => {
    await insertAuthor({ first_name: "alice", age: 20 });
    await insertAuthor({ first_name: "bob", age: 20 });
    const em = newEntityManager();
    const authors = await Author.named("a").find(em);
    expect(authors).toMatchEntity([{ firstName: "alice" }]);
  });

  it("compiles a chained scope to ANDed find args", () => {
    // `adult` is an object-where; `popular` is an alias-condition. em.find ANDs the two.
    const args = Author.adult.popular.toFindArgs();
    expect(args).toMatchObject({ where: { age: { gte: 18 } }, conditions: { and: [{}] } });
  });
});
