import { GraphQLResolveInfo } from "graphql/type";
import {
  AsyncProperty,
  Collection,
  Entity,
  EntityMetadata,
  Field,
  getProperties,
  IdOf,
  isAsyncProperty,
  isCollection,
  isLoadedAsyncProperty,
  isLoadedCollection,
  isLoadedReference,
  isManyToOneField,
  isOneToManyField,
  isReference,
  LoadHint,
  ManyToManyField,
  ManyToOneField,
  OneToManyField,
  OneToOneField,
  PolymorphicField,
  PrimaryKeyField,
  Reference,
} from "joist-orm";
import { Resolver } from "./context";
import { convertInfoToLoadHint } from "./hint";

type GraphQLPrimitive = string | Date | boolean | number | null | undefined;

/**
 * Maps properties like `Entity.firstName: string` to field resolver functions like `firstName(): Promise<string>`.
 *
 * Note that we don't necessarily know/care if `firstName` is in the `Entity` GraphQL type, we just map
 * every field to a potential resolver, and then will let the `EntityResolvers` type-check effectively
 * do the union of "what's defined on the ORM type vs. what's defined on the GraphQL type".
 *
 * Note this might require setting GraphQL options like `requireResolversToMatchSchema: ignore` to avoid
 * the GraphQL infra complaining about the extra field resolvers that Joist creates for fields that
 * are not technically mapped in your GraphQL schema.
 */
export type EntityResolver<T extends Entity> = {
  [P in keyof T]: P extends "id"
    ? Resolver<T, Record<string, any>, IdOf<T>>
    : T[P] extends GraphQLPrimitive | GraphQLPrimitive[]
    ? Resolver<T, Record<string, any>, T[P]>
    : T[P] extends Collection<T, infer U>
    ? Resolver<T, Record<string, any>, U[]>
    : T[P] extends Reference<T, infer U, infer N>
    ? Resolver<T, Record<string, any>, U>
    : T[P] extends AsyncProperty<T, infer V>
    ? Resolver<T, Record<string, any>, V>
    : T[P] extends Promise<infer V>
    ? Resolver<T, Record<string, any>, V>
    : T[P] extends () => Promise<infer V>
    ? Resolver<T, Record<string, any>, V>
    : T[P] extends () => infer V
    ? Resolver<T, Record<string, any>, V>
    : Resolver<T, Record<string, any>, T[P]>;
};

/**
 * Creates field resolvers for each of the fields on our entity.
 */
