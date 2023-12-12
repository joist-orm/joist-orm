import { Author, Book, BookReview, newBookReview } from "@src/entities";
import { insertAuthor, insertBook, insertBookReview, insertPublisher } from "@src/entities/inserts";

import { newEntityManager } from "@src/testEm";

describe("hasOneDerived", () => {
  it("can load a reference", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "f", publisher_id: 1 });
    await insertBook({ title: "t", author_id: 1 });
    await insertBookReview({ rating: 5, book_id: 1 });

    const em = newEntityManager();
    const review = await em.load(BookReview, "1");
    const p1 = await review.publisher.load();
    expect(p1?.name).toEqual("p1");
  });

  it("can populate a reference", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "f", publisher_id: 1 });
    await insertBook({ title: "t", author_id: 1 });
    await insertBookReview({ rating: 5, book_id: 1 });

    const em = newEntityManager();
    const br1 = await em.load(BookReview, "1", "publisher");
    expect(br1.publisher.get?.name).toEqual("p1");
  });

  it("in tests can be called before and after flush", async () => {
    const em = newEntityManager();
    // Given a new deeply loaded test entity
    const br = newBookReview(em);
    // Then we can call `.get` even though we've not explicitly populated the collection
    expect(br.publisher.get).toBeUndefined();
    // And after flushing (i.e. the entity is no longer new)
    await em.flush();
    // Then it still works
    expect(br.publisher.get).toBeUndefined();
  });

  it("re-evaluates whether the relation is loaded on changes to the graph", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisher({ id: 2, name: "p2" });
    await insertAuthor({ first_name: "a", publisher_id: 1 });
    await insertAuthor({ first_name: "b", publisher_id: 2 });
    await insertBook({ title: "t", author_id: 1 });
    await insertBookReview({ rating: 5, book_id: 1 });

    const em = newEntityManager();
    const br1 = await em.load(BookReview, "1", "publisher");
    expect(br1.publisher.get?.name).toEqual("p1");
    expect(br1.publisher.isLoaded).toEqual(true);

    // And when we change the object graph so that the publisher relation is no longer loaded
    const b1 = await em.load(Book, "1");
    const a2 = await em.load(Author, "2");
    b1.author.set(a2);

    // Then the author's publisher is not loaded
    expect(a2.publisher.isLoaded).toEqual(false);
    // Therefore the relation is no longer loaded
    expect(br1.publisher.isLoaded).toEqual(false);

    // And I can re-load the relation to get the new value
    expect(await br1.publisher.load()).toMatchEntity({ name: "p2" });
  });
});
