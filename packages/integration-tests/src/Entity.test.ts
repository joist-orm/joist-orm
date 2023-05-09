import { Author } from "@src/entities";
import { insertAuthor } from "@src/entities/inserts";
import { newEntityManager } from "@src/setupDbTests";

describe("Entity", () => {
  it("does not expose the metadata via Object.keys/enumerable properties", async () => {
    await insertAuthor({ first_name: "f" });
    const em = newEntityManager();
    const author = await em.load(Author, "1");
    const copy = deepCopyAndNormalize(author);
    expect(copy).toMatchInlineSnapshot(`
      {
        "afterCommitIdIsSet": false,
        "afterCommitIsDeletedEntity": false,
        "afterCommitIsNewEntity": false,
        "afterCommitRan": false,
        "afterValidationRan": false,
        "ageRuleInvoked": 0,
        "allPublisherAuthorNames": {
          "fn": {},
          "loadPromise": undefined,
          "loaded": false,
          "opts": {
            "isReactive": true,
          },
        },
        "authors": {
          "fieldName": "authors",
          "loaded": undefined,
          "otherColumnName": "mentor_id",
          "otherFieldName": "mentor",
          "undefined": null,
        },
        "beforeCreateRan": false,
        "beforeDeleteRan": false,
        "beforeFlushRan": false,
        "beforeUpdateRan": false,
        "bookComments": {
          "fieldName": "bookComments",
          "fn": {},
          "loadPromise": undefined,
          "loaded": false,
          "reactiveHint": {
            "books": {
              "comments": "text",
            },
          },
        },
        "bookCommentsCalcInvoked": 0,
        "books": {
          "fieldName": "books",
          "loaded": undefined,
          "otherColumnName": "author_id",
          "otherFieldName": "author",
          "undefined": null,
        },
        "comments": {
          "fieldName": "comments",
          "loaded": undefined,
          "otherColumnName": "parent_author_id",
          "otherFieldName": "parent",
          "undefined": null,
        },
        "currentDraftBook": {
          "_isLoaded": false,
          "fieldName": "currentDraftBook",
          "loaded": undefined,
          "otherFieldName": "currentDraftAuthor",
          "undefined": null,
        },
        "deleteDuringFlush": false,
        "graduatedRuleInvoked": 0,
        "image": {
          "_isLoaded": false,
          "fieldName": "image",
          "isCascadeDelete": true,
          "loaded": undefined,
          "otherColumnName": "author_id",
          "otherFieldName": "author",
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
        "mentor": {
          "_isLoaded": false,
          "fieldName": "mentor",
          "loaded": undefined,
          "otherFieldName": "authors",
          "undefined": null,
        },
        "mentorRuleInvoked": 0,
        "numberOfBooks": {
          "fieldName": "numberOfBooks",
          "fn": {},
          "loadPromise": undefined,
          "loaded": false,
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
        "numberOfBooksCalcInvoked": 0,
        "numberOfPublicReviews": {
          "fieldName": "numberOfPublicReviews",
          "fn": {},
          "loadPromise": undefined,
          "loaded": false,
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
        "publisher": {
          "_isLoaded": false,
          "fieldName": "publisher",
          "loaded": undefined,
          "otherFieldName": "authors",
          "undefined": null,
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
          "loadPromise": undefined,
          "loaded": false,
          "reactiveHint": [
            "firstName",
            "lastName",
            "initials",
          ],
        },
        "tags": {
          "addedBeforeLoaded": undefined,
          "columnName": "author_id",
          "fieldName": "tags",
          "joinTableName": "authors_to_tags",
          "loaded": undefined,
          "otherColumnName": "tag_id",
          "otherFieldName": "authors",
          "removedBeforeLoaded": undefined,
        },
        "userOneToOne": {
          "_isLoaded": false,
          "fieldName": "userOneToOne",
          "isCascadeDelete": false,
          "loaded": undefined,
          "otherColumnName": "author_id",
          "otherFieldName": "authorManyToOne",
          "undefined": null,
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
