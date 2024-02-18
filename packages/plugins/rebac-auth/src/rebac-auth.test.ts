import { alias, getMetadata } from "joist-orm";
import {
  Author,
  Book,
  Comment,
  User,
  finds,
  insertAuthor,
  insertBook,
  insertBookReview,
  insertComment,
  insertUser,
  insertUserLikedComment,
  newEntityManager,
} from "joist-tests-integration";
import { RebacAuthPlugin } from "./RebacAuthPlugin";
import { AuthRule, parseAuthRule } from "./authRule";
// Import to get `toMatchEntity` in scope
import "joist-test-utils";

const um = getMetadata(User);
const r = "r";
const rw = "rw";
const i = "i";

// Should there be a single rule from the user -> everything they can see/do/touch?
// Or per-entity rules that are stitched together?
//
// Per-entity rules are more scalable, but loose "how did we get here" context
// (i.e. is it 'my book' or 'your book' depends on the FKs that were walked to get
// here) and also "what user is this?" I.e. to have per-user type rules, the per-entity
// rule would need to be parameterized by the user.
//
// A single per-user rule seems more able to "do one up-front query" i.e. to find
// Tasks the user can see, and then use the subrules to apply/check auth in memory.
//
// A single per-unit rule would be hard to adapt for a user that changes roles based
// on the scope, i.e. in Project A they're a super, but in Project B they're a PM.
// Granted, this seems odd but needs to be supported. With a single-user rule, these
// checked would move into `where { role: ... }` clauses within a giant "internal user"
// rule.
//
// A single per-unit rule is easy to know ahead-of-time, vs. a per-entity rule, we need
// to ask "what [tasks | books | authors] can this person see?" before even having
// "which task" loaded from the db.
const rule: AuthRule<User> = {
  email: r,
  name: rw,
  bio: rw,
  authorManyToOne: {
    // Support binding alias { as: m }
    where: { firstName: "u1" },
    books: {
      entity: "crud",
      title: rw,
      "*": rw,
      publish: i,
    },
  },
};

