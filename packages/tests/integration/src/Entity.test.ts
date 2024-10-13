import { Author, newAuthor, newBook } from "@src/entities";
import { insertAuthor } from "@src/entities/inserts";
import { newEntityManager } from "@src/testEm";
import { getInstanceData } from "joist-orm";
import { jan1 } from "src/testDates";

describe("Entity", () => {
  it("has a toString", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    expect(a.toString()).toBe("Author#1");
    await em.assignNewIds();
    expect(a.toString()).toBe("Author#1");
    await em.flush();
    expect(a.toString()).toBe("Author:1");
  });

  it("can toString a new-then-deleted entity", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    em.delete(a);
    expect(a.toString()).toBe("Author#1");
    await em.flush();
    expect(a.toString()).toBe("Author#1");
  });

  it("can toJSON a new entity", () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    expect(a.toJSON()).toMatchObject({
      id: null,
    });
  });

  it("can toJSON a new entity with a new m2o", () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    const b = newBook(em, { author: a });
    expect(b.toJSON()).toMatchObject({ id: null });
  });

  it("does not expose the metadata via Object.keys/enumerable properties", async () => {
    await insertAuthor({ first_name: "f" });
    const em = newEntityManager();
    const author = await em.load(Author, "1");
    // This method will blow up if it recurses into the metadata
    deepCopyAndNormalize(author);
    // Otherwise we don't assert on this b/c the behavior is different between
    // the with/without joist-transform-properties test runs
    // expect(copy).toMatchInlineSnapshot;
  });

  describe("set", () => {
    it("can set a field", () => {
      const em = newEntityManager();
      const a = newAuthor(em);
      const b = newBook(em, { author: a });
      expect(b.toJSON()).toMatchObject({ id: null });
    });

    it("setting optional fields to null is allowed", () => {
      const em = newEntityManager();
      const author = new Author(em, { firstName: "a1" });
      author.set({ lastName: null });
      expect(author.lastName).toBeUndefined();
    });

    it("set can treat undefined as leave", () => {
      const em = newEntityManager();
      const author = new Author(em, { firstName: "a1" });
      author.setPartial({ firstName: undefined });
      expect(author.firstName).toEqual("a1");
    });

    it("cannot set with a null required field", async () => {
      const em = newEntityManager();
      const a1 = em.create(Author, { firstName: "a1" });
      // @ts-expect-error
      a1.set({ firstName: null });
      await expect(em.flush()).rejects.toThrow("firstName is required");
    });

    it("cannot set an invalid field", async () => {
      const em = newEntityManager();
      const a1 = em.create(Author, { firstName: "a1" });
      expect(() => {
        // @ts-expect-error
        a1.set({ fooBar: null });
      }).toThrow("Unknown field fooBar");
    });

    it("cannot setPartial an invalid field", async () => {
      const em = newEntityManager();
      const a1 = em.create(Author, { firstName: "a1" });
      expect(() => {
        // @ts-expect-error
        a1.setPartial({ fooBar: null });
      }).toThrow("Unknown field fooBar");
    });

    it("cannot set over an async field", async () => {
      const em = newEntityManager();
      const a1 = em.create(Author, { firstName: "a1" });
      expect(() => {
        a1.set({ latestComments: [] } as any);
      }).toThrow("Invalid argument, cannot set over latestComments AsyncPropertyImpl");
    });

    it("cannot set over an hasOneDerived relation", async () => {
      const em = newEntityManager();
      const a1 = em.create(Author, { firstName: "a1" });
      expect(() => {
        a1.set({ latestComment: [] } as any);
      }).toThrow("'set' not implemented on CustomReference");
    });

    it("cannot set over a reactive field", async () => {
      const em = newEntityManager();
      const a1 = em.create(Author, { firstName: "a1" });
      expect(() => {
        a1.set({ numberOfPublicReviews: 2 } as any);
      }).toThrow("Invalid argument, cannot set over numberOfPublicReviews ReactiveFieldImpl");
    });

    it("can setPartial with a null required field", async () => {
      const em = newEntityManager();
      const a1 = em.create(Author, { firstName: "a1" });
      // Accepting partial-update style inputs is allowed at compile-time, but throws at runtime
      a1.setPartial({ firstName: null });
      await expect(em.flush()).rejects.toThrow("firstName is required");
    });

    it("setPartial defaults to ignoredUndefined", async () => {
      const em = newEntityManager();
      const a1 = em.create(Author, { firstName: "a1" });
      a1.setPartial({ firstName: undefined });
      expect(a1.firstName).toEqual("a1");
    });

    it("ignores sets of the same value", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const a1 = await em.load(Author, "1");
      a1.firstName = "a1";
      expect(getInstanceData(a1).originalData).toEqual({});
    });

    it("ignores date sets of the same value", async () => {
      await insertAuthor({ first_name: "a1", initials: "a", number_of_books: 1, graduated: jan1 });
      const em = newEntityManager();
      const a1 = await em.load(Author, "1");
      a1.graduated = jan1;
      expect(getInstanceData(a1).originalData).toEqual({});
    });
  });
});

// Based on the deep copy that was tripping up Webstorm
function deepCopyAndNormalize(value: any) {
  const active: unknown[] = [];
  return (function doCopy(value, path): any {
    if (value == null) {
      return value;
    }
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
      return value;
    }
    if (value instanceof RegExp) {
      return value;
    }

    if (active.indexOf(value) !== -1) {
      return "[Circular reference found] Truncated by IDE";
    }
    active.push(value);
    try {
      if (Array.isArray(value)) {
        return value.map(function (element, i) {
          return doCopy(element, `${path}.${i}`);
        });
      }

      if (isObject(value)) {
        var keys = Object.keys(value);
        keys.sort();
        var ret: any = {};
        keys.forEach(function (key) {
          // If we hint anything with `.tagName` assume its metadata
          if (key === "tagName") {
            throw new Error(`Recursed into the metadata: ${path}`);
          }
          ret[key] = doCopy(value[key], `${path}.${key}`);
        });
        return ret;
      }
      return value;
    } finally {
      active.pop();
    }
  })(value, "value");
}

function isObject(val: any): boolean {
  return val === Object(val);
}
