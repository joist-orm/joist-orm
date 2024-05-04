import { Book } from "@src/entities";
import { insertAuthor, insertBook } from "@src/entities/inserts";

import { newEntityManager } from "@src/testEm";

describe("hasAsyncProperty", () => {
  it("can use a lens", async () => {
    await insertAuthor({ first_name: "f" });
    await insertBook({ title: "t", author_id: 1 });

    const em = newEntityManager();
    const book = await em.load(Book, "1", "authorFirstName");
    expect(book.authorFirstName.get).toBe("f");
  });
});
