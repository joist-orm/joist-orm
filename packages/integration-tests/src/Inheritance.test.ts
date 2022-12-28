import { newSmallPublisher } from "./entities";
import { newEntityManager } from "./setupDbTests";

describe("Inheritance", () => {
  it("can save a subtype", async () => {
    const em = newEntityManager();
    newSmallPublisher(em, {});
    await em.flush();
  });
});
