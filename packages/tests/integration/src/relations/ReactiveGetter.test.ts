import { Author } from "src/entities";
import { insertAuthor } from "src/entities/inserts";
import { newEntityManager } from "src/testEm";

describe("ReactiveGetter", () => {
  it("can be called without being loaded", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1");
    expect(a1.hasLowerCaseFirstName.get).toBe(true);
  });

  it("exposes the reactiveHint", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1");
    expect((a1.hasLowerCaseFirstName as any).reactiveHint).toBe("firstName");
  });

  it("causes downstream ReactiveFields to recalc", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1");
    a1.firstName = "a2";
    await em.flush();
    expect(a1.transientFields.bookCommentsCalcInvoked).toBe(1);
  });
});
