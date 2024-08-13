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
    const a1 = await em.load(Author, "1");
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
