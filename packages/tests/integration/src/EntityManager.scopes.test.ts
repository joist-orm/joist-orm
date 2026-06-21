import { Author } from "@src/entities";
import { insertAuthor, insertBook } from "@src/entities/inserts";
import { newEntityManager } from "@src/testEm";
import { jan1, jan2, jan3 } from "./testDates";

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

    it("chains named scopes three deep", async () => {
      await insertAuthor({ first_name: "a1", age: 70, is_popular: true });
      await insertAuthor({ first_name: "a2", age: 20, is_popular: true });
      await insertAuthor({ first_name: "a3", age: 70, is_popular: false });
      await insertAuthor({ first_name: "a4", age: 10, is_popular: true });
      const em = newEntityManager();
      const authors = await Author.adult.popular.senior.find(em);
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
    });

    it("supports inline-composed static scopes that reference earlier declarations", async () => {
      await insertAuthor({ first_name: "a1", age: 70, is_popular: true });
      await insertAuthor({ first_name: "a2", age: 70, is_popular: false });
      await insertAuthor({ first_name: "a3", age: 10, is_popular: true });
      const em = newEntityManager();
      const authors = await Author.popularAdult.find(em);
      expect(authors).toMatchEntity([{ firstName: "a1" }]);

      const chained = await Author.adult.popularAdult.find(em);
      expect(chained).toMatchEntity([{ firstName: "a1" }]);
    });

    it("supports builder-composed static scopes", async () => {
      await insertAuthor({ first_name: "a1", age: 20, created_at: jan1 });
      await insertAuthor({ first_name: "a2", age: 10, created_at: jan3 });
      await insertAuthor({ first_name: "a3", age: 30, created_at: jan2 });
      const em = newEntityManager();
      const authors = await Author.recentAdults.find(em);
      expect(authors).toMatchEntity([{ firstName: "a3" }, { firstName: "a1" }]);

      const viaAdult = await Author.recentAdultsViaAdult.find(em);
      expect(viaAdult).toMatchEntity([{ firstName: "a3" }, { firstName: "a1" }]);

      const chained = await Author.adult.recentAdults.find(em);
      expect(chained).toMatchEntity([{ firstName: "a3" }, { firstName: "a1" }]);

      const chainedViaAdult = await Author.adult.recentAdultsViaAdult.find(em);
      expect(chainedViaAdult).toMatchEntity([{ firstName: "a3" }, { firstName: "a1" }]);
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
      const authors = await Author.adult.popular.where((a) => a.age.lte(65)).find(em);
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

    it("ANDs same-field object-where scopes and builder wheres", async () => {
      await insertAuthor({ first_name: "a1", age: 70 });
      await insertAuthor({ first_name: "a2", age: 20 });
      const em = newEntityManager();
      const authors = await Author.senior.adult.find(em);
      expect(authors).toMatchEntity([{ firstName: "a1" }]);

      const withBuilder = await Author.senior.where({ age: { gte: 18 } }).find(em);
      expect(withBuilder).toMatchEntity([{ firstName: "a1" }]);
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

    it("keeps named scope access after builder calls", async () => {
      await insertAuthor({ first_name: "a1", age: 70, is_popular: true });
      await insertAuthor({ first_name: "a2", age: 80, is_popular: false });
      await insertAuthor({ first_name: "a3", age: 65, is_popular: true });
      const em = newEntityManager();
      const authors = await Author.senior.orderBy({ age: "DESC" }).limit(5).popular.find(em);
      expect(authors).toMatchEntity([{ firstName: "a1" }, { firstName: "a3" }]);
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

    it("find accepts terminal options without populate", async () => {
      await insertAuthor({ first_name: "a1", age: 20 });
      await insertAuthor({ first_name: "a2", age: 30 });
      await insertAuthor({ first_name: "a3", age: 10 });
      const em = newEntityManager();
      const authors = await Author.adult.find(em, { orderBy: { age: "DESC" }, limit: 1 });
      expect(authors).toMatchEntity([{ firstName: "a2" }]);
    });

    it("find populates the requested relation", async () => {
      await insertAuthor({ first_name: "a1", age: 20 });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const authors = await Author.adult.find(em, { populate: "books" });
      expect(authors[0].books.get).toMatchEntity([{ title: "b1" }]);
    });

    it("findOne populates the requested relation", async () => {
      await insertAuthor({ first_name: "a1", age: 20 });
      await insertAuthor({ first_name: "a2", age: 10 });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const author = await Author.adult.findOne(em, { populate: "books" });
      if (author === undefined) throw new Error("Expected author");
      expect(author.books.get).toMatchEntity([{ title: "b1" }]);
    });

    it("findOneOrFail populates the requested relation", async () => {
      await insertAuthor({ first_name: "a1", age: 20 });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const author = await Author.adult.findOneOrFail(em, { populate: "books" });
      expect(author.books.get).toMatchEntity([{ title: "b1" }]);
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
