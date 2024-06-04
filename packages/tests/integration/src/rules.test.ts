import { newRequiredRule, ValidationErrors } from "joist-orm";
import { Author } from "src/entities";

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
});
