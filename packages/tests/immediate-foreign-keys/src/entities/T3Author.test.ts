import { newEntityManager } from "@src/setupDbTests";
import { newT3Author } from "./entities";

describe("T3Author", () => {
  it.skip("works", async () => {
    const em = newEntityManager();
    newT3Author(em);
    await em.flush();
  });
});
