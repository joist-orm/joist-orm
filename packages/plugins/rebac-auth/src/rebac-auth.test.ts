import { User, insertAuthor, insertBook, insertUser, newEntityManager } from "joist-tests-integration";
import { AuthHint } from "./authHints";

describe("rebac-auth", () => {
  it("should work", async () => {
    const hint: AuthHint<User> = {
      authorManyToOne: {
        books: {},
      },
    };

    // Given two authors with their own books
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 2 });
    await insertUser({ name: "u1", author_id: 1 });
    // and the user can only see one
    const em = newEntityManager();
  });
});
