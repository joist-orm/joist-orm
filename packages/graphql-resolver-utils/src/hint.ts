import { SelectionSetNode } from "graphql/language";
import {
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLResolveInfo,
  isObjectType,
} from "graphql/type";
import { Entity, EntityMetadata, LoadHint } from "joist-core";

/** Returns a load hint for the given `meta` entity at the `info` node.populate`. */
export function convertInfoToLoadHint<T extends Entity>(
  meta: EntityMetadata,
  info: GraphQLResolveInfo,
): LoadHint<T> | undefined {
  // The return type of the current field resolver is the root type, i.e.
  // Author.books fieldResolver ==> objectType = Book, or
  // query.authors fieldResolver ==> objectType = Author
  const objectType = convertToObjectType(info.returnType);
  const { selectionSet, arguments: args } = info.fieldNodes[0];
  const hasArgs = !!args && args.length > 0;
  if (objectType && selectionSet && !hasArgs) {
    const hint = selectionSetToObject(info, meta, objectType, selectionSet);
    // Don't return an empty hint
    return Object.keys(hint).length === 0 ? undefined : hint;
  }
  return undefined;
}

/** Converts a GraphQL selection set into a hint for `EntityManager.populate`. */
export function selectionSetToObject(
  info: GraphQLResolveInfo,
  meta: EntityMetadata,
  gqlType: GraphQLObjectType,
  selectionSet: SelectionSetNode,
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const selection of selectionSet.selections) {
    if (selection.kind === "Field") {
      const fieldName = selection.name.value;
      const field = gqlType.getFields()[fieldName];
      // This might be __typename, which is a meta field
      if (field === undefined) continue;
      const fieldType = convertToObjectType(field.type);
      const ormField = meta.allFields[fieldName];
      if (fieldType && selection.selectionSet && ormField && "otherMetadata" in ormField) {
        result[fieldName] = selectionSetToObject(info, ormField.otherMetadata(), fieldType, selection.selectionSet);
      }
    } else if (selection.kind === "FragmentSpread") {
      const fragmentName = selection.name.value;
      const fragment = info.fragments[fragmentName]!;
      const type = info.schema.getType(fragment.typeCondition.name.value)!;
      const objectType = convertToObjectType(type as any);
      if (objectType) {
        const other = selectionSetToObject(info, meta, objectType, fragment.selectionSet);
        deepMerge(result, other);
      }
    } else if (selection.kind === "InlineFragment" && selection.typeCondition) {
      const type = info.schema.getType(selection.typeCondition.name.value)!;
      const objectType = convertToObjectType(type as any);
      if (objectType) {
        const other = selectionSetToObject(info, meta, objectType, selection.selectionSet);
        deepMerge(result, other);
      }
    }
  }
  return result;
}

export function convertToObjectType(type: GraphQLOutputType): GraphQLObjectType | undefined {
  if (type instanceof GraphQLNonNull || type instanceof GraphQLList) {
    return convertToObjectType(type.ofType);
  } else if (isObjectType(type)) {
    return type;
  }
  return undefined;
}

function deepMerge<T extends object>(a: T, b: T): void {
  for (const [key, value] of Object.entries(b)) {
    deepMerge(((a as any)[key] ??= {}), value);
  }
}
