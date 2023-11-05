import { Author, Book } from "@src/entities";
import { EntityConstructor } from "joist-orm";

describe("EntityConstructor", () => {
  it("can be used with includes", () => {
    const some = [Author, Book];
    const cstr: EntityConstructor<any> = Author;
    expect(some.includes(cstr)).toEqual(true);
  });
});
