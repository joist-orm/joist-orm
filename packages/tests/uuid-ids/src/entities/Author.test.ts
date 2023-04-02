import { Author, newAuthor } from "@src/entities";
import { insertAuthor } from "@src/entities/inserts";
import { newEntityManager } from "@src/setupDbTests";
import { RandomUuidAssigner } from "joist-orm";

describe("Author", () => {
  it("can load an entity with a uuid id", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.find(Author, {});
    expect(a1[0].id).toEqual("a:20000000-0000-0000-0000-000000000000");
  });

  it("can create entities with deterministic uuids", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const a2 = newAuthor(em);
    await em.flush();
    expect(a1.id).toEqual("a:00000000-0000-0000-000a-000000000000");
    expect(a2.id).toEqual("a:00000000-0000-0000-000a-000000000001");
  });

  it("can generate random uuids", async () => {
    const em = newEntityManager({ idAssigner: new RandomUuidAssigner() });
    const a1 = newAuthor(em);
    await em.flush();
    expect(a1.idOrFail.startsWith("a:")).toBeTruthy();
  });
});
