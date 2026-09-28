import { run } from "joist-test-utils";
import { Context } from "src/context";
import {
  Author,
  Comment,
  LargePublisher,
  User,
  newAuthor,
  newBook,
  newComment,
  newLargePublisher,
  newSmallPublisher,
  newUser,
} from "src/entities";

import { jan1, jan2 } from "./testDates";

describe("run", () => {
  it.withCtx("mirrors a Book-to-Author parent switch and clearing both inverse collections", async (ctx) => {
    // Given a Book with a Comment in its loaded comments collection
    const book = newBook(ctx.em);
    // And the Comment's parent is cached as the Book entity
    const comment = newComment(ctx.em, { parent: book });
    // And an Author with an empty loaded comments collection
    const author = newAuthor(ctx.em);
    // When inspecting the initial loaded inverse collections
    // Then only the Book contains the Comment
    expect(book.comments.get).toEqual([comment]);
    expect(author.comments.get).toEqual([]);

    // When run switches the Comment's parent from the Book to the Author
    await run(ctx, async (ctx) => {
      const c = await ctx.em.load(Comment, comment.id);
      c.parent.set(await ctx.em.load(Author, author.id));
      await ctx.em.flush();
    });
    // Then the test EntityManager mirrors the parent and moves the Comment between inverse collections
    expect(comment.parent.get).toBe(author);
    expect(comment.parent.idMaybe).toBe(author.id);
    expect(book.comments.get).toEqual([]);
    expect(author.comments.get).toEqual([comment]);

    // When run clears the Comment's parent without enforcing its required-parent rule
    await run(ctx, async (ctx) => {
      const c = await ctx.em.load(Comment, comment.id);
      // And the parent is deliberately cleared despite Comment's required-parent rule to test nullable SQL columns
      c.setPartial({ parent: null });
      await ctx.em.flush({ skipValidation: true });
    });
    // Then the test EntityManager clears the reference, its ID, and both inverse collections
    expect(comment.parent.get).toBeUndefined();
    expect(comment.parent.idMaybe).toBeUndefined();
    expect(book.comments.get).toEqual([]);
    expect(author.comments.get).toEqual([]);
  });

  it.withCtx("mirrors polymorphic parent changes and clearing prepopulated data", async (ctx) => {
    // Given a SmallPublisher in the test EntityManager
    const small = newSmallPublisher(ctx.em);
    // And a User with a prepopulated favorite publisher
    const user = newUser(ctx.em, { favoritePublisher: small });
    // And a LargePublisher with an Author to satisfy its required spotlightAuthor default
    const large = newLargePublisher(ctx.em, { authors: [{}] });

    // When run changes the User's favorite publisher from the SmallPublisher to the LargePublisher
    await run(ctx, async (ctx) => {
      const u = await ctx.em.load(User, user.id);
      u.favoritePublisher.set(await ctx.em.load(LargePublisher, large.id));
      await ctx.em.flush();
    });
    // Then the test EntityManager's prepopulated reference points to the LargePublisher
    expect(user.favoritePublisher.get).toBe(large);
    expect(user.favoritePublisher.idMaybe).toBe(large.id);

    // When run clears the User's favorite publisher
    await run(ctx, async (ctx) => {
      const u = await ctx.em.load(User, user.id);
      u.favoritePublisher.set(undefined);
      await ctx.em.flush();
    });
    // Then the test EntityManager's reference and its ID are cleared
    expect(user.favoritePublisher.get).toBeUndefined();
    expect(user.favoritePublisher.idMaybe).toBeUndefined();
  });

  it.withCtx("does not loop with classes", async (ctx) => {
    class Foo {
      constructor(private ctx: Context) {}
    }
    await run(ctx, () => {
      return { foo: new Foo(ctx) };
    });
  });

  it.withCtx("mirrors an inserted date back as a date", async (ctx) => {
    // When a `run` inserts a row with a date
    const a1 = await run(ctx, async (ctx) => {
      const a1 = ctx.em.create(Author, { firstName: "a1", graduated: jan1 });
      await ctx.em.flush();
      return a1;
    });
    // Then the test em sees a Date, and not the ISO string we sent to the driver
    expect(a1.graduated).toEqual(jan1);
  });

  it.withCtx("mirrors an updated date back as a date", async (ctx) => {
    // Given an author that graduated jan1
    const a1 = newAuthor(ctx.em, { graduated: jan1 });

    // When a `run` moves it to jan2
    await run(ctx, async (ctx) => {
      const a = await ctx.em.load(Author, a1.idTagged);
      a.graduated = jan2;
      await ctx.em.flush();
    });

    // Then the test em sees a Date, and not the ISO string we sent to the driver
    expect(a1.graduated).toEqual(jan2);
  });
});
