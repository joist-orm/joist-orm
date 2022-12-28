import { newSmallPublisher } from "./entities";
import { newEntityManager } from "./setupDbTests";

describe("Inheritance", () => {
  it("can save a subtype", async () => {
    const em = newEntityManager();
    const sp1 = newSmallPublisher(em, { name: "sp1" });
    console.log(sp1.__orm.data);
    await em.flush();
  });
});
