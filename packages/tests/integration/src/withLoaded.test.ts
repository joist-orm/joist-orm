import { Book, newAuthor } from "@src/entities";
import { newEntityManager } from "@src/testEm";
import { withLoaded } from "joist-orm";
import { insertAuthor, insertBook } from "src/entities/inserts";

describe("withLoaded", () => {
  it("with a m2o", async () => {
    const em = newEntityManager();
    const author = newAuthor(em, { publisher: {} });
    const { publisher } = withLoaded(author);
    expect(publisher?.name).toEqual("LargePublisher 1");
  });

  it("with an unloaded m2o", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const book = await em.load(Book, "b:1");
    expect(() => {
      const { author } = withLoaded(book as any);
    }).toThrow("Book:1.author is not loaded");
  });

  it("with a m2o and primitive", async () => {
    const em = newEntityManager();
    const author = newAuthor(em, { publisher: {} });
    const { publisher, firstName } = withLoaded(author);
    expect(firstName).toEqual("a1");
    expect(publisher?.name).toEqual("LargePublisher 1");
  });
});
