import { getMetadata, newRequiredRule, ValidationCode, ValidationErrors } from "joist-orm";
import { Author, LargePublisher, Publisher, SmallPublisher } from "src/entities";
import { insertAuthor } from "src/entities/inserts";
import { newEntityManager } from "src/testEm";

describe("ValidationErrors", () => {
  it("serialises even with prototype lost", () => {
    expect(JSON.stringify({ ...new ValidationErrors("example") })).toEqual(`"ValidationErrors: example"`);
  });

  describe("newRequiredRule", () => {
    it("cannot be used on o2o fields", () => {
      // @ts-expect-error
      newRequiredRule<Author>("image");
    });
  });

  describe("cannotBeUpdated", () => {
    it("cannot change wasEverPopular to false", async () => {
      expect.assertions(2);
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const a1 = await em.load(Author, "a:1");
      a1.age = 101;
      try {
        await em.flush();
      } catch (err: any) {
        expect(err.errors[0]).toMatchEntity({
          entity: a1,
          code: ValidationCode.cannotBeUpdated,
          message: "age cannot be updated",
        });
        expect(err.message).toBe("Validation error: Author:1 age cannot be updated");
      }
    });

    it("marks the field as immutable", async () => {
      const m = getMetadata(Author);
      expect(m.fields["age"].immutable).toBe(true);
      expect(m.allFields["age"].immutable).toBe(true);
    });

    it("subtype marks base type fields as immutable", async () => {
      const p = getMetadata(Publisher);
      expect(p.fields["group"].immutable).toBe(false);
      expect(p.allFields["group"].immutable).toBe(false);

      const sp = getMetadata(LargePublisher);
      expect(sp.allFields["group"].immutable).toBe(false);

      const lp = getMetadata(SmallPublisher);
      expect(lp.allFields["group"].immutable).toBe(true);
    });
  });
});
