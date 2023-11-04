import { Author, newAuthor } from "@src/entities";
import { insertAuthor } from "@src/entities/inserts";
import { newEntityManager } from "@src/setupDbTests";

describe("Author", () => {
  it("can load an entity with a number id", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.find(Author, {});
    expect(a1[0].id).toEqual(1);
  });

  it("can create entities with numberic ids", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const a2 = newAuthor(em);
    await em.flush();
    expect(a1.id).toEqual(1);
    expect(a2.id).toEqual(2);
  });

  it("can run multiple find calls", async () => {
    const em = newEntityManager();
    const q1 = em.find(Author, { firstName: { eq: "a1" } });
    const q2 = em.find(Author, { lastName: { eq: "l1" } });
    await Promise.all([q1, q2]);
  });
});
