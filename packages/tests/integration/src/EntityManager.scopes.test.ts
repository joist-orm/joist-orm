import { Author, Book } from "@src/entities";
import { insertAuthor, insertBook, insertBookReview, insertLargePublisher } from "@src/entities/inserts";
import { newEntityManager, numberOfQueries, resetQueryCount } from "@src/testEm";
import { isScope, resolveScope } from "joist-orm";
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

    it("supports parameterized filter-returning scopes", async () => {
      await insertAuthor({ first_name: "alice", age: 20 });
      await insertAuthor({ first_name: "bob", age: 20 });
      const em = newEntityManager();
      const authors = await Author.named2("a").find(em);
      expect(authors).toMatchEntity([{ firstName: "alice" }]);
    });

    it("applies a scope declared with a top-level or", async () => {
      await insertAuthor({ first_name: "a1", age: 20, is_popular: true });
      await insertAuthor({ first_name: "a2", age: 70, is_popular: false });
      await insertAuthor({ first_name: "a3", age: 20, is_popular: false });
      const em = newEntityManager();
      const authors = await Author.popularOrSenior.find(em);
      expect(authors).toMatchEntity([{ firstName: "a1" }, { firstName: "a2" }]);
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

    it("ANDs a scope with an ad-hoc top-level or where", async () => {
      await insertAuthor({ first_name: "a1", age: 20 });
      await insertAuthor({ first_name: "a2", age: 20 });
      await insertAuthor({ first_name: "a3", age: 10 });
      const em = newEntityManager();
      // `adult` ANDed with `(firstName = a1 OR firstName = a3)`; a3 is excluded by `adult`.
      const authors = await Author.adult.where({ or: [{ firstName: "a1" }, { firstName: "a3" }] }).find(em);
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
      // Unknown names are recorded as refs and validated when the scope is compiled.
      expect(() => (Author.adult as any).bogus.toFindArgs()).toThrow("Invalid scope Author.bogus");
    });

    it("composes relation filters that require joins", async () => {
      await insertLargePublisher({ id: 1, name: "p1", type_id: 2 });
      await insertLargePublisher({ id: 2, name: "p2", type_id: 2 });
      await insertAuthor({ first_name: "a1", age: 20, publisher_id: 1 });
      await insertAuthor({ first_name: "a2", age: 20, publisher_id: 2 });
      const em = newEntityManager();
      const authors = await Author.adult.where({ publisher: { name: "p1" } }).find(em);
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
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

  describe("em.find integration", () => {
    it("accepts a root scope and honors root settings", async () => {
      await insertAuthor({ first_name: "a1", age: 20 });
      await insertAuthor({ first_name: "a2", age: 30 });
      await insertAuthor({ first_name: "a3", age: 10 });
      const em = newEntityManager();
      const authors = await em.find(Author, Author.adult.orderBy({ age: "DESC" }).limit(1));
      expect(authors).toMatchEntity([{ firstName: "a2" }]);
    });

    it("accepts a scope in a many-to-one relation filter", async () => {
      await insertAuthor({ id: 1, first_name: "adult", age: 20 });
      await insertAuthor({ id: 2, first_name: "child", age: 10 });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 2 });
      const em = newEntityManager();
      const books = await em.find(Book, { author: Author.adult });
      expect(books).toMatchEntity([{ title: "b1" }]);
    });

    it("accepts logical scope composition in a nested relation filter", async () => {
      await insertAuthor({ id: 1, first_name: "a1", age: 20 });
      await insertAuthor({ id: 2, first_name: "a1", age: 10 });
      await insertAuthor({ id: 3, first_name: "a2", age: 20 });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 2 });
      await insertBook({ title: "b3", author_id: 3 });
      const em = newEntityManager();
      const books = await em.find(Book, { author: { firstName: "a1", and: Author.adult } });
      expect(books).toMatchEntity([{ title: "b1" }]);
    });
  });

  describe("relation scope fragments", () => {
    it("supports one-to-many filters in scopes", async () => {
      await insertAuthor({ id: 1, first_name: "a1", age: 20 });
      await insertAuthor({ id: 2, first_name: "a2", age: 20 });
      await insertBook({ title: "b1", author_id: 2 });
      const em = newEntityManager();
      const authors = await Author.hasBooks.find(em);
      expect(authors).toMatchEntity([{ firstName: "a2" }]);
    });

    it("supports parameterized scopes with nested relation filters", async () => {
      await insertAuthor({ id: 1, first_name: "reviewer", age: 20 });
      await insertAuthor({ id: 2, first_name: "a1", age: 20 });
      await insertAuthor({ id: 3, first_name: "a2", age: 20 });
      await insertBook({ title: "b1", author_id: 2, reviewer_id: 1 });
      await insertBook({ title: "b2", author_id: 3, reviewer_id: 3 });
      const em = newEntityManager();
      const reviewer = await em.load(Author, "a:1");
      const authors = await Author.booksReviewedBy(reviewer).find(em);
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
    });

    it("supports many-to-one chains inside scopes", async () => {
      await insertLargePublisher({ id: 1, name: "p1", type_id: 2 });
      await insertLargePublisher({ id: 2, name: "p2", type_id: 1 });
      await insertAuthor({ id: 1, first_name: "a1", age: 20, publisher_id: 1 });
      await insertAuthor({ id: 2, first_name: "a2", age: 20, publisher_id: 2 });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 2 });
      const em = newEntityManager();
      const books = await Book.fromLargePubs.find(em);
      expect(books).toMatchEntity([{ title: "b1" }]);
    });

    it("supports scopes that introduce their own join aliases and conditions", async () => {
      await insertAuthor({ id: 1, first_name: "a1", age: 20 });
      await insertBook({ id: 1, title: "b1", author_id: 1 }); // matches b.title, no reviews
      await insertAuthor({ id: 2, first_name: "a2", age: 20 });
      await insertBook({ id: 2, title: "other", author_id: 2 });
      await insertBookReview({ id: 1, book_id: 2, rating: 3 }); // matches r.rating
      await insertAuthor({ id: 3, first_name: "a3", age: 20 });
      await insertBook({ id: 3, title: "nope", author_id: 3 }); // matches neither
      const em = newEntityManager();
      // `titleOrRated` introduces its own `b`/`r` aliases and ORs a `books` column against a
      // nested `reviews` column — a cross-table OR that a plain nested filter (which ANDs joins)
      // can't express.
      const authors = await Author.titleOrRated.find(em);
      expect(authors).toMatchEntity([{ firstName: "a1" }, { firstName: "a2" }]);
    });

    it("keeps separate collection scope fragments as independent predicates", async () => {
      await insertAuthor({ id: 1, first_name: "only-a", age: 20 });
      await insertBook({ title: "A", author_id: 1 });
      await insertAuthor({ id: 2, first_name: "only-b", age: 20 });
      await insertBook({ title: "B", author_id: 2 });
      await insertAuthor({ id: 3, first_name: "both", age: 20 });
      await insertBook({ title: "A", author_id: 3 });
      await insertBook({ title: "B", author_id: 3 });
      const em = newEntityManager();
      const authors = await Author.adult
        .where({ books: { title: "A" } })
        .where({ books: { title: "B" } })
        .find(em);
      expect(authors).toMatchEntity([{ firstName: "both" }]);
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
      const args = Author.adult.popular.toFindArgs();
      expect(isScope(args.where)).toBe(true);
      if (!isScope(args.where)) throw new Error("Expected scope where");
      expect(resolveScope(args.where).fragments).toMatchObject([
        { kind: "filter", filter: { age: { gte: 18 } } },
        { kind: "alias" },
      ]);
    });

    it("captures orderBy, limit, and offset", () => {
      const args = Author.adult.orderBy({ age: "DESC" }).limit(5).offset(2).toFindArgs();
      expect(isScope(args.where)).toBe(true);
      if (!isScope(args.where)) throw new Error("Expected scope where");
      expect(resolveScope(args.where).fragments).toMatchObject([{ kind: "filter", filter: { age: { gte: 18 } } }]);
      expect(args).toMatchObject({
        orderBy: [{ age: "DESC" }],
        limit: 5,
        offset: 2,
      });
    });
  });

  describe("batching", () => {
    it("does not dedupe distinct scopes that share a query structure", async () => {
      await insertAuthor({ first_name: "a1", age: 20 }); // adult, not senior
      await insertAuthor({ first_name: "a2", age: 70 }); // adult and senior
      await insertAuthor({ first_name: "a3", age: 10 }); // neither
      resetQueryCount();
      const em = newEntityManager();
      // `adult` (age>=18) and `senior` (age>=65) compile to the same `age >= ?` structure, so they
      // land in the same dataloader batch (one SQL). The cache key hashes the *parsed* query (incl. the
      // 18 vs 65 values), not the opaque scope proxy, so they must stay distinct entries — if they
      // deduped, both finds would return the same rows.
      const [adults, seniors] = await Promise.all([em.find(Author, Author.adult), em.find(Author, Author.senior)]);
      expect(numberOfQueries).toEqual(1);
      expect(adults).toMatchEntity([{ firstName: "a1" }, { firstName: "a2" }]);
      expect(seniors).toMatchEntity([{ firstName: "a2" }]);
    });

    it("batches structurally identical join-introducing scopes into one query", async () => {
      await insertAuthor({ id: 1, first_name: "a1", age: 20 });
      await insertBook({ id: 1, title: "b1", author_id: 1 }); // matches b.title
      await insertAuthor({ id: 2, first_name: "a2", age: 20 });
      await insertBook({ id: 2, title: "other", author_id: 2 });
      await insertBookReview({ id: 1, book_id: 2, rating: 3 }); // matches r.rating
      await insertAuthor({ id: 3, first_name: "a3", age: 20 });
      await insertBook({ id: 3, title: "nope", author_id: 3 }); // matches neither
      resetQueryCount();
      const em = newEntityManager();
      // `titleOrRated` mints fresh `aliases()` on each parse, but both finds parse to the same
      // join structure + conditions, so they hash to the same dataloader batch / single SQL query.
      const [first, second] = await Promise.all([
        em.find(Author, Author.titleOrRated),
        em.find(Author, Author.titleOrRated),
      ]);
      expect(numberOfQueries).toEqual(1);
      expect(first).toMatchEntity([{ firstName: "a1" }, { firstName: "a2" }]);
      expect(second).toMatchEntity([{ firstName: "a1" }, { firstName: "a2" }]);
    });

    it("issues separate queries for scopes with different structures", async () => {
      await insertAuthor({ id: 1, first_name: "a1", age: 20 }); // adult, no books
      await insertAuthor({ id: 2, first_name: "a2", age: 10 }); // not adult, has books
      await insertAuthor({ id: 3, first_name: "a3", age: 20 }); // adult, has books
      await insertBook({ title: "b1", author_id: 2 });
      await insertBook({ title: "b2", author_id: 3 });
      resetQueryCount();
      const em = newEntityManager();
      // `adult` is a plain `age >= ?` column condition; `hasBooks` is a `books` EXISTS subquery, so
      // they have different structures, land in different batches, and issue two separate SQL queries.
      const [adults, withBooks] = await Promise.all([em.find(Author, Author.adult), em.find(Author, Author.hasBooks)]);
      expect(numberOfQueries).toEqual(2);
      expect(adults).toMatchEntity([{ firstName: "a1" }, { firstName: "a3" }]);
      expect(withBooks).toMatchEntity([{ firstName: "a2" }, { firstName: "a3" }]);
    });
  });
});
