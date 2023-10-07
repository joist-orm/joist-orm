import { Author, newAuthor } from "@src/entities";
import { insertAuthor, select } from "@src/entities/inserts";
import { newEntityManager } from "@src/setupDbTests";

describe("Entity.arrayColumns", () => {
  it("can save string[] columns", async () => {
    const em = newEntityManager();
    const a = newAuthor(em, { nickNames: ["a", "b"] });
    await em.flush();
    const rows = await select("authors");
    expect(rows[0].nick_names).toEqual(["a", "b"]);
  });

  it("can load string[] columns", async () => {
    await insertAuthor({ first_name: "a1", nick_names: ["a", "b"] });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    expect(a.nickNames).toEqual(["a", "b"]);
  });

  it("can update string[] columns", async () => {
    await insertAuthor({ first_name: "a1", nick_names: ["a", "b"] });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    a.nickNames = ["c", "a"];
    await em.flush();
    const rows = await select("authors");
    expect(rows[0].nick_names).toEqual(["c", "a"]);
  });
});
