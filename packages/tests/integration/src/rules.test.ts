import {
  cannotBeUpdated,
  getMetadata,
  newRequiredRule,
  ValidationCode,
  ValidationErrors,
  ValidationRuleResult,
} from "joist-orm";
import { Author, LargePublisher, newAuthor, Publisher, SmallPublisher } from "src/entities";
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

    it("requires a field", () => {
      const em = newEntityManager();
      const author = newAuthor(em, { firstName: null! });
      const fn = newRequiredRule<Author>("firstName");
      const result = fn(author) as ValidationRuleResult;
      expect(result).toMatchObject({ code: "required", message: "firstName is required", field: "firstName" });
    });

    it("can be run conditionally with unless", () => {
      const em = newEntityManager();
      const author = newAuthor(em, { firstName: null! });
      const fn = newRequiredRule<Author>("firstName", { unless: () => true });
      const result = fn(author) as ValidationRuleResult;
      expect(result).toBeUndefined();
    });

    it("can be run conditionally with if", () => {
      const em = newEntityManager();
      const author = newAuthor(em, { firstName: null! });
      const fn = newRequiredRule<Author>("firstName", { if: () => false });
      const result = fn(author) as ValidationRuleResult;
      expect(result).toBeUndefined();
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

    it("does not allow updating a value", async () => {
      const em = newEntityManager();
      const author = newAuthor(em);
      await em.flush();
      author.firstName = "new name";
      const fn = cannotBeUpdated("firstName");
      const result = fn(author) as ValidationRuleResult;
      expect(result).toMatchObject({
        code: "not-updatable",
        field: "firstName",
        message: "firstName cannot be updated",
      });
    });

    it("runs conditionally with unless", async () => {
      const em = newEntityManager();
      const author = newAuthor(em);
      await em.flush();
      author.firstName = "new name";
      const fn = cannotBeUpdated("firstName", { unless: () => true });
      const result = fn(author) as ValidationRuleResult;
      expect(result).toBeUndefined();
    });

    it("runs conditionally with if", async () => {
      const em = newEntityManager();
      const author = newAuthor(em);
      await em.flush();
      author.firstName = "new name";
      const fn = cannotBeUpdated("firstName", { if: () => false });
      const result = fn(author) as ValidationRuleResult;
      expect(result).toBeUndefined();
    });
  });
});
