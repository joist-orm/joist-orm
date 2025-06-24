import { newEntityManager } from "@src/setupDbTests";
import { newTag } from "./entities";

describe("Tag", () => {
  it("can save a m2m with createdAt", async () => {
    const em = newEntityManager();
    newTag(em, { authors: [{}] });
    await em.flush();
  });
});