describe("rebac-auth", () => {
  describe("o2m", () => {
    it("can filter em.find with a new o2m join", async () => {
      // Given two authors with their own books
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 2 });
      await insertUser({ name: "u1", author_id: 1 });
      // And the user can only see one book
      const rule: AuthRule<User> = { authorManyToOne: { books: {} } };
      const em = newEntityManager({
        findPlugin: new RebacAuthPlugin(um, "u:1", rule),
      });
      // When we `em.find` with no existing joins
      const books = await em.find(Book, {});
      // Then we only got one back
      expect(books.length).toBe(1);
      // And we added a new join
      expect(finds[0].tables).toEqual([
        { alias: "b", table: "books", join: "primary" },
        { alias: "a", table: "authors", join: "inner", col1: "b.author_id", col2: "a.id" },
        { alias: "u", table: "users", join: "inner", col1: "a.id", col2: "u.author_id" },
      ]);
    });

    it("can filter em.find with existing o2m join", async () => {
      // Given two authors with their own books
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 2 });
      await insertUser({ name: "u1", author_id: 1 });
      // And the user can only see their one book
      const rule: AuthRule<User> = { authorManyToOne: { books: {} } };
      const em = newEntityManager({
        findPlugin: new RebacAuthPlugin(um, "u:1", rule),
      });
      // When we `em.find` with an existing book -> author join
      const books = await em.find(Book, { author: "a:1" });
      // Then we only got one back
      expect(books.length).toBe(1);
      // And we reused the existing authors join
      expect(finds[0].tables).toEqual([
        { alias: "b", table: "books", join: "primary" },
        { alias: "a", table: "authors", join: "inner", col1: "b.author_id", col2: "a.id" },
        { alias: "u", table: "users", join: "inner", col1: "a.id", col2: "u.author_id" },
      ]);
    });

    it("can filter em.find with existing o2m join and existing AND condition", async () => {
      // Given two authors with their own books
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "a1", author_id: 1 });
      await insertBook({ title: "a2", author_id: 1 });
      await insertBook({ title: "b1", author_id: 2 });
      await insertUser({ name: "u1", author_id: 1 });
      // And the user can only see their one book
      const rule: AuthRule<User> = { authorManyToOne: { books: {} } };
      const em = newEntityManager({
        findPlugin: new RebacAuthPlugin(um, "u:1", rule),
      });
      // When we query for books with `1` in the title
      const books = await em.find(Book, { title: { like: "%1%" } });
      expect(books.length).toBe(1);
    });

    it("can filter em.find with existing o2m join with 'where' at end of path", async () => {
      // Given two books
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      await insertUser({ name: "u1", author_id: 1 });
      const rule: AuthRule<User> = {
        authorManyToOne: {
          books: {
            // And the user can only see certain books
            where: { title: "b2" },
          },
        },
      };
      const em = newEntityManager({
        findPlugin: new RebacAuthPlugin(um, "u:1", rule),
      });
      // When we query for books with `b` in the title
      const books = await em.find(Book, { title: { like: "b%" } });
      // Then we also limited it to the b2 title
      expect(books.length).toBe(1);
    });

    it("can filter em.find with existing o2m join with 'where' in middle of path", async () => {
      // Given two books
      await insertAuthor({ first_name: "a1", age: 20 });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      await insertUser({ name: "u1", author_id: 1 });
      const rule: AuthRule<User> = {
        authorManyToOne: {
          // And the user can only see certain authors
          where: { age: { gt: 30 } },
          books: {},
        },
      };
      const em = newEntityManager({
        findPlugin: new RebacAuthPlugin(um, "u:1", rule),
      });
      // When we query for books with `b` in the title
      const books = await em.find(Book, { title: { like: "b%" } }, { softDeletes: "include" });
      // Then we didn't get back any books
      expect(books.length).toBe(0);
      expect(finds[0].condition).toEqual({
        op: "and",
        conditions: [
          { alias: "b", column: "title", dbType: "character varying", cond: { kind: "like", value: "b%" } },
          { alias: "u", column: "id", dbType: "int", cond: { kind: "eq", value: "1" } },
          { alias: "a", column: "age", dbType: "int", cond: { kind: "gt", value: 30 } },
        ],
      });
    });

    it("can filter em.find with existing o2m join and existing OR condition", async () => {
      // Given two authors with their own books
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "a1", author_id: 1 });
      await insertBook({ title: "a2", author_id: 1 });
      await insertBook({ title: "b1", author_id: 2 });
      await insertUser({ name: "u1", author_id: 1 });
      // And the user can only see their one book
      const rule: AuthRule<User> = { authorManyToOne: { books: {} } };
      const em = newEntityManager({
        findPlugin: new RebacAuthPlugin(um, "u:1", rule),
      });
      // When we query for books with `1` in the title
      const b = alias(Book);
      const books = await em.find(
        Book,
        { as: b },
        {
          conditions: { or: [b.title.eq("a1"), b.title.eq("b1")] },
          softDeletes: "include",
        },
      );
      // Then we only got one back
      expect(books.length).toBe(1);
      // And we wrapped the `or` condition with our own `and`
      expect(finds[0].condition).toEqual({
        op: "and",
        conditions: [
          {
            op: "or",
            conditions: [
              { alias: "b", column: "title", dbType: "character varying", cond: { kind: "eq", value: "a1" } },
              { alias: "b", column: "title", dbType: "character varying", cond: { kind: "eq", value: "b1" } },
            ],
          },
          { alias: "u", column: "id", dbType: "int", cond: { kind: "eq", value: "1" } },
        ],
      });
    });
  });

  describe("m2o", () => {
    it("can filter em.find with a new m2o join", async () => {
      // Given two users with comments
      await insertAuthor({ first_name: "a1" });
      await insertUser({ name: "u1" });
      await insertUser({ name: "u2" });
      await insertComment({ text: "c1", user_id: 1, parent_author_id: 1 });
      await insertComment({ text: "c2", user_id: 2, parent_author_id: 1 });
      // And a 3rd user that liked the 1st comment
      await insertUser({ name: "u3" });
      await insertUserLikedComment({ liked_by_user_id: 3, comment_id: 1 });
      // And the user can only see users of comments they liked
      const rule: AuthRule<User> = { likedComments: { user: { name: "r" } } };
      const em = newEntityManager({
        findPlugin: new RebacAuthPlugin(um, "u:3", rule),
      });
      // When we `em.find` with no existing joins
      const users = await em.find(User, {});
      // Then we only got one back
      expect(users).toMatchEntity([{ name: "u1" }]);
      // And we added a new join
      expect(finds[0].tables).toEqual([
        { alias: "u", table: "users", join: "primary" },
        { alias: "u_s0", table: "admin_users", join: "outer", col1: "u.id", col2: "u_s0.id", distinct: false },
        { alias: "c", table: "comments", join: "outer", col1: "u.id", col2: "c.user_id" },
        { alias: "utc", table: "users_to_comments", join: "outer", col1: "c.id", col2: "utc.comment_id" },
        { alias: "u1", table: "users", join: "outer", col1: "utc.liked_by_user_id", col2: "u1.id" },
      ]);
    });

    it("can filter em.find with existing m2o join", async () => {
      // Given two users with comments
      await insertAuthor({ first_name: "a1" });
      await insertUser({ name: "u1" });
      await insertUser({ name: "u2" });
      await insertComment({ text: "c1", user_id: 1, parent_author_id: 1 });
      await insertComment({ text: "c2", user_id: 2, parent_author_id: 1 });
      // And a 3rd user that liked the 1st comment
      await insertUser({ name: "u3" });
      await insertUserLikedComment({ liked_by_user_id: 3, comment_id: 1 });
      // And the user can only see users of comments they liked
      const rule: AuthRule<User> = { likedComments: { user: { name: "r" } } };
      const em = newEntityManager({
        findPlugin: new RebacAuthPlugin(um, "u:3", rule),
      });
      // When we `em.find` with an existing join from u1 -> comments
      const users = await em.find(User, { createdComments: { text: "c1" } });
      // Then we only got one back
      expect(users).toMatchEntity([{ name: "u1" }]);
      // And we reused the `u` -> `c` join
      expect(finds[0].tables).toEqual([
        { alias: "u", table: "users", join: "primary" },
        { alias: "u_s0", table: "admin_users", join: "outer", col1: "u.id", col2: "u_s0.id", distinct: false },
        { alias: "c", table: "comments", join: "outer", col1: "u.id", col2: "c.user_id" },
        { alias: "utc", table: "users_to_comments", join: "outer", col1: "c.id", col2: "utc.comment_id" },
        { alias: "u1", table: "users", join: "outer", col1: "utc.liked_by_user_id", col2: "u1.id" },
      ]);
    });
  });

  it("can load a o2m relation", async () => {
    // Given a user that's an author
    await insertAuthor({ first_name: "a1" });
    await insertUser({ name: "u1", author_id: 1 });
    // And they can only see their books but not their comments
    const rule: AuthRule<User> = { authorManyToOne: { books: {} } };
    const em = newEntityManager({
      findPlugin: new RebacAuthPlugin(um, "u:1", rule),
    });
    // When we load the author
    const a = await em.findOneOrFail(Author, { userOneToOne: "u:1" }, {});
    // Then we can access their books
    expect(await a.books.load()).toEqual([]);
    // But not their comments
    await expect(a.comments.load()).rejects.toThrow("Access denied to Author:1.comments");
  });

  it("can load a o2m then o2m relation", async () => {
    // Given a user that's an author
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBookReview({ book_id: 1, rating: 1 });
    await insertUser({ name: "u1", author_id: 1 });
    // And they can see their books and reviews
    const rule: AuthRule<User> = { authorManyToOne: { books: { reviews: {} } } };
    const em = newEntityManager({
      findPlugin: new RebacAuthPlugin(um, "u:1", rule),
    });
    // When we load the author
    const a = await em.findOneOrFail(Author, { userOneToOne: "u:1" }, {});
    // Then we can access their books
    const books = await a.books.load();
    // And the book's reviews
    expect(await books[0].reviews.load()).toBeDefined();
    // But not the review's comments
    await expect(books[0].comments.load()).rejects.toThrow("Access denied to Book:1.comments");
  });

  it("can load async property", async () => {
    // Given a user that's an author
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertUser({ name: "u1", author_id: 1 });
    // And they can read their first name, ssn, but not age
    const rule: AuthRule<User> = { authorManyToOne: { allPublisherAuthorNames: "r", publisher: { name: "r" } } };
    const em = newEntityManager({
      findPlugin: new RebacAuthPlugin(um, "u:1", rule),
    });
    // When we load the author
    const a = await em.findOneOrFail(Author, { userOneToOne: "u:1" }, { populate: "allPublisherAuthorNames" });
    // Then they can read the async property
    noop(a.allPublisherAuthorNames.get);
    // But not their age
    expect(() => noop(a.age)).toThrow("Access denied to Author:1.age");
  });

  it("can navigate through a poly", async () => {
    // Given a user that's an author
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertUser({ name: "u1", author_id: 1 });
    await insertUser({ name: "u2" });
    await insertComment({ text: "c1", user_id: 2, parent_author_id: 1 });
    await insertComment({ text: "c2", user_id: 2, parent_author_id: 1 });
    await insertComment({ text: "c3", user_id: 2, parent_book_id: 1 });
    // And u1 can read the user's of comments on their author
    const rule: AuthRule<User> = { authorManyToOne: { comments: { user: { name: "r" } } } };
    const em = newEntityManager({
      findPlugin: new RebacAuthPlugin(um, "u:1", rule),
    });
    // When we load the comments
    const comments = await em.find(Comment, {}, { populate: "user" });
    // Then we only found the two attached to the Author
    expect(comments.length).toBe(2);
    expect(comments[0].user.get?.name).toBe("adsf");
  });

  it("can auth field reads", async () => {
    // Given a user that's an author
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertUser({ name: "u1", author_id: 1 });
    // And they can read their first name, ssn, but not age
    const rule: AuthRule<User> = { authorManyToOne: { firstName: "rw", ssn: "r" } };
    const em = newEntityManager({
      findPlugin: new RebacAuthPlugin(um, "u:1", rule),
    });
    // When we load the author
    const a = await em.findOneOrFail(Author, { userOneToOne: "u:1" }, {});
    // Then they can read their firstName
    noop(a.firstName);
    // And ssn
    noop(a.ssn);
    // But not their age
    expect(() => noop(a.age)).toThrow("Access denied to Author:1.age");
  });

  it("can auth field writes", async () => {
    // Given a user that's an author
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertUser({ name: "u1", author_id: 1 });
    // And they can write their own first name, but only read their ssn
    const rule: AuthRule<User> = { authorManyToOne: { firstName: "rw", ssn: "r" } };
    const em = newEntityManager({
      findPlugin: new RebacAuthPlugin(um, "u:1", rule),
    });
    // When we load the author
    const a = await em.findOneOrFail(Author, { userOneToOne: "u:1" }, {});
    // Then we can write to the firstName
    a.firstName = "a2";
    // But they cannot write to the ssn because it's read-only
    expect(() => (a.ssn = "ssn2")).toThrow("Access denied to Author:1.ssn");
    // And they cannot write to age which is omitted
    expect(() => (a.age = 30)).toThrow("Access denied to Author:1.age");
  });

  it("can auth field reads of getters", async () => {
    // Given a user that's an author
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertUser({ name: "u1", author_id: 1 });
    // And they can read their first name, ssn, but not age
    const rule: AuthRule<User> = { authorManyToOne: { isPopular: "rw" } };
    const em = newEntityManager({
      findPlugin: new RebacAuthPlugin(um, "u:1", rule),
    });
    // When we load the author
    const a = await em.findOneOrFail(Author, { userOneToOne: "u:1" }, {});
    // Then they can read their firstName
    noop(a.isPopular);
  });

  it("can parse star field rules", () => {
    // Given a rule that uses `*` to mean "all fields"
    const rule: AuthRule<User> = {
      "*": rw,
      authorManyToOne: { books: { "*": r } },
    };
    // Then we can parse it
    const parsed = parseAuthRule(um, rule);
    expect(parsed).toMatchObject({
      User: [{ fields: { "*": "rw" }, pathToUser: [] }],
      Author: [{ fields: {}, pathToUser: [{ relation: "userOneToOne" }] }],
      Book: [{ fields: { "*": "r" }, pathToUser: [{ relation: "author" }, { relation: "userOneToOne" }] }],
    });
  });

  it("can explicit field rules", () => {
    // Given a rule that uses `*` to mean "all fields"
    const rule: AuthRule<User> = {
      authorManyToOne: { firstName: rw, ssn: r, books: { title: r } },
    };
    // Then we can parse it
    const parsed = parseAuthRule(um, rule);
    expect(parsed).toMatchObject({
      User: [{ fields: {} }],
      Author: [{ fields: { firstName: rw, ssn: r } }],
      Book: [{ fields: { title: r } }],
    });
  });

  it("can parse method invocation rules", () => {
    // Given a rule that can invoke the `publish` method
    const rule: AuthRule<User> = {
      authorManyToOne: { books: { publish: i } },
    };
    // Then we can parse it
    const parsed = parseAuthRule(um, rule);
    expect(parsed).toMatchObject({
      Book: [{ methods: { publish: "i" } }],
    });
  });

  it("can parse where scopes", () => {
    // Given a rule that can invoke the `publish` method
    const rule: AuthRule<User> = {
      authorManyToOne: { books: { where: { title: "b1" } } },
    };
    // Then we can parse it
    const parsed = parseAuthRule(um, rule);
    expect(parsed).toMatchObject({
      Book: [{ where: { title: "b1" } }],
    });
  });

  it("can parse where scopes in the middle", () => {
    // Given a rule that can invoke the `publish` method
    const rule: AuthRule<User> = {
      authorManyToOne: { where: { age: { gt: 20 } }, books: {} },
    };
    // Then we can parse it
    const parsed = parseAuthRule(um, rule);
    expect(parsed).toMatchObject({
      Book: [
        {
          where: undefined,
          pathToUser: [
            // one
            { relation: "author", where: { age: { gt: 20 } } },
            { relation: "userOneToOne" },
          ],
        },
      ],
    });
  });

  it("can filter in findOrCreate", async () => {
    // Given two users and the 2nd user has a comment
    await insertAuthor({ first_name: "a1" });
    await insertUser({ name: "u1", author_id: 1 });
    await insertUser({ name: "u2" });
    await insertComment({ text: "c1", user_id: 2 });
    // And u1 can only see comments they've created
    const rule: AuthRule<User> = { createdComments: { text: r } };
    const em = newEntityManager({
      findPlugin: new RebacAuthPlugin(um, "u:1", rule),
    });
    // When we `em.findOrCreate` a comment with text: c1
    const a1 = await em.load(Author, "a:1");
    const comment = await em.findOrCreate(Comment, { text: "c1" }, { parent: a1 });
    // Then we created a new comment
    expect(comment.isNewEntity).toBe(true);
    // And we added a new join
    expect(finds[0].tables).toEqual([
      { alias: "b", table: "books", join: "primary" },
      { alias: "a", table: "authors", join: "inner", col1: "b.author_id", col2: "a.id" },
      { alias: "u", table: "users", join: "inner", col1: "a.id", col2: "u.author_id" },
    ]);
  });
});

// maybe use it for auth rules like:
// { read: "fullName email", write: "firstName lastName" }

// Should 'Permissions' be an explicit entity? Why/why not?
// The two obvious permissions are "read" and "write" ... CRUD.
// Everything else is "can I invoke operation x?"
// Maybe that's what we do, is build in PotentialOperation as Operation,
// which can be `book.publish.isAllowed()` or `book.publish.call()`d, i.e.
// very similar to AsyncMethods but when the ability to say "the user is
// or is not allowed to do this".
// And then because `book.publish` shows up in the AuthRule graph, it can
// the auth-side side of allowed could be handled by the rebac plugin?

function noop(value: unknown): void {}
