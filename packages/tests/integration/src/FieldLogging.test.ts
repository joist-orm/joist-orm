import ansiRegex = require("ansi-regex");
import { FieldLogger, FieldLoggerWatch } from "joist-orm";
import { Author, Publisher, newBook } from "src/entities";
import { insertAuthor, insertPublisher } from "src/entities/inserts";
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

  it("sees m2o sets", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    em.setFieldLogging(new StubFieldLogger());
    const p1 = await em.load(Publisher, "p:1");
    const a1 = await em.load(Author, "a:1");
    a1.publisher.set(p1);
    expect(fieldOutput[0]).toMatch(/a:1.publisher = p:1 at FieldLogging.test.ts:(\d+)↩/);
  });

  it("sees all fields by default", async () => {
    const em = newEntityManager();
    em.setFieldLogging(new StubFieldLogger());
    newBook(em);
    expect(fieldOutput).toMatchInlineSnapshot(`
     [
       "a#1.firstName = a1 at newAuthor.ts:13↩",
       "a#1.age = 40 at newAuthor.ts:13↩",
       "a#1.nickNames = a1 at defaults.ts:180↩",
       "b#1.title = title at newBook.ts:9↩",
       "b#1.order = 1 at newBook.ts:9↩",
       "b#1.author = Author#1 at newBook.ts:9↩",
       "b#1.notes = Notes for title at defaults.ts:45↩",
       "b#1.authorsNickNames = a1 at defaults.ts:180↩",
     ]
    `);
  });

  it("can filter fields by entity", async () => {
    const em = newEntityManager();
    em.setFieldLogging(new StubFieldLogger([{ entity: "Author" }]));
    newBook(em);
    expect(fieldOutput).toMatchInlineSnapshot(`
     [
       "a#1.firstName = a1 at newAuthor.ts:13↩",
       "a#1.age = 40 at newAuthor.ts:13↩",
       "a#1.nickNames = a1 at defaults.ts:180↩",
     ]
    `);
  });

  it("can filter fields by entity and fieldName", async () => {
    const em = newEntityManager();
    em.setFieldLogging(new StubFieldLogger([{ entity: "Author", fieldNames: ["age"] }]));
    newBook(em);
    expect(fieldOutput).toMatchInlineSnapshot(`
     [
       "a#1.age = 40 at newAuthor.ts:13↩",
     ]
    `);
  });

  // skipped because this needs to run in debug mode
  it.skip("can hit a breakpoint", async () => {
    const em = newEntityManager();
    em.setFieldLogging(
      new StubFieldLogger([
        {
          entity: "Author",
          fieldNames: ["age"],
          breakpoint: true,
        },
      ]),
    );
    newBook(em);
    // Manually verify in the debugger that it hits the breakpoint
  });
});

beforeEach(() => {
  fieldOutput = [];
});

class StubFieldLogger extends FieldLogger {
  constructor(watching: FieldLoggerWatch[] = []) {
    // uncomment to see colorized output
    // super();
    super(watching, (line: string) => {
      fieldOutput.push(line.replace(ansiRegex(), "").replace("\n", "↩"));
    });
  }
}
