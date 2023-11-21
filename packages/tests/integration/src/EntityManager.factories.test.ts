import {
  AdvanceStatus,
  Author,
  Book,
  Comment,
  CommentParent,
  LargePublisher,
  lastAuthorFactoryOpts,
  lastBookFactoryOpts,
  lastCriticFactory,
  newAuthor,
  newBook,
  newBookAdvance,
  newBookReview,
  newCritic,
  newCriticColumn,
  newImage,
  newLargePublisher,
  newPublisher,
  newSmallPublisher,
  Publisher,
  PublisherType,
  SmallPublisher,
} from "@src/entities";
import { isPreloadingEnabled, newEntityManager, queries, resetQueryCount } from "@src/testEm";
import { maybeNew, maybeNewPoly, newTestInstance, testIndex } from "joist-orm";

describe("EntityManager.factories", () => {
  it("can create a single top-level entity", async () => {
    const em = newEntityManager();
    // Given a simple entity that has no required parents/children
    const p1 = newPublisher(em);
    await em.flush();
    // Then we create only that entity
    expect(p1.name).toEqual("LargePublisher 1");
    expect(em.numberOfEntities).toEqual(1);
  });

  it("can create a child and a required parent implicity", async () => {
    const em = newEntityManager();
    // Given we make a book with no existing/passed authors
    const b1 = newBook(em);
    await em.flush();
    // Then we create the author b/c it's required
    expect(b1.author.get.firstName).toEqual("a1");
  });

  it("can create a child and a required parent if opt is undefined", async () => {
    const em = newEntityManager();
    // Given we make a book with no existing/passed authors
    newBook(em, { author: undefined });
    // Then we still create the author b/c it's required and we assume the factory did
    // `const { author } = opts` and doesn't _really_ want the author undefined.
    // If they do, they can pass `null`.
    await em.flush();
  });

  it("can create a child and a required parent with opts", async () => {
    const em = newEntityManager();
    // Given we make a book with no existing/passed authors
    const b1 = newBook(em, { author: { firstName: "long name" } });
    await em.flush();
    // Then we create the author b/c it's required
    expect(b1.author.get.firstName).toEqual("long name");
    // And we kept the Book.factories.ts `{ age: 40 }` default
    expect(b1.author.get.age).toEqual(40);
  });

  it("can create a child and a required parent with opts that ignore a default", async () => {
    const em = newEntityManager();
    // Given we make a book and want the author's age to stay unset
    // (...and set isPopular so that newAuthor does an { age: 50 } that we can see is ignored)
    const b1 = newBook(em, { author: { isPopular: true, age: undefined } });
    await em.flush();
    // Then age is undefined
    expect(b1.author.get.age).toBeUndefined();
  });

  it("can create a child and use an existing parent from opt", async () => {
    const em = newEntityManager();
    // Given there are multiple existing authors
    const [a1] = [newAuthor(em), newAuthor(em)];
    // When we explicitly pass it as an opt
    const b1 = newBook(em, { author: a1 });
    await em.flush();
    // Then it is used
    expect(b1.author.get).toEqual(a1);
  });

  it("can create a child and use an existing parent from use", async () => {
    const em = newEntityManager();
    // Given there are multiple existing authors
    const [a1] = [newAuthor(em), newAuthor(em)];
    // When we explicitly pass it as use
    const b1 = newBook(em, { use: a1 });
    await em.flush();
    // Then it is used
    expect(b1.author.get).toEqual(a1);
  });

  it("can create a child and use an existing parent from EntityManager", async () => {
    const em = newEntityManager();
    // Given there is only a single author
    const a1 = newAuthor(em);
    // When we make a book and don't specify the author
    const b1 = newBook(em);
    await em.flush();
    // Then the first author was chosen
    expect(b1.author.get).toEqual(a1);
  });

  it("can create a child and create a new parent if already many existing", async () => {
    const em = newEntityManager();
    // Given there are already several authors
    const a1 = newAuthor(em);
    const a2 = newAuthor(em);
    // When we make a book and don't specify the author
    const b1 = newBook(em);
    await em.flush();
    // Then it got a new author
    expect(b1.author.get).not.toEqual(a1);
    expect(b1.author.get).not.toEqual(a2);
    expect(b1.author.get.firstName).toEqual("a3");
  });

  it("can create a child and override the parent's default child", async () => {
    const em = newEntityManager();
    // Given we make a book that requires an author
    newBook(em);
    // Then the newAuthor factory was told to override any `books: [{}]` defaults
    expect(lastAuthorFactoryOpts).toStrictEqual({
      age: 40,
      books: [],
      use: expect.any(Map),
    });
  });

  it("can create a grandchild and specify the grandparent", async () => {
    const em = newEntityManager();
    // Given there are multiple existing publishers
    const [p1] = [newPublisher(em), newPublisher(em)];
    // When we make a book and pass along the specific publisher p1
    const b1 = newBook(em, { use: p1 });
    // Then we created a new author
    const a1 = b1.author.get;
    expect(a1.firstName).toEqual("a1");
    // And it has the publisher set
    expect(a1.publisher.get).toEqual(p1);
    // And we explicitly passed the publisher b/c it's an explicit `use` entry
    expect(lastAuthorFactoryOpts).toStrictEqual({
      age: 40,
      books: [],
      publisher: p1,
      use: expect.any(Map),
    });
  });

  it("can create a grandchild and specify the grandparents opts", async () => {
    const em = newEntityManager();
    // When we make a book and have opts for the grandparent
    const b1 = newBook(em, { author: { publisher: { name: "p1" } } });
    await em.flush();
    // Then we create a new author
    const a1 = b1.author.get;
    expect(a1.firstName).toEqual("a1");
    // And we create a new publisher
    const p1 = a1.publisher.get!;
    expect(p1.name).toEqual("p1");
  });

  it("can create a parent and child with opts", async () => {
    const em = newEntityManager();
    // Given we make a new parent + two children
    const a1 = newAuthor(em, { books: [{ title: "b1" }, {}] });
    await em.flush();
    // Then we have the 1st book
    const b1 = a1.books.get[0];
    expect(b1.title).toEqual("b1");
    expect(b1.author.get).toEqual(a1);
    // And the 2nd book
    const b2 = a1.books.get[1];
    expect(b2.title).toEqual("title");
    expect(b2.author.get).toEqual(a1);
    // And we didn't create an extra author
    expect(em.numberOfEntities).toEqual(3);
    // And the book factory saw the real author and not a null marker
    expect(lastBookFactoryOpts).toStrictEqual({
      author: expect.any(Author),
      use: expect.any(Map),
    });
  });

  it("can default a required enum", async () => {
    const em = newEntityManager();
    // Given we make a book advance
    const ba = newBookAdvance(em);
    // Then the status field is set to the 1st enum value
    expect(ba.status).toEqual(AdvanceStatus.Pending);
  });

  it("can tweak opts in the factory", async () => {
    const em = newEntityManager();
    const a = newAuthor(em, { isPopular: true });
    expect(a.age).toEqual(50);
  });

  it("can completely customize opts in the factory", async () => {
    const em = newEntityManager();
    const b = newBook(em, { tags: [1, 2] });
    expect(b.tags.get[0].name).toEqual("1");
    expect(b.tags.get[1].name).toEqual("2");
  });

  it("cannot pass invalid customized opts", async () => {
    const em = newEntityManager();
    // @ts-expect-error
    newBook(em, { tags: [new Date()] });
  });

  it("can use tagged ids as shortcuts", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const b1 = newBook(em, { author: "a:1" });
    expect(b1.author.get).toEqual(a1);
  });

  it("can use tagged ids as shortcuts in list", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const p1 = newPublisher(em, { authors: ["a:1"] });
    expect(p1.authors.get).toEqual([a1]);
  });

  it("can omit default values for non-required primitive fields", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    expect(a1.firstName).toEqual("a1");
    expect(a1.lastName).toBeUndefined();
  });

  it("uses the entity's default values for primitives", async () => {
    const em = newEntityManager();
    const b1 = newBook(em);
    expect(b1.order).toEqual(1);
  });

  it("uses the entity's default values for enums", async () => {
    const em = newEntityManager();
    const p1 = newPublisher(em);
    expect(p1.type).toEqual(PublisherType.Big);
  });

  it("should default children to empty array if created bottom-up", async () => {
    const em = newEntityManager();
    newBookReview(em, { book: {} });
    expect(lastBookFactoryOpts).toStrictEqual({
      title: `Book for Review ${testIndex}`,
      reviews: [],
      use: expect.any(Map),
    });
  });

  it("should default o2o as null if created bottom-up", async () => {
    const em = newEntityManager();
    newImage(em, { author: {} });
    expect(lastAuthorFactoryOpts).toStrictEqual({
      image: null,
      use: expect.any(Map),
    });
  });

  it("can create o2o from a parent", async () => {
    const em = newEntityManager();
    // author.image is an o2o
    newAuthor(em, { image: {} });
    expect(em.numberOfEntities).toEqual(2);
  });

  it("can create required o2o from o2o side explicitly", async () => {
    const em = newEntityManager();
    newCritic(em, { criticColumn: {} });
    expect(em.numberOfEntities).toEqual(2);
  });

  it("can create required o2o from m2o side explicitly", async () => {
    const em = newEntityManager();
    newCriticColumn(em, { critic: {} });
    expect(em.numberOfEntities).toEqual(2);
    expect(lastCriticFactory).toStrictEqual({
      criticColumn: null,
      use: expect.any(Map),
    });
  });

  it("can create required o2o from m2o side implicitly", async () => {
    const em = newEntityManager();
    newCriticColumn(em, {});
    expect(em.numberOfEntities).toEqual(2);
    expect(lastCriticFactory).toStrictEqual({
      criticColumn: null,
      use: expect.any(Map),
    });
  });

  it("should not reuse existing entities for o2os", async () => {
    const em = newEntityManager();
    // Given an existing image
    newImage(em);
    // When we create an entity that o2os to the image
    const a = newAuthor(em);
    // Then we don't use the existing image
    expect(a.image.get).toBeUndefined();
  });

  it("can reuse existing entities as m2o side of a o2o", async () => {
    const em = newEntityManager();
    // Given an existing author
    const a = newAuthor(em);
    expect(a.image.get).toBeUndefined();
    // When we create an entity that has a m2o to author
    const i1 = newImage(em);
    // Then the m2o reused the existing entity
    expect(i1.author.get).toEqual(a);
    // But if we make a _2nd_ image
    const i2 = newImage(em);
    // Then we don't use the same author b/c of the unique constraint
    expect(i2.author.get).toBeUndefined();
  });

  it("can reuse existing entities of a subtype", async () => {
    const em = newEntityManager();
    const sp = newSmallPublisher(em);
    const a = newAuthor(em);
    expect(a.publisher.get).toBe(sp);
  });

  it("can reuse existing entities of a subtype via use", async () => {
    const em = newEntityManager();
    const [sp1] = [newSmallPublisher(em), newSmallPublisher(em)];
    const a = newAuthor(em, { use: sp1 });
    expect(a.publisher.get).toBe(sp1);
  });

  it("can create m2m", async () => {
    const em = newEntityManager();
    newBook(em, { tags: [{}, {}] });
    await em.flush();
  });

  it("can create a singleton", async () => {
    const em = newEntityManager();
    // Given we have an existing author
    const a1 = newTestInstance(em, Author, {}, {});
    // And a factory wants to dedup authors on firstName
    const a2 = newTestInstance(
      em,
      Author,
      {},
      { useExisting: (opts, existing) => opts.firstName === existing.firstName },
    );
    // Then we got back the same author
    expect(a2).toMatchEntity(a1);
  });

  describe("maybeNew", () => {
    it("creates a new entity if needed", async () => {
      const em = newEntityManager();
      const a = newTestInstance(em, Author, {
        publisher: maybeNew<Publisher>({}),
      });
      expect(a.publisher.get).toBeInstanceOf(Publisher);
    });

    it("uses an if-only-one entity", async () => {
      const em = newEntityManager();
      const p = newPublisher(em);
      const a = newTestInstance(em, Author, {
        publisher: maybeNew<Publisher>({}),
      });
      expect(a.publisher.get).toEqual(p);
    });

    it("creates new if there is no obvious default entity to choose", async () => {
      const em = newEntityManager();
      const p1 = newPublisher(em);
      const p2 = newPublisher(em);
      const a = newTestInstance(em, Author, {
        publisher: maybeNew<Publisher>({}),
      });
      expect(a.publisher.get).not.toEqual(p1);
      expect(a.publisher.get).not.toEqual(p2);
      expect(a.publisher.get).toBeInstanceOf(Publisher);
    });

    it("uses a use entity", async () => {
      const em = newEntityManager();
      const [, p2] = [newPublisher(em), newPublisher(em)];
      const a = newTestInstance(em, Author, {
        publisher: maybeNew<Publisher>({}),
        use: p2,
      });
      expect(a.publisher.get).toEqual(p2);
    });

    it("can provide defaults", async () => {
      const em = newEntityManager();
      const a = newTestInstance(em, Author, {
        publisher: maybeNew<Publisher>({ name: "p2" }),
      });
      expect(a.publisher.get!.name).toEqual("p2");
    });
  });

  describe("maybeNewPoly", () => {
    it("should use the Author from an existing Book for the Comment.parent", async () => {
      const em = newEntityManager();
      const b1 = newBook(em);
      const ft1 = newTestInstance(em, Comment, {
        parent: maybeNewPoly<CommentParent, Author>(Author, {
          existingSearchOrder: [Author, Book, Publisher],
        }),
      });
      expect(ft1.parent.get).toEqual(b1.author.get);
    });

    it("should use an existing Publisher for the Comment.parent when no Book or Author exist", async () => {
      const em = newEntityManager();
      const p1 = newPublisher(em);
      const ft1 = newTestInstance(em, Comment, {
        parent: maybeNewPoly<CommentParent, Author>(Author, { existingSearchOrder: [Author, Book, Publisher] }),
      });
      expect(ft1.parent.get).toEqual(p1);
    });

    it("should use an existing Publisher for the Comment.parent even though there is a book/author", async () => {
      const em = newEntityManager();
      const p1 = newLargePublisher(em);
      newBook(em);
      const ft1 = newTestInstance(em, Comment, {
        parent: maybeNewPoly<CommentParent>(SmallPublisher, { existingSearchOrder: [Publisher, Author, Book] }),
      });
      expect(ft1.parent.get).toEqual(p1);
    });

    it("creates a new entity if needed", async () => {
      const em = newEntityManager();
      const ft1 = newTestInstance(em, Comment, {
        parent: maybeNewPoly<CommentParent, Author>(Author, {
          ifNewOpts: { firstName: "test" },
          existingSearchOrder: [Author, Book, SmallPublisher],
        }),
      });
      expect(ft1.parent.isSet).toBe(true);
      const a1 = await ft1.parent.load();
      expect(a1).toBeInstanceOf(Author);
      expect((a1 as Author).firstName).toEqual("test");
    });

    it("creates a new entity if needed using the first component type", async () => {
      const em = newEntityManager();
      const ft1 = newTestInstance(em, Comment, {
        parent: {},
      });
      expect(ft1.parent.isSet).toBe(true);
      expect(ft1.parent.get).toBeInstanceOf(Author);
    });

    it("creates a new entity if needed without an opt passed", async () => {
      const em = newEntityManager();
      const ft1 = newTestInstance(em, Comment, {});
      expect(ft1.parent.isSet).toBe(true);
      expect(ft1.parent.get).toBeInstanceOf(Author);
    });

    it("reuse an entity if possible without an opt passed", async () => {
      const em = newEntityManager();
      const p = newSmallPublisher(em);
      const ft1 = newTestInstance(em, Comment, {});
      expect(ft1.parent.isSet).toBe(true);
      expect(ft1.parent.get).toBeInstanceOf(SmallPublisher);
    });

    it("creates a new entity when configured not to search for books as a possible default", async () => {
      const em = newEntityManager();
      newBook(em);
      const ft1 = newTestInstance(em, Comment, {
        parent: maybeNewPoly<CommentParent>(Author, {
          existingSearchOrder: [Author, Publisher],
        }),
      });
      expect(ft1.parent.isSet).toBe(true);
      expect(ft1.parent.get).toBeInstanceOf(Author);
    });

    it("uses an if-only-one entity", async () => {
      const em = newEntityManager();
      const p = newPublisher(em);
      const ft1 = newTestInstance(em, Comment, {
        parent: maybeNewPoly<CommentParent>(Author, { existingSearchOrder: [Publisher] }),
      });
      expect(ft1.parent.get).toEqual(p);
    });

    it("creates new if there is no obvious default entity to choose", async () => {
      const em = newEntityManager();
      const p1 = newPublisher(em);
      const p2 = newPublisher(em);
      const ft1 = newTestInstance(em, Comment, {
        parent: maybeNewPoly(SmallPublisher),
      });
      expect(ft1.parent.get).not.toEqual(p1);
      expect(ft1.parent.get).not.toEqual(p2);
      expect(ft1.parent.get).toBeInstanceOf(Publisher);
    });

    it("uses a use entity", async () => {
      const em = newEntityManager();
      const [, p2] = [newPublisher(em), newPublisher(em)];
      const ft1 = newTestInstance(em, Comment, {
        parent: maybeNewPoly(LargePublisher),
        use: p2,
      });
      expect(ft1.parent.get).toEqual(p2);
    });

    it("can provide defaults", async () => {
      const em = newEntityManager();
      const ft1 = newTestInstance(em, Comment, {
        parent: maybeNewPoly(LargePublisher, { ifNewOpts: { name: "p2" } }),
      });
      expect(ft1.parent.get).toBeInstanceOf(LargePublisher);
      expect((ft1.parent.get as Publisher).name).toEqual("p2");
    });
  });

  it("has deeply new relations", async () => {
    const em = newEntityManager();
    // Given an author with a book and a review
    const a = newAuthor(em, { books: [{ reviews: [{ rating: 1 }] }] });
    // Then the book is already preloaded
    expect(a.books.get[0].title).toBeDefined();
    // And the review is preloaded as well
    expect(a.books.get[0].reviews.get[0].rating).toBe(1);
  });

  it("has deeply new references", async () => {
    const em = newEntityManager();
    // Given an author with a comment
    const a = newAuthor(em, { comments: [{}] });
    // Then the comment is already deeply loaded
    expect(a.latestComment.get!.parent.get).toBe(a);
  });

  it("has loaded async properties", async () => {
    const em = newEntityManager();
    // Given an author with a book and a review
    const a = newAuthor(em, { books: [{}], comments: [{}] });
    // Then the async property is already preloaded
    expect(a.numberOfBooks.get).toBe(1);
    expect(a.numberOfBooks2.get).toBe(1);
    // And the async property is deeply loaded
    expect(a.latestComment2.get!.parent.get).toBe(a);
    expect(a.latestComments.get[0].parent.get).toBe(a);
  });

  it("refreshes newly created entities", async () => {
    const em = newEntityManager();
    // Given an author with a book and a review
    const a = newAuthor(em, { books: [{ reviews: [{ rating: 1 }] }] });
    await em.flush();
    // And another em creates a 2nd book
    const em2 = newEntityManager();
    newBook(em2, { author: await em2.load(Author, "a:1"), reviews: [{ rating: 2 }] });
    await em2.flush();
    // When our original em refreshes
    resetQueryCount();
    await em.refresh({ deepLoad: true });
    // Then both books are deeply loaded
    expect(a.books.get[0].reviews.get[0].rating).toBe(1);
    expect(a.books.get[1].reviews.get[0].rating).toBe(2);
    // And it took only 9 queries (vs. 26 without join preloading)
    expect(queries.length).toBe(isPreloadingEnabled ? 9 : 26);
  });

  it("uniquely assigns name fields", async () => {
    const em = newEntityManager();
    const [p1, p2] = [newPublisher(em), newPublisher(em)];
    expect(p1.name).toEqual("LargePublisher 1");
    expect(p2.name).toEqual("LargePublisher 2");
  });

  describe("useFactoryDefaults", () => {
    it("can ignore defaults on immediate opts", async () => {
      const em = newEntityManager();
      // Ignore the { age: 50 } in Author.factories.ts
      const a = newAuthor(em, { isPopular: true, useFactoryDefaults: false });
      expect(a.age).toBeUndefined();
    });

    it("can ignore defaults on nested opts", async () => {
      const em = newEntityManager();
      // Ignore the { title: ... } in BookReview.factories.ts
      const br = newBookReview(em, { book: { useFactoryDefaults: false } });
      expect(br.book.get.title).toEqual("title");
    });

    it("can ignore required field defaults", async () => {
      const em = newEntityManager();
      // Ignore even the { title: "title" } in newTestInstance
      const br = newBookReview(em, { book: { useFactoryDefaults: "none" } });
      expect(br.book.get.title).toBeUndefined();
      expect(br.book.get.author.get).toBeUndefined();
    });

    it("can ignore obvious defaults", async () => {
      const em = newEntityManager();
      // Given an existing author
      newAuthor(em);
      // We still ignore it
      const br = newBookReview(em, { book: { useFactoryDefaults: "none" } });
      expect(br.book.get.author.get).toBeUndefined();
    });

    it("can ignore maybeNew defaults", async () => {
      const em = newEntityManager();
      // Ignore the maybeNew({ age: 40 }); in Book.factories.ts
      const br3 = newBookReview(em, { book: { author: { useFactoryDefaults: false } } });
      expect(br3.book.get.author.get.age).toBeUndefined();
    });
  });

  it("can have test indexes that are numbers", async () => {
    const em = newEntityManager();
    const [b1, b2] = [newBook(em), newBook(em)];
    expect(b1.order).toBe(1);
    expect(b2.order).toBe(2);
  });
});
