import { Author, EntityManager } from "@src/entities";
import { insertAuthor, insertBook } from "@src/entities/inserts";
import { newEntityManager } from "@src/testEm";
import { Loaded } from "joist-orm";
import { jan1, jan2, jan3 } from "./testDates";

// WIP prototype tests — see joist-core/src/scopes.ts. Uses the `AuthorScope` (= `Scope<Author, AuthorScopes>`)
// form, which supports typed named-scope chaining (`Author.adult.popular`). `_scopeTypeChecks` is
// the type-level test (validated by `tsc`, never run); the `describe` block is the runtime test.

// Compile-only. Never called.
export function _scopeTypeChecks(em: EntityManager): void {
  // --- positive: typed named-scope chaining (the key use case) ---
  void Author.adult.popular; // plain + plain
  void Author.adult.popular.senior; // 3 deep
  void Author.popularAdult; // inline-composed from earlier static scopes
  void Author.adult.popularAdult; // same-entity static ref discovered by codegen
  void Author.adult.recentAdults; // builder-composed scope discovered by codegen
  void Author.adult.recentAdultsViaAdult; // builder-composed from an existing static scope
  void Author.named("a").adult.popular; // parameterized, then chained
  void Author.adult.popular.where((a) => a.age.lte(65)).find(em); // chain + ad-hoc where + terminal

  // --- positive: declaration, builders, parameterized scopes ---
  void Author.adult; // object-form scope
  void Author.popular; // alias-form scope
  void Author.recentAdults; // scope plus builder chain
  void Author.recentAdultsViaAdult; // existing static scope plus builder chain
  void Author.adult.where({ firstName: "a1" }); // builder: ad-hoc object where
  void Author.senior.orderBy({ age: "DESC" }).limit(5).popular; // builders preserve the named accessors
  void Author.named("a"); // parameterized scope

  // --- positive: terminal return types ---
  const p1: Promise<Author[]> = Author.adult.find(em);
  const p2: Promise<Author | undefined> = Author.adult.findOne(em);
  const p3: Promise<number> = Author.adult.findCount(em);
  const p4: Promise<Loaded<Author, "books">[]> = Author.adult.find(em, { populate: "books" });
  const p5: Promise<Author> = Author.adult.findOneOrFail(em);
  const p6: Promise<string[]> = Author.adult.findIds(em);
  const p7: Promise<Loaded<Author, "books"> | undefined> = Author.adult.findOne(em, { populate: "books" });
  const p8: Promise<Loaded<Author, "books">> = Author.adult.findOneOrFail(em, { populate: "books" });
  const p9: Promise<Author[]> = Author.adult.find(em, { limit: 5 }); // opts without populate stays `Author[]`
  void [p1, p2, p3, p4, p5, p6, p7, p8, p9];

  // --- negative: each must be exactly one type error ---
  // @ts-expect-error - there is no `bogus` scope on Author
  void Author.adult.bogus;
  // @ts-expect-error - `notAField` is not an Author filter field
  void Author.adult.where({ notAField: 1 });
  // @ts-expect-error - the parameterized scope expects a string
  void Author.named(123);
  // @ts-expect-error - no-populate `find` returns Author[], not Loaded<Author, "books">[]
  const e1: Promise<Loaded<Author, "books">[]> = Author.adult.find(em);
  void e1;
}

