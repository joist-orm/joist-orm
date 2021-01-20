import { Entity, EntityConstructor, getMetadata, LoadHint } from "./EntityManager";
import { fail } from "./utils";

/**
 * Given a load hint of "given an entity, load these N things", return an array
 * of what those N things are, and reversed load hints to "come back" to the
 * original entity.
 */
export function reverseHint<T extends Entity>(
  entityType: EntityConstructor<T>,
  hint: LoadHint<T>,
): [EntityConstructor<any>, string[]][] {
  if (typeof hint === "string") {
    // For a simple string hint, i.e. Book "author", find the Book.author field,
    // and use the metdata to find the otherFieldName, i.e. Author "books"
    const meta = getMetadata(entityType);
    const field = meta.fields.find((f) => f.fieldName === hint) || fail(`Invalid hint ${JSON.stringify(hint)}`);
    if (field.kind !== "m2m" && field.kind !== "m2o" && field.kind !== "o2m" && field.kind !== "o2o") {
      throw new Error("Invalid hint");
    }
    const otherMeta = field.otherMetadata();
    return [[otherMeta.cstr, [field.otherFieldName]]];
  } else if (Array.isArray(hint)) {
    // For an array of string hints, i.e. Author "authors" "books", recurse
    // into each individual hint (i.e. the logic right above this) and then
    // combine/flatten them.
    return (hint as string[]).map((hint) => reverseHint(entityType, hint as any)).flat();
  } else {
    // For a hash of hints, i.e. Author { books: reviews }, recurse for each
    // key in the hash, and then combine
    return Object.entries(hint).flatMap(([key, hint]) => {
      const meta = getMetadata(entityType);
      const field = meta.fields.find((f) => f.fieldName === key) || fail(`Invalid hint ${JSON.stringify(hint)}`);
      if (field.kind !== "m2m" && field.kind !== "m2o" && field.kind !== "o2m" && field.kind !== "o2o") {
        throw new Error("Invalid hint");
      }
      const otherMeta = field.otherMetadata();
      return reverseHint(otherMeta.cstr, hint).map(([e, hint]) => {
        return [e, [...hint, field.otherFieldName]] as [EntityConstructor<any>, string[]];
      });
    });
  }
}
