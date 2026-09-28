import { EntityConstructor } from "joist-orm";
import { Author, Book } from "src/entities";

describe("EntityConstructor", () => {
  it("can be used with includes", () => {
    const some: EntityConstructor<any>[] = [Author, Book];
    const cstr: EntityConstructor<any> = Author;
    expect(some.includes(cstr)).toEqual(true);
  });
});
