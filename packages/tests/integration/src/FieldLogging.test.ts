import { FieldLogger, FieldLoggerWatch } from "joist-orm";
import { stripAnsi } from "joist-utils";
import { Author, Publisher, newAuthor, newBook, newComment, newLargePublisher, newSmallPublisher } from "src/entities";
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
    expect(fieldOutput[0]).toMatch(/a:1.firstName = a2 at FieldLogging.test.ts:(\d+)/);
    a1.firstName = "a1";
    expect(fieldOutput[1]).toMatch(/a:1.firstName = a1 at FieldLogging.test.ts:(\d+)/);
  });

  it("sees primitive unsets", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    const em = newEntityManager();
    em.setFieldLogging(new StubFieldLogger());
    const a1 = await em.load(Author, "1");
    a1.lastName = undefined;
    expect(fieldOutput[0]).toMatch(/a:1.lastName = undefined at FieldLogging.test.ts:(\d+)/);
  });

  it("sees m2o sets", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    em.setFieldLogging(new StubFieldLogger());
    const p1 = await em.load(Publisher, "p:1");
    const a1 = await em.load(Author, "a:1");
    a1.publisher.set(p1);
    expect(fieldOutput[0]).toMatch(/a:1.publisher = p:1 at FieldLogging.test.ts:(\d+)/);
  });

  it("sees o2o sets", async () => {
    const em = newEntityManager();
    const b1 = newBook(em);
    const b2 = newBook(em);
    em.setFieldLogging(new StubFieldLogger());
    b2.sequel.set(b1);
    expect(fieldOutput[0]).toMatch(/b#2.sequel = Book#1 at FieldLogging.test.ts:(\d+)/);
    expect(fieldOutput[1]).toMatch(/b#1.prequel = Book#2 at FieldLogging.test.ts:(\d+)/);
  });

  it("sees poly sets", async () => {
    const em = newEntityManager();
    const c1 = newComment(em, { parent: undefined });
    const a1 = newAuthor(em);
    em.setFieldLogging(new StubFieldLogger());
    c1.parent.set(a1);
    expect(fieldOutput[0]).toMatch(/comment#1.parent = Author#2 at FieldLogging.test.ts:(\d+)/);
  });

  it("sees all fields by default", async () => {
    // Given an EntityManager that logs all entity fields
    const em = newEntityManager();
    em.setFieldLogging(new StubFieldLogger());
    // When a Book and its Author are created with default values
    newBook(em);
    // Then both entities log their fields and the locations that set them
    expect(fieldOutput).toMatchInlineSnapshot(`
     [
       "a#1 created at newAuthor.ts:14",
       "a#1.firstName = a1 at newAuthor.ts:14",
       "a#1.age = 40 at newAuthor.ts:14",
       "a#1.isFunny = false at defaults.ts:55",
       "a#1.nickNames = a1 at defaults.ts:203",
       "b#1 created at newBook.ts:10",
       "b#1.title = title at newBook.ts:10",
       "b#1.order = 1 at newBook.ts:10",
       "b#1.author = Author#1 at newBook.ts:10",
       "b#1.notes = Notes for title at defaults.ts:55",
       "b#1.authorsNickNames = a1 at defaults.ts:203",
     ]
    `);
  });

  it("sees instantiations", async () => {
    const em = newEntityManager();
    em.setFieldLogging(new StubFieldLogger());
    const a1 = newAuthor(em);
    expect(fieldOutput[0]).toMatch(/a#1 created at newAuthor.ts:(\d+)/);
  });

  it("can filter fields by entity", async () => {
    // Given an EntityManager that logs only Author fields
    const em = newEntityManager();
    em.setFieldLogging(new StubFieldLogger([{ entity: "Author" }]));
    // When a Book and its Author are created with default values
    newBook(em);
    // Then only the Author fields and their source locations are logged
    expect(fieldOutput).toMatchInlineSnapshot(`
     [
       "a#1 created at newAuthor.ts:14",
       "a#1.firstName = a1 at newAuthor.ts:14",
       "a#1.age = 40 at newAuthor.ts:14",
       "a#1.isFunny = false at defaults.ts:55",
       "a#1.nickNames = a1 at defaults.ts:203",
     ]
    `);
  });

  it("can filter fields by entity and fieldName", async () => {
    const em = newEntityManager();
    em.setFieldLogging(new StubFieldLogger([{ entity: "Author", fieldNames: ["age"] }]));
    newBook(em);
    expect(fieldOutput).toMatchInlineSnapshot(`
     [
       "a#1.age = 40 at newAuthor.ts:14",
     ]
    `);
  });

  it("can filter by constructor", async () => {
    const em = newEntityManager();
    em.setFieldLogging(new StubFieldLogger([{ entity: "Author", fieldNames: ["constructor"] }]));
    newBook(em);
    expect(fieldOutput).toMatchInlineSnapshot(`
     [
       "a#1 created at newAuthor.ts:14",
     ]
    `);
  });

  it("can filter fields by subtype", async () => {
    // Given an EntityManager that logs only LargePublisher fields
    const em = newEntityManager();
    em.setFieldLogging(new StubFieldLogger([{ entity: "LargePublisher" }]));
    // When a LargePublisher and a SmallPublisher are created with default values
    newLargePublisher(em, { name: "lp1" });
    newSmallPublisher(em, { name: "pp1" });
    // Then only the LargePublisher fields and their source locations are logged
    expect(fieldOutput).toMatchInlineSnapshot(`
     [
       "p#1 created at newLargePublisher.ts:6",
       "p#1.rating = 0 at newLargePublisher.ts:6",
       "p#1.name = lp1 at newLargePublisher.ts:6",
       "p#1.numberOfBookReviews = 0 at defaults.ts:46",
       "p#1.type = BIG at defaults.ts:55",
       "p#1.baseSyncDefault = LPSyncDefault at defaults.ts:55",
       "p#1.baseAsyncDefault = LPAsyncDefault at defaults.ts:203",
     ]
    `);
  });

  it("can filter fields by subtype and fieldName", async () => {
    const em = newEntityManager();
    em.setFieldLogging(new StubFieldLogger([{ entity: "LargePublisher", fieldNames: ["name"] }]));
    newLargePublisher(em, { name: "lp1" });
    newSmallPublisher(em, { name: "pp1" });
    expect(fieldOutput).toMatchInlineSnapshot(`
     [
       "p#1.name = lp1 at newLargePublisher.ts:6",
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

  it("fails on invalid string config", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    expect(() => em.setFieldLogging("InvalidEntity.name")).toThrow("Unknown type InvalidEntity");
  });

  it("fails on invalid string[] config", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    expect(() => em.setFieldLogging(["Author.firstName", "InvalidEntity.name"])).toThrow("Unknown type InvalidEntity");
  });

  it("fails on invalid string config with array typo", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    expect(() => em.setFieldLogging("Author.firstName,InvalidEntity.name")).toThrow(
      "Field InvalidEntity.name not found on Author",
    );
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
      fieldOutput.push(stripAnsi(line));
    });
  }
}
