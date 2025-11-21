import {
  BaseEntity,
  type Changes,
  type Collection,
  ConfigApi,
  type DeepPartialOrNull,
  type EntityFilter,
  type EntityGraphQLFilter,
  type EntityMetadata,
  failNoIdYet,
  type FilterOf,
  type Flavor,
  getField,
  type GraphQLFilterOf,
  hasManyToMany,
  isLoaded,
  type JsonPayload,
  type Lens,
  type Loaded,
  type LoadHint,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  type OptsOf,
  type OrderBy,
  type PartialOrNull,
  setField,
  setOpts,
  type TaggedId,
  toIdOf,
  toJSON,
  type ToJsonHint,
  updatePartial,
  type ValueFilter,
  type ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import {
  type Author,
  type AuthorId,
  type Book,
  type BookId,
  type BookReview,
  type BookReviewId,
  type Entity,
  EntityManager,
  newTag,
  type Publisher,
  type PublisherId,
  type Tag,
  tagMeta,
  type Task,
  type TaskId,
} from "../entities";

export type TagId = Flavor<string, "Tag">;

export interface TagFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  name: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  authors: { kind: "m2m"; type: Author };
  books: { kind: "m2m"; type: Book };
  bookReviews: { kind: "m2m"; type: BookReview };
  publishers: { kind: "m2m"; type: Publisher };
  tasks: { kind: "m2m"; type: Task };
}

export interface TagOpts {
  name: string;
  authors?: Author[];
  books?: Book[];
  bookReviews?: BookReview[];
  publishers?: Publisher[];
  tasks?: Task[];
}

export interface TagIdsOpts {
  authorIds?: AuthorId[] | null;
  bookIds?: BookId[] | null;
  bookReviewIds?: BookReviewId[] | null;
  publisherIds?: PublisherId[] | null;
  taskIds?: TaskId[] | null;
}

export interface TagFilter {
  id?: ValueFilter<TagId, never> | null;
  name?: ValueFilter<string, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  authors?: EntityFilter<Author, AuthorId, FilterOf<Author>, null | undefined>;
  books?: EntityFilter<Book, BookId, FilterOf<Book>, null | undefined>;
  bookReviews?: EntityFilter<BookReview, BookReviewId, FilterOf<BookReview>, null | undefined>;
  publishers?: EntityFilter<Publisher, PublisherId, FilterOf<Publisher>, null | undefined>;
  tasks?: EntityFilter<Task, TaskId, FilterOf<Task>, null | undefined>;
}

export interface TagGraphQLFilter {
  id?: ValueGraphQLFilter<TagId>;
  name?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  authors?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, null | undefined>;
  books?: EntityGraphQLFilter<Book, BookId, GraphQLFilterOf<Book>, null | undefined>;
  bookReviews?: EntityGraphQLFilter<BookReview, BookReviewId, GraphQLFilterOf<BookReview>, null | undefined>;
  publishers?: EntityGraphQLFilter<Publisher, PublisherId, GraphQLFilterOf<Publisher>, null | undefined>;
  tasks?: EntityGraphQLFilter<Task, TaskId, GraphQLFilterOf<Task>, null | undefined>;
}

export interface TagOrder {
  id?: OrderBy;
  name?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
}

export interface TagFactoryExtras {
}

export const tagConfig = new ConfigApi<Tag, Context>();

tagConfig.addRule(newRequiredRule("name"));
tagConfig.addRule(newRequiredRule("createdAt"));
tagConfig.addRule(newRequiredRule("updatedAt"));

declare module "joist-orm" {
  interface TypeMap {
    Tag: {
      entityType: Tag;
      filterType: TagFilter;
      gqlFilterType: TagGraphQLFilter;
      orderType: TagOrder;
      optsType: TagOpts;
      fieldsType: TagFields;
      optIdsType: TagIdsOpts;
      factoryExtrasType: TagFactoryExtras;
      factoryOptsType: Parameters<typeof newTag>[1];
    };
  }
}

export abstract class TagCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "t";
  static readonly metadata: EntityMetadata<Tag>;

  declare readonly __type: { 0: "Tag" };

  readonly authors: Collection<Tag, Author> = hasManyToMany("authors_to_tags", "tag_id", "tags", "author_id");
  readonly books: Collection<Tag, Book> = hasManyToMany("books_to_tags", "tag_id", "tags", "book_id");
  readonly bookReviews: Collection<Tag, BookReview> = hasManyToMany(
    "book_reviews_to_tags",
    "tag_id",
    "tags",
    "book_review_id",
  );
  readonly publishers: Collection<Tag, Publisher> = hasManyToMany(
    "publishers_to_tags",
    "tag_id",
    "tags",
    "publisher_id",
  );
  readonly tasks: Collection<Tag, Task> = hasManyToMany("task_to_tags", "tag_id", "tags", "task_id");

  get id(): TagId {
    return this.idMaybe || failNoIdYet("Tag");
  }

  get idMaybe(): TagId | undefined {
    return toIdOf(tagMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("Tag");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get name(): string {
    return getField(this, "name");
  }

  set name(name: string) {
    setField(this, "name", name);
  }

  get createdAt(): Date {
    return getField(this, "createdAt");
  }

  get updatedAt(): Date {
    return getField(this, "updatedAt");
  }

  /**
   * Partial update taking any subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
   * @example
   * ```
   * entity.setPartial({
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   * });
   * ```
   * @see {@link https://joist-orm.io/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  set(opts: Partial<TagOpts>): void {
    setOpts(this as any as Tag, opts);
  }

  /**
   * Partial update taking any subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
   * @example
   * ```
   * entity.setPartial({
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   * });
   * ```
   * @see {@link https://joist-orm.io/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  setPartial(opts: PartialOrNull<TagOpts>): void {
    setOpts(this as any as Tag, opts as OptsOf<Tag>, { partial: true });
  }

  /**
   * Partial update taking any nested subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
   * @example
   * ```
   * entity.setDeepPartial({
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   *   books: [{ title: "b1" }], // create a child book
   * });
   * ```
   * @see {@link https://joist-orm.io/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  setDeepPartial(opts: DeepPartialOrNull<Tag>): Promise<void> {
    return updatePartial(this as any as Tag, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<Tag> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<Tag>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Tag, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<Tag>>(hint: H): Promise<Loaded<Tag, H>>;
  populate<const H extends LoadHint<Tag>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Tag, H>>;
  populate<const H extends LoadHint<Tag>, V>(hint: H, fn: (t: Loaded<Tag, H>) => V): Promise<V>;
  populate<const H extends LoadHint<Tag>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (t: Loaded<Tag, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<Tag>, V>(
    hintOrOpts: any,
    fn?: (t: Loaded<Tag, H>) => V,
  ): Promise<Loaded<Tag, H> | V> {
    return this.em.populate(this as any as Tag, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<Tag>>(hint: H): this is Loaded<Tag, H> {
    return isLoaded(this as any as Tag, hint);
  }

  /**
   * Build a type-safe, loadable and relation aware POJO from this entity, given a hint.
   *
   * Note: As the hint might load, this returns a Promise
   *
   * @example
   * ```
   * const payload = await a.toJSON({
   *   id: true,
   *   books: { id: true, reviews: { rating: true } }
   * });
   * ```
   * @see {@link https://joist-orm.io/advanced/json-payloads | Json Payloads} on the Joist docs
   */
  toJSON(): object;
  toJSON<const H extends ToJsonHint<Tag>>(hint: H): Promise<JsonPayload<Tag, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }
}
