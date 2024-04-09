import { newDatabaseOwner } from "./entities";

describe("DatabaseOwner", () => {
  it("works", async () => {
    const em = newEntityManager();
    newDatabaseOwner(em);
    await em.flush();
  });
});
