import { User } from "@src/entities";
import { newEntityManager } from "@src/setupDbTests";

describe("User", () => {
  it("custom type is exposed", async () => {
    const em = newEntityManager();
    // @ts-expect-error
    const a1 = em.create(User, { name: "a1", email: "test@test.com", ipAddress: "127.0.0.1" });
    await expect(em.flush()).resolves.toEqual([a1]);
  });
});
