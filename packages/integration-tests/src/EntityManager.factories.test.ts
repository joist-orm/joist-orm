import {
  AdvanceStatus,
  Author,
  Book,
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
  newPublisher,
  Publisher,
  Tag,
} from "@src/entities";
import { maybeNew, New, newTestInstance } from "joist-orm";
import { newEntityManager } from "./setupDbTests";

describe("EntityManager.factories", () => {
  it("can create a single top-level entity", async () => {
    const em = newEntityManager();
    // Given a simple entity that has no required parents/children
    const p1 = newPublisher(em);
    await em.flush();
    // Then we create only that entity
    expect(p1.name).toEqual("name");
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
    const b1 = newBook(em, { author: undefined });
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
    const b = newBook(em);
    // Then the newAuthor factory was told to override any `books: [{}]` defaults
    expect(lastAuthorFactoryOpts).toStrictEqual({
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
    const a1 = b1.author.get as New<Author>;
    expect(a1.firstName).toEqual("a1");
    // And it has the publisher set
    expect(a1.publisher.get).toEqual(p1);
    // And we explicitly passed the publisher b/c it's an explicit `use` entry
    expect(lastAuthorFactoryOpts).toStrictEqual({
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
    const a1 = b1.author.get as New<Author>;
    expect(a1.firstName).toEqual("a1");
    // And we create a new publisher
    const p1 = a1.publisher.get as New<Publisher>;
    expect(p1.name).toEqual("p1");
  });

  it("can create a parent and child with opts", async () => {
    const em = newEntityManager();
    // Given we make a new parent + two children
    const a1 = newAuthor(em, { books: [{ title: "b1" }, {}] });
    await em.flush();
    // Then we have the 1st book
    const b1 = a1.books.get[0] as New<Book>;
    expect(b1.title).toEqual("b1");
    expect(b1.author.get).toEqual(a1);
    // And the 2nd book
    const b2 = a1.books.get[1] as New<Book>;
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
    const tags = b.tags.get as New<Tag>[];
    expect(tags[0].name).toEqual("1");
    expect(tags[1].name).toEqual("2");
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

  it("should default children to empty array if created bottom-up", async () => {
    const em = newEntityManager();
    newBookReview(em, { book: {} });
    expect(lastBookFactoryOpts).toStrictEqual({
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
    const i = newImage(em);
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
    const i = newImage(em);
    // Then the m2o reused the existing entity
    expect(i.author.get).toEqual(a);
  });

  it("can create m2m", async () => {
    const em = newEntityManager();
    const b1 = newBook(em, { tags: [{}, {}] });
    await em.flush();
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

    it("uses a use entity", async () => {
      const em = newEntityManager();
      const p1 = newPublisher(em);
      const p2 = newPublisher(em);
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
});
