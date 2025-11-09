import { newAuthor } from "src/entities";
import { update } from "src/entities/inserts";
import { newEntityManager, testDriver } from "src/testEm";

describe("EntityManager.refresh", () => {
  it("can refresh primitives", async () => {
    // Given we have an author
    const em = newEntityManager();
    const a1 = newAuthor(em);
    await em.flush();
    // And its changed in the db
    await update("authors", { id: 1, first_name: "a2" });
    // When we refreshFromJson
    const result = await testDriver.knex.raw("select * from get_tables_data(array['authors'])");
    em.refreshFromJsonRows(result.rows);
    // Then we got the new value
    expect(a1).toMatchEntity({ firstName: "a2" });
    // And we don't treat it as dirty
    expect(a1.changes.fields).toEqual([]);
    expect(a1.isDirtyEntity).toBe(false);
  });
});
