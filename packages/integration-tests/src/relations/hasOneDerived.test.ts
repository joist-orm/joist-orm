import { BookReview, newBookReview } from "@src/entities";
import { insertAuthor, insertBook, insertBookReview, insertPublisherAsSmall } from "@src/entities/inserts";
import { newEntityManager } from "@src/setupDbTests";

describe("hasOneDerived", () => {
  it("can load a reference", async () => {
    await insertPublisherAsSmall({ name: "p1" });
    await insertAuthor({ first_name: "f", publisher_id: 1 });
    await insertBook({ title: "t", author_id: 1 });
    await insertBookReview({ rating: 5, book_id: 1 });

    const em = newEntityManager();
    const review = await em.load(BookReview, "1");
    const p1 = await review.publisher.load();
    expect(p1?.name).toEqual("p1");
  });

  it("can populate a reference", async () => {
    await insertPublisherAsSmall({ name: "p1" });
    await insertAuthor({ first_name: "f", publisher_id: 1 });
    await insertBook({ title: "t", author_id: 1 });
    await insertBookReview({ rating: 5, book_id: 1 });

    const em = newEntityManager();
    const p1 = await em.load(BookReview, "1", "publisher");
    expect(p1.publisher.get?.name).toEqual("p1");
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
});
