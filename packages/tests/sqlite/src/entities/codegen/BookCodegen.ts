import {
  BaseEntity,
  type Changes,
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
  hasOne,
  isLoaded,
  type JsonPayload,
  type Lens,
  type Loaded,
  type LoadHint,
  loadLens,
  type ManyToOneReference,
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
  type AuthorOrder,
  type Book,
  bookMeta,
  type Entity,
  EntityManager,
  newBook,
} from "../entities";

export type BookId = Flavor<string, "Book">;

export interface BookFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  title: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  author: { kind: "m2o"; type: Author; nullable: never; derived: false };
}

export interface BookOpts {
  title: string;
  author: Author | AuthorId;
}

export interface BookIdsOpts {
  authorId?: AuthorId | null;
}

export interface BookFilter {
  id?: ValueFilter<BookId, never> | null;
  title?: ValueFilter<string, never>;
  author?: EntityFilter<Author, AuthorId, FilterOf<Author>, never>;
}

export interface BookGraphQLFilter {
  id?: ValueGraphQLFilter<BookId>;
  title?: ValueGraphQLFilter<string>;
  author?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, never>;
}

export interface BookOrder {
  id?: OrderBy;
  title?: OrderBy;
  author?: AuthorOrder;
}

export interface BookFactoryExtras {
}

export const bookConfig = new ConfigApi<Book, Context>();

bookConfig.addRule(newRequiredRule("title"));
bookConfig.addRule(newRequiredRule("author"));

declare module "joist-core" {
  interface TypeMap {
    Book: {
      entityType: Book;
      filterType: BookFilter;
      gqlFilterType: BookGraphQLFilter;
      orderType: BookOrder;
      optsType: BookOpts;
      fieldsType: BookFields;
      optIdsType: BookIdsOpts;
      factoryExtrasType: BookFactoryExtras;
      factoryOptsType: Parameters<typeof newBook>[1];
    };
  }
}

export abstract class BookCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "b";
  static readonly metadata: EntityMetadata<Book>;

  declare readonly __type: { 0: "Book" };

  readonly author: ManyToOneReference<Book, Author, never> = hasOne();

  get id(): BookId {
    return this.idMaybe || failNoIdYet("Book");
  }

  get idMaybe(): BookId | undefined {
    return toIdOf(bookMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("Book");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get title(): string {
    return getField(this, "title");
  }

  set title(title: string) {
    setField(this, "title", title);
  }

  set(opts: Partial<BookOpts>): void {
    setOpts(this as any as Book, opts);
  }

  setPartial(opts: PartialOrNull<BookOpts>): void {
    setOpts(this as any as Book, opts as OptsOf<Book>, { partial: true });
  }

  setDeepPartial(opts: DeepPartialOrNull<Book>): Promise<void> {
    return updatePartial(this as any as Book, opts);
  }

  get changes(): Changes<Book> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<Book>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Book, fn, opts);
  }

  populate<const H extends LoadHint<Book>>(hint: H): Promise<Loaded<Book, H>>;
  populate<const H extends LoadHint<Book>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Book, H>>;
  populate<const H extends LoadHint<Book>, V>(hint: H, fn: (b: Loaded<Book, H>) => V): Promise<V>;
  populate<const H extends LoadHint<Book>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (b: Loaded<Book, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<Book>, V>(
    hintOrOpts: any,
    fn?: (b: Loaded<Book, H>) => V,
  ): Promise<Loaded<Book, H> | V> {
    return this.em.populate(this as any as Book, hintOrOpts, fn);
  }

  isLoaded<const H extends LoadHint<Book>>(hint: H): this is Loaded<Book, H> {
    return isLoaded(this as any as Book, hint);
  }

  toJSON(): object;
  toJSON<const H extends ToJsonHint<Book>>(hint: H): Promise<JsonPayload<Book, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }
}
