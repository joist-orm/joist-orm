import { Author, Book, BookReview } from "./entities";
import { Entity, EntityConstructor, LoadHint, getMetadata } from "joist-orm";
import { fail } from "./utils";

describe("reverse", () => {
  it("can do string hint", () => {
    expect(reverse(Author, "books")).toEqual([[Book, "author"]]);
  });

  it("can do array of string hints", () => {
    expect(reverse(Author, ["books", "authors"])).toEqual([
      [Book, "author"],
      [Author, "mentor"],
    ]);
  });

  it("can do array of string", () => {
    expect(reverse(Author, { books: "reviews" })).toEqual([[BookReview, { book: "author" }]]);
  });
});

/**
 * Given a load hint of "given an entity, load these N things", return an array
 * of what those N things are, and reversed load hints to "come back" to the
 * original entity.
 */
function reverse<T extends Entity>(
  entityType: EntityConstructor<T>,
  hint: LoadHint<T>,
): [EntityConstructor<any>, LoadHint<any>][] {
  if (typeof hint === "string") {
    // For a simple string hint, i.e. Book "author", find the Book.author field,
    // and use the metdata to find the otherFieldName, i.e. Author "books"
    const meta = getMetadata(entityType);
    const field = meta.fields.find((f) => f.fieldName === hint) || fail("Invalid hint");
    if (field.kind !== "m2m" && field.kind !== "m2o" && field.kind !== "o2m") {
      throw new Error("Invalid hint");
    }
    const otherMeta = field.otherMetadata();
    return [[otherMeta.cstr, field.otherFieldName]];
  } else if (Array.isArray(hint)) {
    // For an array of string hints, i.e. Author "authors" "books", recurse
    // into each individual hint (i.e. the logic right above this) and then
    // combine/flatten them.
    return (hint as string[]).map((hint) => reverse(entityType, hint as any)).flat();
  } else {
    // For a hash of hints, i.e. Author { books: reviews }, recurse for each
    // key in the hash, and then combine
    return Object.entries(hint)
      .map(([key, hint]) => {
        const meta = getMetadata(entityType);
        const field = meta.fields.find((f) => f.fieldName === key) || fail("Invalid hint");
        if (field.kind !== "m2m" && field.kind !== "m2o" && field.kind !== "o2m") {
          throw new Error("Invalid hint");
        }
        const otherMeta = field.otherMetadata();
        return reverse(otherMeta.cstr, hint).map(([e, hint]) => {
          // TODO handle hint already being a hash
          if (typeof hint !== "string") {
            throw new Error("Not handled yet");
          }
          return [e, { [hint]: field.otherFieldName }] as any;
        });
      })
      .flat();
  }
}
