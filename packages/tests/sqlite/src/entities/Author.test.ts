import { newAuthor } from "@src/entities";
import { newEntityManager } from "@src/setupDbTests";

describe("Author", () => {
  it("works", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    await em.flush();
    expect(a).toMatchEntity({
      firstName: "firstName",
    });
  });
});
