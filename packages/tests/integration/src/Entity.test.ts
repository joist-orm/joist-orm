import { Author, newAuthor, newBook } from "@src/entities";
import { insertAuthor } from "@src/entities/inserts";
import { newEntityManager } from "@src/testEm";

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
