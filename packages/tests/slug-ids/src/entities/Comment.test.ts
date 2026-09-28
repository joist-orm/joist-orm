import { Comment, newBook, newComment } from "src/entities";
import { newEntityManager } from "src/setupDbTests";

describe("slug id polymorphic references", () => {
  it("serializes, filters, and hydrates slug references", async () => {
    const em1 = newEntityManager();
    const book = newBook(em1, { title: "b1", author: { firstName: "a1" } });
    const comment = newComment(em1, { text: "c1", parent: book });
    await em1.flush();

    const em2 = newEntityManager();
    const loaded = await em2.findOneOrFail(Comment, { parent: book.id }, { populate: "parent" });

    expect(comment.id).toEqual("cm1");
    expect(loaded.id).toEqual("cm1");
    expect(loaded.parent.get.id).toEqual("book1");
  });
});
