import { Author, LargePublisher } from "src/entities";
import { insertAuthor, insertLargePublisher, insertPublisher, select } from "src/entities/inserts";
import { newEntityManager } from "src/testEm";

describe("Fields", () => {
  it("can use get/set to copy values", async () => {
    // Given an existing author
    await insertPublisher({ name: "p" });
    await insertAuthor({ first_name: "f", publisher_id: 1 });
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1");
    // And we create a new author
    const a2 = em.create(Author, { firstName: "b" });
    // When we iterate for both primitive fields & relations
    for (const fieldName of ["firstName", "publisher"] as const) {
      // And use get/set to copy the value, even if the relation isn't loaded
      a2.setFieldValue(fieldName, a1.getFieldValue(fieldName));
    }
    await em.flush();
    // Then it worked
    expect((await select("authors"))[1]).toMatchObject({
      first_name: "f",
      publisher_id: 1,
    });
  });

  it("can use get on base or subtype fields", async () => {
    // Given we have a CTI subtype entity
    await insertLargePublisher({ name: "p" });
    const em = newEntityManager();
    const p1 = await em.load(LargePublisher, "p:1");
    // Then we can get fields from the subtype
    expect(p1.getFieldValue("country")).toBe("country");
    // Or the base type
    expect(p1.getFieldValue("name")).toBe("p");
    // And not fields from the other subtype
    // @ts-expect-error
    expect(() => p1.getFieldValue("city")).toThrow("Invalid field city");
  });

  it("setting derived fields causes a type error", async () => {
    // Given an existing author
    await insertAuthor({ first_name: "f" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1");
    // When we try to set the num of books
    a1.setFieldValue("numberOfBooks", 1);
    await em.flush();
    // Then it worked
    expect((await select("authors"))[0]).toMatchObject({
      first_name: "f",
      number_of_books: 1,
    });
  });

  it("can use get on loaded relations", async () => {
    // Given an existing author
    await insertPublisher({ name: "p" });
    await insertAuthor({ first_name: "f", publisher_id: 1 });
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1");
    expect(a1.getFieldValue("publisher")).toBe("p:1");
  });

  it("can use set on loaded relations", async () => {
    // Given an existing author
    await insertPublisher({ name: "p1" });
    await insertPublisher({ id: 2, name: "p2" });
    await insertAuthor({ first_name: "f", publisher_id: 1 });
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1", "publisher");
    expect(a1.publisher.id).toBe("p:1");
    a1.setFieldValue("publisher", "p:2");
    expect(a1.publisher.id).toBe("p:2");
    expect(a1.publisher.isLoaded).toBe(false);
    await em.flush();
    expect((await select("authors"))[0]).toMatchObject({
      first_name: "f",
      publisher_id: 2,
    });
  });
});
