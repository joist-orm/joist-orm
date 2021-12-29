import { Entity, EntityMetadata, Loaded, LoadHint } from "../EntityManager";
import { getEm } from "../index";
import { getLens, Lens, loadLens } from "../loadLens";
import {
  Collection,
  CustomReference,
  ManyToManyCollection,
  ManyToOneReference,
  ManyToOneReferenceImpl,
  OneToManyCollection,
  OneToOneReference,
  OneToOneReferenceImpl,
  PolymorphicReference,
  PolymorphicReferenceImpl,
  Reference,
} from "./index";

export class OrmApi<T extends Entity> {
  constructor(private readonly entity: T) {}

  hasMany<U extends Entity>(
    otherMeta: EntityMetadata<U>,
    fieldName: keyof T,
    otherFieldName: keyof U,
    otherColumnName: string,
  ): Collection<T, U> {
    return new OneToManyCollection(this.entity, otherMeta, fieldName, otherFieldName, otherColumnName);
  }

  hasOne<U extends Entity>(
    otherMeta: EntityMetadata<U>,
    fieldName: keyof T,
    otherFieldName: keyof U,
    notNull: true,
  ): ManyToOneReference<T, U, never>;
  hasOne<U extends Entity>(
    otherMeta: EntityMetadata<U>,
    fieldName: keyof T,
    otherFieldName: keyof U,
    notNull: false,
  ): ManyToOneReference<T, U, undefined>;
  hasOne<U extends Entity, N extends never | undefined>(
    otherMeta: EntityMetadata<U>,
    fieldName: keyof T,
    otherFieldName: keyof U,
  ): ManyToOneReference<T, U, N> {
    return new ManyToOneReferenceImpl<T, U, N>(this.entity, otherMeta, fieldName, otherFieldName);
  }

  hasOneToOne<U extends Entity>(
    otherMeta: EntityMetadata<U>,
    fieldName: keyof T,
    otherFieldName: keyof U,
    otherColumnName: string,
  ): OneToOneReference<T, U> {
    return new OneToOneReferenceImpl<T, U>(this.entity, otherMeta, fieldName, otherFieldName, otherColumnName);
  }

  hasManyToMany<U extends Entity>(
    joinTableName: string,
    fieldName: keyof T,
    columnName: string,
    otherMeta: EntityMetadata<U>,
    otherFieldName: keyof U,
    otherColumnName: string,
  ): Collection<T, U> {
    return new ManyToManyCollection<T, U>(
      joinTableName,
      this.entity,
      fieldName,
      columnName,
      otherMeta,
      otherFieldName,
      otherColumnName,
    );
  }

  hasOnePolymorphic<U extends Entity>(fieldName: keyof T, notNull: true): PolymorphicReference<T, U, never>;
  hasOnePolymorphic<U extends Entity>(fieldName: keyof T, notNull: false): PolymorphicReference<T, U, undefined>;
  hasOnePolymorphic<U extends Entity, N extends never | undefined>(fieldName: keyof T): PolymorphicReference<T, U, N> {
    return new PolymorphicReferenceImpl<T, U, N>(this.entity, fieldName);
  }

  // Note w/o the conditional `V extends undefined` return type, BookReview.author infers as undefined instead of never
  hasOneThrough<U extends Entity, N extends undefined | never, V extends U | N>(
    lens: (lens: Lens<T>) => Lens<V>,
  ): V extends undefined ? Reference<T, U, undefined> : Reference<T, U, never> {
    return new CustomReference<T, U, N>(this.entity, {
      load: async (entity) => {
        await loadLens(entity, lens);
      },
      get: () => getLens(this.entity, lens),
    }) as any;
  }

  hasOneDerived<U extends Entity, N extends never | undefined, V extends U | N, H extends LoadHint<T>>(
    loadHint: H,
    get: (entity: Loaded<T, H>) => V,
  ): Reference<T, U, N> {
    return new CustomReference<T, U, N>(this.entity, {
      load: async (entity) => {
        await getEm(entity).populate(entity, loadHint);
      },
      get: () => get(this.entity as Loaded<T, H>),
    });
  }
}
