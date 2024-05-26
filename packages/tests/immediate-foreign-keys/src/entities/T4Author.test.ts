import { newEntityManager } from "@src/setupDbTests";
import { newT4Author } from "./entities";

describe("T4Author", () => {
  it.skip("works", async () => {
    const em = newEntityManager();
    newT4Author(em);
    await em.flush();
  });
});
