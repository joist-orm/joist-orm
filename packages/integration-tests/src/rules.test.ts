import { ValidationErrors } from "joist-orm";

describe("ValidationErrors", () => {
  it("serialises even with prototype lost", () => {
    expect(JSON.stringify({ ...new ValidationErrors("example") })).toEqual(`"ValidationErrors: example"`);
  });
});
