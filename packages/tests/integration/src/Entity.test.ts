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
      address: null,
      age: null,
      bookComments: null,
      businessAddress: null,
      createdAt: expect.any(Date),
      currentDraftBook: null,
      deletedAt: null,
      favoriteBook: null,
      favoriteColors: [],
      favoriteShape: null,
      firstName: "a1",
      graduated: null,
      id: null,
      initials: "a",
      isPopular: null,
      lastName: null,
      mentor: null,
      numberOfAtoms: null,
      numberOfBooks: null,
      numberOfPublicReviews: null,
      numberOfPublicReviews2: null,
      publisher: null,
      quotes: null,
      ssn: null,
      tagsOfAllBooks: null,
      updatedAt: expect.any(Date),
      wasEverPopular: null,
    });
  });

  it("can toJSON a new entity with a new m2o", () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    const b = newBook(em, { author: a });
    expect(b.toJSON()).toMatchObject({
      id: null,
      author: null,
    });
  });

  it("does not expose the metadata via Object.keys/enumerable properties", async () => {
    await insertAuthor({ first_name: "f" });
    const em = newEntityManager();
    const author = await em.load(Author, "1");
    const copy = deepCopyAndNormalize(author);
    expect(copy).toMatchInlineSnapshot(`
      {
        "allPublisherAuthorNames": {
          "fn": {},
          "loadPromise": undefined,
          "loaded": false,
          "opts": {
            "isReactive": true,
          },
        },
        "bookComments": {
          "fieldName": "bookComments",
          "fn": {},
          "reactiveHint": {
            "books": {
              "comments": "text",
            },
          },
        },
        "booksTitles": {
          "fn": {},
          "loadPromise": undefined,
          "loaded": false,
        },
        "booksWithTitle": {
          "fn": {},
          "loadPromise": undefined,
          "loaded": false,
        },
        "favoriteBook": {
          "_isLoaded": false,
          "fieldName": "favoriteBook",
          "fn": {},
          "loadPromise": undefined,
          "loaded": undefined,
          "reactiveHint": {
            "books": {
              "reviews_ro": "rating",
            },
          },
          "undefined": null,
        },
        "latestComment": {
          "_isLoaded": false,
          "loadPromise": undefined,
          "opts": {
            "get": {},
            "isLoaded": {},
            "load": {},
          },
          "undefined": null,
        },
        "latestComment2": {
          "fn": {},
          "loadPromise": undefined,
          "loaded": false,
          "opts": {
            "isReactive": true,
          },
        },
        "latestComments": {
          "fn": {},
          "loadPromise": undefined,
          "loaded": false,
          "opts": {},
        },
        "numberOfBooks": {
          "fieldName": "numberOfBooks",
          "fn": {},
          "reactiveHint": [
            "books",
            "firstName",
          ],
        },
        "numberOfBooks2": {
          "fn": {},
          "loadPromise": undefined,
          "loaded": false,
          "opts": {
            "isReactive": true,
          },
        },
        "numberOfPublicReviews": {
          "fieldName": "numberOfPublicReviews",
          "fn": {},
          "reactiveHint": {
            "books": {
              "reviews": [
                "isPublic",
                "isPublic2",
                "rating",
              ],
            },
          },
        },
        "numberOfPublicReviews2": {
          "fieldName": "numberOfPublicReviews2",
          "fn": {},
          "reactiveHint": {
            "books": {
              "reviews": [
                "isPublic",
                "isTest",
                "rating",
              ],
            },
          },
        },
        "reviewedBooks": {
          "_isLoaded": false,
          "loadPromise": undefined,
          "opts": {
            "add": {},
            "get": {},
            "isLoaded": {},
            "load": {},
            "remove": {},
            "set": {},
          },
        },
        "reviews": {
          "_isLoaded": false,
          "loadPromise": undefined,
          "opts": {
            "get": {},
            "isLoaded": {},
            "load": {},
          },
        },
        "search": {
          "fieldName": "search",
          "fn": {},
          "reactiveHint": {
            "books": "title",
            "firstName": {},
          },
        },
        "tagsOfAllBooks": {
          "fieldName": "tagsOfAllBooks",
          "fn": {},
          "reactiveHint": {
            "books": {
              "tags": "name",
            },
          },
        },
        "transientFields": {
          "afterCommitIdIsSet": false,
          "afterCommitIsDeletedEntity": false,
          "afterCommitIsNewEntity": false,
          "afterCommitRan": false,
          "afterValidationRan": false,
          "ageRuleInvoked": 0,
          "beforeCommitRan": false,
          "beforeCreateRan": false,
          "beforeDeleteRan": false,
          "beforeFlushRan": false,
          "beforeUpdateRan": false,
          "bookCommentsCalcInvoked": 0,
          "deleteDuringFlush": false,
          "graduatedRuleInvoked": 0,
          "mentorRuleInvoked": 0,
          "numberOfBooksCalcInvoked": 0,
          "setGraduatedInFlush": false,
        },
      }
    `);
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
          // If we hint anything with `.hooks` assume it's metadata
          if (key === "hooks") {
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
