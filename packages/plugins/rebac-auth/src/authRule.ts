import {
  AsyncMethodImpl,
  AsyncMethodsIn,
  Collection,
  Entity,
  EntityMetadata,
  FieldsOf,
  FilterWithAlias,
  getProperties,
  ManyToManyCollection,
  ManyToOneReferenceImpl,
  OneToManyCollection,
  Reference,
  RelationsIn,
} from "joist-orm";

export type FieldAccess = "r" | "rw" | "w";
export type MethodAccess = "i";

/**
 * Describes an auth rule for an entity `T`.
 *
 * The auth rule is a collection of:
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
    : K extends "*"
    ? FieldAccess
    : K extends "where"
    ? FilterWithAlias<T>
    : never;
};

type ParsedAuthRule<T extends Entity> = {
  meta: EntityMetadata<T>;
  fields: Record<string, FieldAccess>;
  methods: Record<string, MethodAccess>;
  relations: Record<string, ParsedAuthRule<any>>;
  where: FilterWithAlias<T> | undefined;
  pathToUser: string[];
};

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
  pathToUser: string[],
): ParsedAuthRule<any> {
  const fields: Record<string, FieldAccess> = {};
  const methods: Record<string, MethodAccess> = {};
  const relations: Record<string, ParsedAuthRule<any>> = {};
  let where: FilterWithAlias<any> | undefined = undefined;
  const properties = getProperties(meta);

  for (const [key, value] of Object.entries(hint)) {
    if (key === "where") {
      where = value;
    } else if (key === "*") {
      // Resolve star to all fields?
      fields[key] = value as unknown as FieldAccess;
    } else if (key in properties) {
      const property = properties[key];
      if (property instanceof ManyToOneReferenceImpl) {
        relations[key] = parse(result, property.otherMeta, value as any, [...pathToUser, property.otherFieldName]);
      } else if (property instanceof ManyToManyCollection) {
        relations[key] = parse(result, property.otherMeta, value as any, [...pathToUser, property.otherFieldName]);
      } else if (property instanceof OneToManyCollection) {
        relations[key] = parse(result, property.otherMeta, value as any, [...pathToUser, property.otherFieldName]);
      } else if (property instanceof AsyncMethodImpl) {
        methods[key] = value as unknown as MethodAccess;
      } else {
        throw new Error(`Unsupported property ${key} on ${meta.cstr.name}`);
      }
    }
  }
  const parsed = { meta, fields, methods, relations, where, pathToUser };
  // What about CTI base/child classes?
  (result[meta.cstr.name] ??= []).push(parsed);
  return parsed;
}
