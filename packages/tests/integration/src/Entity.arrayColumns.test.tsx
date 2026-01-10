import { Author, newAuthor } from "@src/entities";
import { insertAuthor, select } from "@src/entities/inserts";

import { newEntityManager, numberOfQueries, resetQueryCount } from "@src/testEm";

describe("Entity.arrayColumns", () => {
  it("can save string[] columns", async () => {
    const em = newEntityManager();
    newAuthor(em, { nickNames: ["a", "b"] });
    await em.flush();
    const rows = await select("authors");
    expect(rows[0].nick_names).toEqual(["a", "b"]);
  });

  it("can save string[] columns as derived fields", async () => {
    const em = newEntityManager();
    // Given an author with nicknames
    const a = newAuthor(em, { nickNames: ["a", "b"] });
    // When we save
    await em.flush();
    // Then the uppercase names were calculated
    const rows = await select("authors");
    expect(rows[0].nick_names_upper).toEqual(["A", "B"]);

    // When the field is accessed again
    a.nickNamesUpper.get;
    // Then it's not considered changed
    expect(a.changes.nickNamesUpper.hasChanged).toBe(false);
    // And if we flush, then nothing has changed
    resetQueryCount();
    await em.flush();
    expect(numberOfQueries).toBe(0);

    // But if we change the nicknames
    a.nickNames = ["b", "a"];
    // And re-access the field
    a.nickNamesUpper.get;
    // Then the derived field is marked as changed
    expect(a.changes.nickNamesUpper.hasChanged).toBe(true);

    // And when we save
    await em.flush();
    // Then it's updated
    expect((await select("authors"))[0].nick_names_upper).toEqual(["B", "A"]);
  });

  it("can load string[] columns", async () => {
    await insertAuthor({ first_name: "a1", nick_names: ["a", "b"] });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    expect(a.nickNames).toEqual(["a", "b"]);
  });

  it("can load null string[] columns", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    expect(a.nickNames).toEqual(undefined);
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

  it("can update string[] columns to null", async () => {
    await insertAuthor({ first_name: "a1", nick_names: ["a", "b"] });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    a.nickNames = undefined;
    await em.flush();
    const rows = await select("authors");
    expect(rows[0].nick_names).toEqual(null);
  });

  it("can update string[] columns to empty", async () => {
    await insertAuthor({ first_name: "a1", nick_names: ["a", "b"] });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    a.transientFields.reactToNickNames = false;
    a.nickNames = [];
    await em.flush();
    const rows = await select("authors");
    expect(rows[0].nick_names).toEqual([]);
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