export function entityResolver<T extends Entity, A extends Record<string, keyof T> = Record<string, any>>(
  entityMetadata: EntityMetadata<T>,
  aliases?: A,
): EntityResolver<T> & { [K in keyof A]: EntityResolver<T>[A[K]] } {
  const idResolver = (entityOrId: T | string) => {
    return typeof entityOrId === "string" ? entityOrId : entityOrId.id;
  };

  const primitiveResolvers = Object.values(entityMetadata.fields)
    .filter((ormField) => !isPrimaryKeyField(ormField) && !isReferenceField(ormField) && !isCollectionField(ormField))
    .map((ormField) => {
      if (ormField.kind === "primitive" && ormField.derived === "async") {
        return [ormField.fieldName, (entity: T) => (entity as any)[ormField.fieldName].get];
      } else {
        // Currently, we only support primitives, i.e. strings/numbers/etc. and not collections.
        return [ormField.fieldName, (entity: T) => (entity as any)[ormField.fieldName]];
      }
    });

  const referenceResolvers: [string, Resolver<any, any, any>][] = Object.values(entityMetadata.fields)
    .filter((ormField) => isReferenceField(ormField))
    .map((ormField) => [
      ormField.fieldName,
      (entity: T, args, ctx, info: GraphQLResolveInfo | undefined) => {
        // Use the `info` to see if the query is only returning `{ id }` and if so avoid fetching the entity
        if ((ormField.kind === "m2o" || ormField.kind === "poly") && info?.fieldNodes.length === 1) {
          const selectionSet = info.fieldNodes[0].selectionSet;
          if (selectionSet) {
            if (
              selectionSet.selections.length === 1 &&
              selectionSet.selections[0].kind === "Field" &&
              selectionSet.selections[0].name.value === "id"
            ) {
              // This is cheating and returning the "wrong root", but our `id` field resolvers
              // knows to look for it, to optimize this case and avoiding the unnecessary load
              return (entity as any)[ormField.fieldName].idMaybe;
            }
          }
        }
        const reference = (entity as any)[ormField.fieldName];
        if (isLoadedReference(reference)) {
          return reference.get;
        }
        // We skip polys b/c they can't have load hints anyway
        if (info && (isManyToOneField(ormField) || isOneToManyField(ormField))) {
          // See if we can populate the collection from the GraphQL selection set
          const loadHint = convertInfoToLoadHint(ormField.otherMetadata(), info);
          if (loadHint) {
            const parentHint = { [ormField.fieldName]: loadHint } as LoadHint<T>;
            return entity.em.populate(entity, parentHint).then(() => reference.get);
          }
        }
        return reference.load();
      },
    ]);

  const collectionResolvers: [string, Resolver<T, any, any>][] = Object.values(entityMetadata.fields)
    .filter((ormField) => isCollectionField(ormField))
    .map((ormField) => [
      ormField.fieldName,
      (entity, args, ctx, info: GraphQLResolveInfo | undefined) => {
        const field = ormField as OneToManyField | ManyToManyField;
        const collection = (entity as any)[field.fieldName];
        if (isLoadedCollection(collection)) {
          return collection.get;
        }
        if (info) {
          // See if we can populate the collection from the GraphQL selection set
          const loadHint = convertInfoToLoadHint(field.otherMetadata(), info);
          if (loadHint) {
            const parentHint = { [field.fieldName]: loadHint } as LoadHint<T>;
            return entity.em.populate(entity, parentHint).then(() => collection.get);
          }
        }
        return collection.load();
      },
    ]);

  const ormResolvers = Object.fromEntries([...primitiveResolvers, ...referenceResolvers, ...collectionResolvers]);

  // Look for non-orm properties on the domain object's prototype
  // and on an instance of the domain object itself to get
  // non-prototype properties like CustomReferences
  const ignoredKeys = Object.keys(ormResolvers);
  const customProperties = Object.keys(getProperties(entityMetadata)).filter((n) => !ignoredKeys.includes(n));
  const customResolvers: [string, Resolver<T, any, any>][] = customProperties.map((key) => [
    key,
    (entity) => {
      const property = (entity as any)[key];
      if (typeof property === "function") {
        // Support methods like `async name(): Promise<string>`
        return (property as Function).apply(entity);
      } else if (isReference(property) || isCollection(property) || isAsyncProperty(property)) {
        if (isLoadedReference(property) || isLoadedCollection(property) || isLoadedAsyncProperty(property)) {
          return property.get;
        }
        // ...we need to know the `property.otherMetadata()` return type, which isn't available right now
        // const loadHint = convertInfoToLoadHint(getMetadata(entity), info);
        // if (loadHint) {
        //   return entity.em.populate(entity, loadHint).then(() => (property as any).get);
        // }
        return property.load();
      } else {
        return property;
      }
    },
  ]);

  let resolvers = {
    id: idResolver,
    ...ormResolvers,
    ...Object.fromEntries(customResolvers),
  } as any;

  if (aliases) {
    Object.entries(aliases).forEach(([alias, field]) => {
      resolvers[alias] = resolvers[field];
    });
  }

  return resolvers;
}

function isReferenceField(ormField: Field): ormField is ManyToOneField | OneToOneField | PolymorphicField {
  return ormField.kind === "m2o" || ormField.kind === "o2o" || ormField.kind === "poly";
}

function isCollectionField(ormField: Field): ormField is OneToManyField | ManyToManyField {
  return ormField.kind === "o2m" || ormField.kind === "m2m";
}

function isPrimaryKeyField(ormField: Field): ormField is PrimaryKeyField {
  return ormField.kind === "primaryKey";
}
