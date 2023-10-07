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

  it("can find contains on string[] columns", async () => {
    await insertAuthor({ first_name: "a1", nick_names: ["a", "b"] });
    await insertAuthor({ first_name: "a2", nick_names: ["b", "c"] });
    await insertAuthor({ first_name: "a3", nick_names: ["c", "d"] });
    await insertAuthor({ first_name: "a4", nick_names: [] });
    const em = newEntityManager();
    const as = await em.find(Author, { nickNames: { contains: ["b"] } });
    expect(as).toMatchEntity([{ firstName: "a1" }, { firstName: "a2" }]);
  });

  it("can find overlaps on string[] columns", async () => {
    await insertAuthor({ first_name: "a1", nick_names: ["a", "b"] });
    await insertAuthor({ first_name: "a2", nick_names: ["b", "c"] });
    await insertAuthor({ first_name: "a3", nick_names: ["f"] });
    await insertAuthor({ first_name: "a4" });
    const em = newEntityManager();
    const as = await em.find(Author, { nickNames: { overlaps: ["a", "b", "c", "d"] } });
    expect(as).toMatchEntity([{ firstName: "a1" }, { firstName: "a2" }]);
  });
});
