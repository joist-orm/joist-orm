import {
  Entity,
  EntityConstructor,
  EntityMetadata,
  getMetadata,
  LoadHint,
  ManyToManyField,
  ManyToOneField,
  OneToManyField,
  OneToOneField,
} from "./EntityManager";
import { isCannotBeChangedRule } from "./index";
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
  const meta = getMetadata(entityType);
  if (typeof hint === "string") {
    // For a simple string hint, i.e. Book "author", find the Book.author field,
    // and use the metdata to find the otherFieldName, i.e. Author "books"
    const field = findHintField(meta, hint);
    // If Book.author is readonly, it doesn't need to be reactive
    if (isFieldReadOnly(meta, field.fieldName)) {
      return [];
    }
    const otherMeta = field.otherMetadata();
    return [[otherMeta.cstr, [field.otherFieldName]]];
  } else if (Array.isArray(hint)) {
    // For an array of string hints, i.e. Author "authors" "books", recurse
    // into each individual hint (i.e. the logic right above this) and then
    // combine/flatten them.
    return (hint as string[]).map((hint) => reverseHint(entityType, hint as any)).flat();
  } else {
    // For a hash of hints, i.e. Author { books: reviews }, recurse for each key, then combine
    return Object.entries(hint).flatMap(([key, hint]) => {
      const field = findHintField(meta, key);
      if (isFieldReadOnly(meta, field.fieldName)) {
        return [];
      }
      const otherMeta = field.otherMetadata();
      const me = [otherMeta.cstr, [field.otherFieldName]] as [EntityConstructor<any>, string[]];
      return [
        // Return 'me' here so that we react against fields in the middle of a long populate hint.
        me,
        ...reverseHint(otherMeta.cstr, hint).map(([e, hint]) => {
          return [e, [...hint, field.otherFieldName]] as [EntityConstructor<any>, string[]];
        }),
      ];
    });
  }
}

function findHintField(
  meta: EntityMetadata<any>,
  fieldName: string,
): ManyToManyField | ManyToOneField | OneToManyField | OneToOneField {
  const field = meta.fields.find((f) => f.fieldName === fieldName) || fail(`Invalid hint ${fieldName}`);
  if (field.kind !== "m2m" && field.kind !== "m2o" && field.kind !== "o2m" && field.kind !== "o2o") {
    throw new Error("Invalid hint");
  }
  return field;
}

function isFieldReadOnly(meta: EntityMetadata<any>, fieldName: string): boolean {
  return meta.config.__data.rules.some((r) => isCannotBeChangedRule(r, fieldName));
}
