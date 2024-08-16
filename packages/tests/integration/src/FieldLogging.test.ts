import ansiRegex = require("ansi-regex");
import { FieldLogger } from "joist-orm";
import { Author } from "src/entities";
import { insertAuthor } from "src/entities/inserts";
import { newEntityManager } from "src/testEm";

let fieldOutput: string[] = [];

describe("FieldLogging", () => {
  it("sees primitive sets", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    em.setFieldLogging(new StubFieldLogger());
    const a1 = await em.load(Author, "1");
    a1.firstName = "a2";
    expect(fieldOutput[0]).toMatch(/a:1.firstName = a2 at FieldLogging.test.ts:(\d+)↩/);
    a1.firstName = "a1";
    expect(fieldOutput[1]).toMatch(/a:1.firstName = a1 at FieldLogging.test.ts:(\d+)↩/);
  });

  it("sees primitive unsets", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    const em = newEntityManager();
    em.setFieldLogging(new StubFieldLogger());
    const a1 = await em.load(Author, "1");
    a1.lastName = undefined;
    expect(fieldOutput[0]).toMatch(/a:1.lastName = undefined at FieldLogging.test.ts:(\d+)↩/);
  });
});

beforeEach(() => {
  fieldOutput = [];
});

class StubFieldLogger extends FieldLogger {
  constructor() {
    super((line: string) => {
      fieldOutput.push(line.replace(ansiRegex(), "").replace("\n", "↩"));
    });
  }
}
