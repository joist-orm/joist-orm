import {
  BaseEntity,
  cleanStringValue,
  ConfigApi,
  failNoIdYet,
  FieldType,
  getField,
  getInstanceData,
  hasOnePolymorphic,
  isEntity,
  isLoaded,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  setField,
  setFieldValue,
  setOpts,
  SettableFields,
  toIdOf,
} from "joist-orm";
import type {
  Changes,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  Flavor,
  IdOf,
  Lens,
  Loaded,
  LoadHint,
  MaybeAbstractEntityConstructor,
  OptsOf,
  OrderBy,
  PartialOrNull,
  PolymorphicReference,
  TaggedId,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import { Author, Book, Comment, commentMeta, EntityManager, newComment } from "../entities";
import type { Entity } from "../entities";

export type CommentId = Flavor<string, Comment>;

export type CommentParent = Author | Book;
export function getCommentParentConstructors(): MaybeAbstractEntityConstructor<CommentParent>[] {
  return [Author, Book];
}
export function isCommentParent(maybeEntity: unknown): maybeEntity is CommentParent {
  return isEntity(maybeEntity) && getCommentParentConstructors().some((type) => maybeEntity instanceof type);
}

export interface CommentFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  text: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  parent: { kind: "poly"; type: CommentParent; nullable: never };
}

export interface CommentOpts {
  text: string;
  parent: CommentParent;
}

export interface CommentIdsOpts {
  parentId?: IdOf<CommentParent> | null;
}

export interface CommentFilter {
  id?: ValueFilter<CommentId, never> | null;
  text?: ValueFilter<string, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  parent?: EntityFilter<CommentParent, IdOf<CommentParent>, never, null | undefined>;
}

export interface CommentGraphQLFilter {
  id?: ValueGraphQLFilter<CommentId>;
  text?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  parent?: EntityGraphQLFilter<CommentParent, IdOf<CommentParent>, never, null | undefined>;
}

export interface CommentOrder {
  id?: OrderBy;
  text?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
}

export const commentConfig = new ConfigApi<Comment, Context>();

commentConfig.addRule(newRequiredRule("text"));
commentConfig.addRule(newRequiredRule("createdAt"));
commentConfig.addRule(newRequiredRule("updatedAt"));
commentConfig.addRule(newRequiredRule("parent"));

export abstract class CommentCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "c";
  static readonly metadata: EntityMetadata<Comment>;

  declare readonly __orm: {
    filterType: CommentFilter;
    gqlFilterType: CommentGraphQLFilter;
    orderType: CommentOrder;
    optsType: CommentOpts;
    fieldsType: CommentFields;
    optIdsType: CommentIdsOpts;
    factoryOptsType: Parameters<typeof newComment>[1];
  };

  constructor(em: EntityManager, opts: CommentOpts) {
    super(em, opts);
    setOpts(this as any as Comment, opts, { calledFromConstructor: true });
  }

  get id(): CommentId {
    return this.idMaybe || failNoIdYet("Comment");
  }

  get idMaybe(): CommentId | undefined {
    return toIdOf(commentMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("Comment");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get text(): string {
    return getField(this, "text");
  }

  set text(text: string) {
    setField(this, "text", cleanStringValue(text));
  }

  get createdAt(): Date {
    return getField(this, "createdAt");
  }

  get updatedAt(): Date {
    return getField(this, "updatedAt");
  }

  getFieldValue<K extends keyof CommentFields>(key: K): FieldType<CommentFields, K> {
    return getField(this as any, key);
  }

  setFieldValue<K extends keyof SettableFields<CommentFields> & keyof CommentFields>(
    key: K,
    value: FieldType<CommentFields, K>,
  ): void {
    setFieldValue(this, key, value);
  }

  set(opts: Partial<CommentOpts>): void {
    setOpts(this as any, opts);
  }

  setPartial(opts: PartialOrNull<CommentOpts>): void {
    setOpts(this as any, opts as OptsOf<Comment>, { partial: true });
  }

  get changes(): Changes<Comment> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<Comment>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Comment, fn, opts);
  }

  populate<H extends LoadHint<Comment>>(hint: H): Promise<Loaded<Comment, H>>;
  populate<H extends LoadHint<Comment>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Comment, H>>;
  populate<H extends LoadHint<Comment>, V>(hint: H, fn: (c: Loaded<Comment, H>) => V): Promise<V>;
  populate<H extends LoadHint<Comment>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (c: Loaded<Comment, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<Comment>, V>(
    hintOrOpts: any,
    fn?: (c: Loaded<Comment, H>) => V,
  ): Promise<Loaded<Comment, H> | V> {
    return this.em.populate(this as any as Comment, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<Comment>>(hint: H): this is Loaded<Comment, H> {
    return isLoaded(this as any as Comment, hint);
  }

  get parent(): PolymorphicReference<Comment, CommentParent, never> {
    const { relations } = getInstanceData(this);
    return relations.parent ??= hasOnePolymorphic(this as any as Comment, "parent");
  }
}
