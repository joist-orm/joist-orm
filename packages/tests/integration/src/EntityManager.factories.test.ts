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
  newChild,
  newChildGroup,
  newComment,
  newCritic,
  newCriticColumn,
  newImage,
  newLargePublisher,
  newParentGroup,
  newPublisher,
  newSmallPublisher,
  newTag,
  parentGroupBranchValue,
  Publisher,
  PublisherType,
  SmallPublisher,
} from "@src/entities";
import { isPreloadingEnabled, newEntityManager, queries, resetQueryCount } from "@src/testEm";
import { maybeNew, maybeNewPoly, newTestInstance, noValue, setFactoryWriter, testIndex } from "joist-orm";
import ansiRegex = require("ansi-regex");

let factoryOutput: string[] = [];

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

  it("can create a child and a required parent implicitly", async () => {
    const em = newEntityManager();
    // Given we make a book with no existing/passed authors
    const b1 = newBook(em, { useLogging: true });
    await em.flush();
    // Then we create the author b/c it's required
    expect(b1.author.get.firstName).toEqual("a1");
    expect(factoryOutput).toMatchInlineSnapshot(`
     [
       "Creating new Book at EntityManager.factories.test.ts:51↩",
       "  author = creating new Author↩",
       "    created Author#1 added to scope↩",
       "  created Book#1 added to scope↩",
     ]
    `);
  });

  it("can create a child and a required parent if opt is undefined", async () => {
    const em = newEntityManager();
    // Given we make a BookReview with no existing/passed authors
    newBookReview(em, { book: undefined });
    // Then we still create the book b/c it's required and we assume the factory did
    // `const { author } = opts` and doesn't _really_ want the author undefined.
    // If they do, they can pass `null`.
    await em.flush();
  });

  it("defers to setDefault when passed undefined", async () => {
    const em = newEntityManager();
    // Given two authors (to disable an obvious default)
    const [a1] = [newAuthor(em), newAuthor(em)];
    // And a publisher with a1 where Book.setDefault("author", ...) will find it
    const p = newPublisher(em, { authors: [a1] });
    // When we create the book
    const b = newBook(em, { author: undefined, tags: [{ publishers: [p] }] });
    // Then we did not make a new entity
    expect(b).toMatchEntity({ author: a1 });
    // Then we still create the author b/c it's required and we assume the factory did
    // `const { author } = opts` and doesn't _really_ want the author undefined.
    // If they do, they can pass `null`.
    await em.flush();
  });

  // This test is primarily documenting current behavior, more so than desired state;
  // i.e. it seems like `setDefault` should take precedence over `maybeNew`s.
  it("respects maybeNew when passed over setDefault", async () => {
    const em = newEntityManager();
    // Given two authors (to disable an obvious default)
    const [a1] = [newAuthor(em), newAuthor(em)];
    // And a publisher with a1 where Book.setDefault("author", ...) will find it
    const p = newPublisher(em, { authors: [a1] });
    // When we create the book
    const b = newBook(em, { author: maybeNew<Author>({}), tags: [{ publishers: [p] }] });
    // Then we made a new entity
    expect(em.entities.filter((e) => e instanceof Author)).toMatchEntity([{}, {}, {}]);
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

  it("can create a child and use an existing parent from scope", async () => {
    const em = newEntityManager();
    // Given there are multiple existing authors
    const [a1, a2] = [newAuthor(em), newAuthor(em)];
    // When we create a Tag with multiple Books that each need an Author
    const t1 = newTag(em, { books: [{}, {}], useLogging: true });
    await em.flush();
    // Then the books used the same new author
    const [b1, b2] = t1.books.get;
    expect(b1.author.get).toMatchEntity(b2.author.get);
    // And that author is neither a1 or a2
    expect(b1.author.get).not.toMatchEntity(a1);
    expect(b1.author.get).not.toMatchEntity(a2);
    expect(factoryOutput).toMatchInlineSnapshot(`
     [
       "Creating new Tag at EntityManager.factories.test.ts:142↩",
       "  created Tag#1 added to scope↩",
       "  books = creating new Book↩",
       "    author = creating new Author↩",
       "      created Author#3 added to scope↩",
       "    created Book#1 added to scope↩",
       "    tags = Tag#1 from opt↩",
       "  books = creating new Book↩",
       "    author = Author#3 from scope↩",
       "    created Book#2 added to scope↩",
       "    tags = Tag#1 from opt↩",
     ]
    `);
  });

  it("can create a child and use an existing parent from use", async () => {
    const em = newEntityManager();
    // Given there are multiple existing authors
    const [a1] = [newAuthor(em), newAuthor(em)];
    // When we explicitly pass it as use
    const b1 = newBook(em, { use: a1, useLogging: true });
    await em.flush();
    // Then it is used
    expect(b1.author.get).toEqual(a1);
    expect(factoryOutput).toMatchInlineSnapshot(`
     [
       "Creating new Book at EntityManager.factories.test.ts:172↩",
       "  ...adding Author#1 opt to scope↩",
       "  author = Author#1 from scope↩",
       "  created Book#1 added to scope↩",
     ]
    `);
  });

  it("can create a child and use an single parent from use", async () => {
    const em = newEntityManager();
    // Given there is only one author
    const a1 = newAuthor(em);
    // When we explicitly pass it as use
    newBookReview(em, { use: a1 });
    await em.flush();
    // Then it's passed as part of the opts (which is what makes `use` special, as "obvious defaults"
    // are not passed as opts to the factory functions, and only looked up within `newTestInstance`).
    // Effectively, `use` is a way to trump all factory defaults for a given type.
    expect(lastBookFactoryOpts).toStrictEqual({
      title: expect.anything(),
      author: a1,
      currentDraftAuthor: a1,
      favoriteAuthor: a1,
      reviews: [],
      use: expect.any(Map),
    });
  });

  it("will use existing entities within the opts literal", async () => {
    const em = newEntityManager();
    // Given two authors (to turn off the obvious default)
    const [, a2] = [newAuthor(em), newAuthor(em)];
    // Given we want to make a Book
    const b = newTestInstance(
      em,
      Book,
      // and we refer to one of the authors in the opts literal
      { comments: [{ parent: a2 }], useLogging: true },
      // And leave the required author field unset
      {},
    );
    // Then the book used that author
    expect(b.author.get).toMatchEntity(a2);
    expect(factoryOutput).toMatchInlineSnapshot(`
     [
       "Creating new Book at jestAdapterInit.js:1537↩",
       "  ...adding Author#2 opt to scope↩",
       "  author = Author#2 from scope↩",
       "  created Book#1 added to scope↩",
       "  comments = creating new Comment↩",
       "    parent = Book#1 from opt↩",
       "    created Comment#1 added to scope↩",
     ]
    `);
  });

  it("will use existing entities within the opts literal array", async () => {
    const em = newEntityManager();
    // Given two comments (to turn off the obvious default)
    const [, c2] = [newComment(em), newComment(em)];
    // Given we want to make a Book
    const b = newTestInstance(
      em,
      Book,
      // and we refer to one of the comments in the opts literal
      { comments: [c2], useLogging: true },
      {},
    );
    // Then the book used that author
    expect(b.randomComment.get).toMatchEntity(c2);
    expect(factoryOutput).toMatchInlineSnapshot(`
     [
       "Creating new Book at jestAdapterInit.js:1537↩",
       "  ...adding Comment#2 opt to scope↩",
       "  author = Author#1 from em↩",
       "  randomComment = Comment#2 from scope↩",
       "  created Book#1 added to scope↩",
       "  comments = Comment#2 from opt↩",
     ]
    `);
  });

  it("finds entities created within the factory but as side-effects", async () => {
    const em = newEntityManager();
    // Given a factory is called
    newCritic(em, {
      // And one of the special opts internally creates an Author
      group: { withSideEffectAuthor: true },
      // And some other chain expects to find the author
      bookReviews: [{}, {}],
    });
    // Then we only created 1 author
    expect(em.entities.filter((e) => e instanceof Author)).toMatchEntity([{}]);
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

  it("can skip creating a singleton", async () => {
    const em = newEntityManager();
    // Given we have an existing author
    const a1 = newTestInstance(em, Author, {}, {});
    // And a factory wants to dedup authors on firstName
    const a2 = newTestInstance(
      em,
      Author,
      // But the test wants to skip it
      { useExistingCheck: false },
      { useExisting: (opts, existing) => opts.firstName === existing.firstName },
    );
    // Then we got back a new author
    expect(a2).not.toMatchEntity(a1);
  });

  it("can create and leave required fields unset with noValue", async () => {
    const em = newEntityManager();
    // Given we want to make a Book
    const b = newTestInstance(
      em,
      Book,
      {},
      // And leave the required author field unset
      { author: noValue<Author>() },
    );
    // Then it was not set
    expect(b.author.get).toBeUndefined();
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
        useLogging: true,
      });
      expect(ft1.parent.get).toEqual(b1.author.get);
      expect(factoryOutput).toMatchInlineSnapshot(`
       [
         "Creating new Comment at jestAdapterInit.js:1537↩",
         "  parent = Author#1 from em↩",
         "  created Comment#1 added to scope↩",
       ]
      `);
    });

    it("should use an existing Publisher for the Comment.parent when no Book or Author exist", async () => {
      const em = newEntityManager();
      const p1 = newPublisher(em);
      const ft1 = newTestInstance(em, Comment, {
        parent: maybeNewPoly<CommentParent, Author>(Author, { existingSearchOrder: [Author, Book, Publisher] }),
        useLogging: true,
      });
      expect(ft1.parent.get).toEqual(p1);
      expect(factoryOutput).toMatchInlineSnapshot(`
       [
         "Creating new Comment at jestAdapterInit.js:1537↩",
         "  parent = LargePublisher#1 from em↩",
         "  created Comment#1 added to scope↩",
       ]
      `);
    });

    it("should use an existing Publisher for the Comment.parent even though there is a book/author", async () => {
      const em = newEntityManager();
      const p1 = newLargePublisher(em);
      newBook(em);
      const ft1 = newTestInstance(em, Comment, {
        parent: maybeNewPoly<CommentParent>(SmallPublisher, { existingSearchOrder: [Publisher, Author, Book] }),
        useLogging: true,
      });
      expect(ft1.parent.get).toEqual(p1);
      expect(factoryOutput).toMatchInlineSnapshot(`
       [
         "Creating new Comment at jestAdapterInit.js:1537↩",
         "  parent = LargePublisher#1 from em↩",
         "  created Comment#1 added to scope↩",
       ]
      `);
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
      newSmallPublisher(em);
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
    // And it took only 9 (plus 6 recursive) queries (vs. 29 without join preloading)
    expect(queries.length).toBe(isPreloadingEnabled ? 15 : 39);
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

  describe("diamond schemas", () => {
    it("can hook up parent items when creating parentGroup from child group", async () => {
      const em = newEntityManager();
      // Given an existing pg to turn off the "pick one" behavior
      newParentGroup(em);
      // And the child group creates a new parentGroup
      const cg = newChildGroup(em, {
        parentGroup: { name: "pg1" },
        // With two childItems which will each create a parentItem in pg1
        childItems: [{}, {}],
        useLogging: true,
      });
      // Then the childItems hooked up to the new parentGroup
      expect(cg.childItems.get[0].parentItem.get.parentGroup.get).toMatchEntity(cg.parentGroup.get);
      expect(cg.childItems.get[1].parentItem.get.parentGroup.get).toMatchEntity(cg.parentGroup.get);
      await em.flush();
      expect(factoryOutput).toMatchInlineSnapshot(`
       [
         "Creating new ChildGroup at EntityManager.factories.test.ts:871↩",
         "  childGroupId = creating new Child↩",
         "    created Child#1 added to scope↩",
         "  parentGroup = creating new ParentGroup↩",
         "    created ParentGroup#2 added to scope↩",
         "  created ChildGroup#1 added to scope↩",
         "  childItems = creating new ChildItem↩",
         "    childGroup = ChildGroup#1 from opt↩",
         "    parentItem = creating new ParentItem↩",
         "      parentGroup = ParentGroup#2 from opt↩",
         "      created ParentItem#1 added to scope↩",
         "    created ChildItem#1 added to scope↩",
         "  childItems = creating new ChildItem↩",
         "    childGroup = ChildGroup#1 from opt↩",
         "    parentItem = creating new ParentItem↩",
         "      parentGroup = ParentGroup#2 from opt↩",
         "      created ParentItem#2 added to scope↩",
         "    created ChildItem#2 added to scope↩",
       ]
      `);
    });

    it("can hook up parent items with existing parentGroup from child group", async () => {
      const em = newEntityManager();
      // Given two existing pgs to turn off the "pick one" behavior
      newParentGroup(em);
      const pg2 = newParentGroup(em);
      // And the child group uses pg2
      const cg = newChildGroup(em, {
        parentGroup: pg2,
        childItems: [{}, {}],
      });
      // Then the childItems hooked up to the pg2 as well
      expect(cg.childItems.get[0].parentItem.get.parentGroup.get).toMatchEntity(cg.parentGroup.get);
      expect(cg.childItems.get[1].parentItem.get.parentGroup.get).toMatchEntity(cg.parentGroup.get);
      await em.flush();
    });

    it("can hook up separate branches of children within the same factory call", async () => {
      const em = newEntityManager();
      // Given we come into the group from down in the tree
      const c = newChild(em, {
        groups: [
          // And we ask for two groups
          { parentGroup: {}, childItems: [{}, {}] },
          { parentGroup: {}, childItems: [{}, {}] },
        ],
      });
      // Then the groups were connected within each other
      const [cg1, cg2] = c.groups.get;
      expect(cg1.childItems.get[0].parentItem.get.parentGroup.get).toMatchEntity(cg1.parentGroup.get);
      expect(cg2.childItems.get[1].parentItem.get.parentGroup.get).toMatchEntity(cg2.parentGroup.get);
    });

    it("can hook up separate branches of children within the same factory call with existing", async () => {
      const em = newEntityManager();
      // Given an existing parentGroup that would normally be a "one and only one" / obvious default
      const pg0 = newParentGroup(em);
      // And we come into the group from down in the tree
      const c = newChild(em, {
        groups: [
          // And we ask for two groups
          { parentGroup: {}, childItems: [{}, {}] },
          { parentGroup: {}, childItems: [{}, {}] },
        ],
      });
      // Then the groups were connected within each other
      const [cg1, cg2] = c.groups.get;
      expect(cg1.parentGroup.get).not.toMatchEntity(pg0);
      expect(cg1.childItems.get[0].parentItem.get.parentGroup.get).toMatchEntity(cg1.parentGroup.get);
      expect(cg2.childItems.get[1].parentItem.get.parentGroup.get).toMatchEntity(cg2.parentGroup.get);
    });

    it("can hook up separate branches of children without the parentGroup set", async () => {
      const em = newEntityManager();
      // Given an existing parentGroup that would normally be a "one and only one" / obvious default
      const pg0 = newParentGroup(em);
      // And we come into the group from down in the tree
      const c = newChild(em, {
        groups: [
          // And we ask for two groups w/o an explicit parentGroup key
          { childItems: [{}, {}] },
          { childItems: [{}, {}] },
        ],
      });
      // Then the groups were connected within each other
      const [cg1, cg2] = c.groups.get;
      expect(cg1.parentGroup.get).not.toMatchEntity(pg0);
      expect(cg1.childItems.get[0].parentItem.get.parentGroup.get).toMatchEntity(cg1.parentGroup.get);
      expect(cg2.childItems.get[1].parentItem.get.parentGroup.get).toMatchEntity(cg2.parentGroup.get);
    });

    it("will still share/fan-in entities created across branches", async () => {
      const em = newEntityManager();
      const c = newCritic(em, {
        bookReviews: [{}, {}],
      });
      const a1 = c.bookReviews.get[0].book.get.author.get;
      const a2 = c.bookReviews.get[1].book.get.author.get;
      expect(a1).toMatchEntity(a2);
    });

    it("respects object literals if factory requests new entities", async () => {
      try {
        // Given the ParentItem factory wants the parent group to be `{}`
        parentGroupBranchValue[0] = false;
        const em = newEntityManager();
        const pg = newParentGroup(em);
        // When we make a new child group
        const cg = newChildGroup(em, {
          parentGroup: pg,
          childItems: [{}, {}],
        });
        // Then each ParentItem always get back a new group. Originally I tried to get the factories to see
        // that `parentGroup: {}` meant the "in-call" / "in-branch" pg should override the factory's requested
        // `{}` value, but this heuristic fails as the "in-call" graph getters larger and larger,
        // i.e. as a factory from ~two-three levels away kicks off the call. The logic to override
        // the `{}` value actually needs to more locality aware than just "in the factory call".
        expect(cg.childItems.get[0].parentItem.get.parentGroup.get).not.toMatchEntity(pg);
        expect(cg.childItems.get[1].parentItem.get.parentGroup.get).not.toMatchEntity(pg);
      } finally {
        parentGroupBranchValue[0] = true;
      }
    });
  });
});

beforeEach(() => {
  setFactoryWriter((line: string) => {
    factoryOutput.push(line.replace(ansiRegex(), "").replace("\n", "↩"));
  });
});

afterEach(() => {
  factoryOutput = [];
});

afterAll(() => {
  setFactoryWriter(undefined);
});