describe("EntityManager.scopes", () => {
  describe("declaration forms", () => {
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

    it("supports parameterized scopes", async () => {
      await insertAuthor({ first_name: "alice", age: 20 });
      await insertAuthor({ first_name: "bob", age: 20 });
      const em = newEntityManager();
      const authors = await Author.named("a").find(em);
      expect(authors).toMatchEntity([{ firstName: "alice" }]);
    });
  });

  describe("chaining", () => {
    it("chains named scopes with AND semantics", async () => {
      await insertAuthor({ first_name: "a1", age: 70, is_popular: true });
      await insertAuthor({ first_name: "a2", age: 70, is_popular: false });
      await insertAuthor({ first_name: "a3", age: 10, is_popular: true });
      const em = newEntityManager();
      const authors = await Author.adult.popular.find(em);
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
    });

    it("supports inline-composed static scopes that reference earlier declarations", async () => {
      await insertAuthor({ first_name: "a1", age: 70, is_popular: true });
      await insertAuthor({ first_name: "a2", age: 70, is_popular: false });
      await insertAuthor({ first_name: "a3", age: 10, is_popular: true });
      const em = newEntityManager();
      const authors = await Author.popularAdult.find(em);
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
    });

    it("supports builder-composed static scopes", async () => {
      await insertAuthor({ first_name: "a1", age: 20, created_at: jan1 });
      await insertAuthor({ first_name: "a2", age: 10, created_at: jan3 });
      await insertAuthor({ first_name: "a3", age: 30, created_at: jan2 });
      const em = newEntityManager();
      const authors = await Author.adult.recentAdults.find(em);
      expect(authors).toMatchEntity([{ firstName: "a3" }, { firstName: "a1" }]);

      const viaAdult = await Author.adult.recentAdultsViaAdult.find(em);
      expect(viaAdult).toMatchEntity([{ firstName: "a3" }, { firstName: "a1" }]);
    });

    it("ANDs a parameterized scope with a named scope", async () => {
      await insertAuthor({ first_name: "alice", age: 70, is_popular: true });
      await insertAuthor({ first_name: "amy", age: 10, is_popular: true });
      await insertAuthor({ first_name: "bob", age: 70, is_popular: true });
      const em = newEntityManager();
      const authors = await Author.named("a").adult.popular.find(em);
      expect(authors).toMatchEntity([{ firstName: "alice" }]);
    });

    it("composes a scope with an ad-hoc same-field where via ANDed conditions", async () => {
      await insertAuthor({ first_name: "a1", age: 20, is_popular: true });
      await insertAuthor({ first_name: "a2", age: 70, is_popular: true });
      const em = newEntityManager();
      const authors = await Author.popular.where((a) => a.age.lte(65)).find(em);
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
    });

    it("composes a scope with an ad-hoc object where on a different field", async () => {
      await insertAuthor({ first_name: "a1", age: 20 });
      await insertAuthor({ first_name: "a2", age: 20 });
      const em = newEntityManager();
      const authors = await Author.adult.where({ firstName: "a1" }).find(em);
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
    });

    it("re-applies the same named scope idempotently", async () => {
      await insertAuthor({ first_name: "a1", age: 20 });
      await insertAuthor({ first_name: "a2", age: 10 });
      const em = newEntityManager();
      // `.adult.adult` should match exactly what `.adult` matches (ANDing age>=18 with itself is a no-op).
      const authors = await Author.adult.adult.find(em);
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
    });

    it("throws on unknown runtime scope names", () => {
      expect(() => (Author.adult as unknown as Record<string, unknown>).bogus).toThrow("Invalid scope Author.bogus");
    });

    it("lets same-field object-where scopes last-win (documented limitation)", async () => {
      await insertAuthor({ first_name: "a1", age: 70 });
      await insertAuthor({ first_name: "a2", age: 20 });
      const em = newEntityManager();
      // Both `senior` (age>=65) and `adult` (age>=18) are object-form scopes on `age`, so they
      // collapse via Object.assign — the *last* one wins (age>=18), rather than ANDing to age>=65.
      // Steer same-field composition to the `(a) => ...` alias form when you need a true AND.
      const authors = await Author.senior.adult.find(em);
      expect(authors).toMatchEntity([{ firstName: "a1" }, { firstName: "a2" }]);
    });
  });

  describe("builders", () => {
    it("orders results", async () => {
      await insertAuthor({ first_name: "a1", age: 30 });
      await insertAuthor({ first_name: "a2", age: 50 });
      await insertAuthor({ first_name: "a3", age: 40 });
      const em = newEntityManager();
      const authors = await Author.adult.orderBy({ age: "DESC" }).find(em);
      expect(authors).toMatchEntity([{ age: 50 }, { age: 40 }, { age: 30 }]);
    });

    it("limits and offsets results", async () => {
      await insertAuthor({ first_name: "a1", age: 30 });
      await insertAuthor({ first_name: "a2", age: 40 });
      await insertAuthor({ first_name: "a3", age: 50 });
      const em = newEntityManager();
      const authors = await Author.adult.orderBy({ age: "ASC" }).offset(1).limit(1).find(em);
      expect(authors).toMatchEntity([{ age: 40 }]);
    });

    it("includes soft-deleted entities when asked", async () => {
      await insertAuthor({ first_name: "a1", age: 20 });
      await insertAuthor({ first_name: "a2", age: 20, deleted_at: jan1 });
      const em = newEntityManager();
      const excluded = await Author.adult.find(em);
      expect(excluded).toMatchEntity([{ firstName: "a1" }]);
      const included = await Author.adult.softDeletes("include").find(em);
      expect(included).toMatchEntity([{ firstName: "a1" }, { firstName: "a2" }]);
    });
  });

  describe("terminals", () => {
    it("findOne returns the single match", async () => {
      await insertAuthor({ first_name: "a1", age: 20 });
      await insertAuthor({ first_name: "a2", age: 10 });
      const em = newEntityManager();
      const author = await Author.adult.findOne(em);
      expect(author).toMatchEntity({ firstName: "a1" });
    });

    it("findOne returns undefined when nothing matches", async () => {
      await insertAuthor({ first_name: "a1", age: 10 });
      const em = newEntityManager();
      const author = await Author.adult.findOne(em);
      expect(author).toBeUndefined();
    });

    it("findOneOrFail returns the single match", async () => {
      await insertAuthor({ first_name: "a1", age: 20 });
      const em = newEntityManager();
      const author = await Author.adult.findOneOrFail(em);
      expect(author).toMatchEntity({ firstName: "a1" });
    });

    it("findOneOrFail throws when nothing matches", async () => {
      await insertAuthor({ first_name: "a1", age: 10 });
      const em = newEntityManager();
      await expect(Author.adult.findOneOrFail(em)).rejects.toThrow("Did not find Author for given query");
    });

    it("ANDs terminal conditions with compiled scope conditions", async () => {
      await insertAuthor({ first_name: "a1", age: 20, is_popular: true });
      await insertAuthor({ first_name: "a2", age: 20, is_popular: false });
      await insertAuthor({ first_name: "a3", age: 70, is_popular: true });
      const em = newEntityManager();
      const authors = await Author.popular.find(em, {
        conditions: {
          and: [{ kind: "raw", aliases: [], condition: "age <= ?", bindings: [65], pruneable: false }],
        },
      });
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
    });

    it("findCount returns the number of matches", async () => {
      await insertAuthor({ first_name: "a1", age: 20 });
      await insertAuthor({ first_name: "a2", age: 30 });
      await insertAuthor({ first_name: "a3", age: 10 });
      const em = newEntityManager();
      const count = await Author.adult.findCount(em);
      expect(count).toBe(2);
    });

    it("findIds returns the matching tagged ids", async () => {
      await insertAuthor({ first_name: "a1", age: 20 });
      await insertAuthor({ first_name: "a2", age: 10 });
      const em = newEntityManager();
      const ids = await Author.adult.findIds(em);
      expect(ids).toEqual(["a:1"]);
    });

    it("find populates the requested relation", async () => {
      await insertAuthor({ first_name: "a1", age: 20 });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const authors = await Author.adult.find(em, { populate: "books" });
      expect(authors[0].books.get).toMatchEntity([{ title: "b1" }]);
    });
  });

  describe("immutability", () => {
    it("does not mutate the base scope when chaining", async () => {
      await insertAuthor({ first_name: "a1", age: 20, is_popular: false });
      await insertAuthor({ first_name: "a2", age: 20, is_popular: true });
      const em = newEntityManager();
      const base = Author.adult;
      // Chaining off `base` must not leak the `popular` condition back into `base`.
      const popularAdults = await base.popular.find(em);
      const allAdults = await base.find(em);
      expect(popularAdults).toMatchEntity([{ firstName: "a2" }]);
      expect(allAdults).toMatchEntity([{ firstName: "a1" }, { firstName: "a2" }]);
    });

    it("returns the same singleton object for a base scope", () => {
      expect(Author.adult).toBe(Author.adult);
    });
  });

  describe("toFindArgs", () => {
    it("compiles a chained scope to ANDed find args", () => {
      // `adult` is an object-where; `popular` is an alias-condition. em.find ANDs the two.
      const args = Author.adult.popular.toFindArgs();
      expect(args).toMatchObject({ where: { age: { gte: 18 } }, conditions: { and: [{}] } });
    });

    it("captures orderBy, limit, and offset", () => {
      const args = Author.adult.orderBy({ age: "DESC" }).limit(5).offset(2).toFindArgs();
      expect(args).toMatchObject({
        where: { age: { gte: 18 } },
        orderBy: [{ age: "DESC" }],
        limit: 5,
        offset: 2,
      });
    });
  });
});
