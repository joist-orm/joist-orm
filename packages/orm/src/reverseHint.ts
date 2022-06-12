import { Entity } from "./Entity";
import { EntityConstructor } from "./EntityManager";
import { getMetadata } from "./EntityMetadata";
import { LoadHint } from "./loaded";
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
  return Object.entries(normalizeHint(hint)).flatMap(([key, hint]) => {
    const field = meta.fields[key] || fail(`Invalid hint ${entityType.name} ${JSON.stringify(hint)}`);
    if (field.kind !== "m2m" && field.kind !== "m2o" && field.kind !== "o2m" && field.kind !== "o2o") {
      throw new Error("Invalid hint");
    }
    const otherMeta = field.otherMetadata();
    const me = [otherMeta.cstr, [field.otherFieldName]] as [EntityConstructor<any>, string[]];
    return [
      me,
      ...reverseHint(otherMeta.cstr, hint).map(([e, hint]) => {
        return [e, [...hint, field.otherFieldName]] as [EntityConstructor<any>, string[]];
      }),
    ];
  });
}

function normalizeHint<T extends Entity>(hint: LoadHint<T>): object {
  if (typeof hint === "string") {
    return { [hint]: {} };
  } else if (Array.isArray(hint)) {
    return Object.fromEntries(hint.map((field) => [field, {}]));
  } else {
    return hint;
  }
}
