import { newDatabaseOwner } from "./entities.js";

describe("DatabaseOwner", () => {
  it("works", async () => {
    const em = newEntityManager();
    newDatabaseOwner(em);
    await em.flush();
  });
});
