import {
  AsyncMethodImpl,
  AsyncMethodsIn,
  Collection,
  Entity,
  EntityMetadata,
  FieldProperty,
  FieldsOf,
  FilterWithAlias,
  getProperties,
  Loadable,
  ManyToManyCollection,
  ManyToOneReferenceImpl,
  OneToManyCollection,
  OneToOneReferenceImpl,
  Reference,
  RelationsIn,
} from "joist-orm";
import { AsyncPropertyImpl } from "joist-orm/build/relations/hasAsyncProperty";

export type FieldAccess = "r" | "rw" | "w";
export type MethodAccess = "i";
export type CrudValue = "crud" | "cru" | "crd" | "cr" | "cu" | "cd" | "c" | "ru" | "rd" | "r" | "ud" | "u" | "d";

/**
 * Need to allow both the current `AuthRule` "graph from root" but also probably
 * just "top-level entity" rules, like:
 *
 * ```
 * entities: {
 *   UserStatus: { code: "r", name: "r" },
 *   CommitmentStatus: "r",
 *   CostCode: "r",
 *   Book: {
 *     where: { isPublished: true },
 *     title: "r",
 *     reviews: "r",
 *   }
 * }
 * ```
 */

/**
 * Declares the authorization rule for an entity `T`, which can either be the root
 * of the auth tree (by started at the `User` entity) or a specific node further down
 * in the tree.
 *
 * Each auth rule is a collection of:
 *
 * - Fields that can be read/written
 * - Async methods that can be invoked
 * - Relations that can be traversed
 * - A `where` filter that limits which instances this rule applies to
 */
export type AuthRule<T extends Entity> = {
  [K in
    | keyof FieldsOf<T>
    | keyof RelationsIn<T>
    | keyof AsyncMethodsIn<T>
    | keyof Loadable<T>
    | "entity"
    | "*"
    | "where"]?: K extends keyof RelationsIn<T>
    ? T[K] extends Reference<T, infer U, any>
      ? AuthRule<U>
      : T[K] extends Collection<T, infer U>
        ? AuthRule<U>
        : never
    : K extends keyof AsyncMethodsIn<T>
      ? MethodAccess
      : K extends keyof FieldsOf<T>
        ? FieldsOf<T>[K] extends { kind: "primitive" }
          ? FieldAccess
          : never
        : // Look for AsyncProperties, which we can't sql-join through, so leave as FieldAccess
          K extends keyof Loadable<T>
          ? FieldAccess
          : K extends "*"
            ? FieldAccess
            : K extends "entity"
              ? CrudValue
              : K extends "where"
                ? FilterWithAlias<T>
                : never;
};

/** The Auth rule for a specific entity, i.e. the root User or a child node, within the overall tree. */
export interface ParsedAuthRule<T extends Entity> {
  meta: EntityMetadata<T>;
  fields: Record<string, FieldAccess>;
  methods: Record<string, MethodAccess>;
  relations: Record<string, ParsedAuthRule<any>>;
  where: FilterWithAlias<T> | undefined;
  // Needs to be a tuple of [path, where]
  pathToUser: ParsedAuthPath[];
}

interface ParsedAuthPath {
  meta: EntityMetadata;
  relation: string;
  where: FilterWithAlias<any> | undefined;
}

/**
 * Parses the root, declarative `rule` into a map of `entity` -> `ParsedAuthRule`s.
 */
export function parseAuthRule<T extends Entity>(
  meta: EntityMetadata<T>,
  rule: AuthRule<T>,
): Record<string, ParsedAuthRule<any>[]> {
  const result: Record<string, ParsedAuthRule<any>[]> = {};
  parse(result, meta, rule, []);
  return result;
}

function parse(
  result: Record<string, ParsedAuthRule<any>[]>,
  meta: EntityMetadata,
  hint: AuthRule<any>,
  pathToUser: ParsedAuthPath[],
): ParsedAuthRule<any> {
  const fields: Record<string, FieldAccess> = {};
  const methods: Record<string, MethodAccess> = {};
  const relations: Record<string, ParsedAuthRule<any>> = {};
  let where: FilterWithAlias<any> | undefined = undefined;
  const properties = getProperties(meta);

  for (const [key, value] of Object.entries(hint)) {
    if (key === "where") {
      where = value as any; // TODO revisit
    } else if (key === "*") {
      // Resolve star to all fields?
      fields[key] = value as unknown as FieldAccess;
    } else if (key in properties) {
      const property = properties[key];
      if (
        property instanceof ManyToOneReferenceImpl ||
        property instanceof ManyToManyCollection ||
        property instanceof OneToManyCollection ||
        property instanceof OneToOneReferenceImpl
      ) {
        relations[key] = parse(result, property.otherMeta, value as any, [
          ...pathToUser,
          { meta, relation: property.otherFieldName, where },
        ]);
      } else if (property instanceof AsyncMethodImpl) {
        methods[key] = value as unknown as MethodAccess;
      } else if (property instanceof AsyncPropertyImpl) {
        methods[key] = value as unknown as MethodAccess;
      } else if (property instanceof FieldProperty) {
        fields[key] = value as unknown as FieldAccess;
      } else {
        throw new Error(`Unsupported property ${key} on ${meta.cstr.name}`);
      }
    } else {
      throw new Error(`Unsupported key ${key} on ${meta.cstr.name}`);
    }
  }

  const parsed = { meta, fields, methods, relations, where, pathToUser: pathToUser.reverse() };
  // What about CTI base/child classes?
  (result[meta.cstr.name] ??= []).push(parsed);
  return parsed;
}
