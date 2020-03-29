import {
  Flavor,
  ValueFilter,
  OrderBy,
  EntityOrmField,
  EntityManager,
  setOpts,
  fail,
  EntityFilter,
  FilterOf,
  Collection,
  OneToManyCollection,
  Reference,
  ManyToOneReference,
  setField,
} from "joist-orm";
import { authorMeta, Author, Publisher, Book, PublisherId, PublisherOrder, bookMeta } from "./entities";

export type AuthorId = Flavor<string, "Author">;

export interface AuthorOpts {
  firstName: string;
  lastName?: string | null;
  isPopular?: boolean | null;
  age?: number | null;
  mentor?: Author | null;
  publisher?: Publisher | null;
  authors?: Author[];
  books?: Book[];
}

export interface AuthorFilter {
  id?: ValueFilter<AuthorId, never>;
  firstName?: ValueFilter<string, never>;
  lastName?: ValueFilter<string, null | undefined>;
  isPopular?: ValueFilter<boolean, null | undefined>;
  age?: ValueFilter<number, null | undefined>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  mentor?: EntityFilter<Author, AuthorId, FilterOf<Author>, null | undefined>;
  publisher?: EntityFilter<Publisher, PublisherId, FilterOf<Publisher>, null | undefined>;
}

export interface AuthorOrder {
  id?: OrderBy;
  firstName?: OrderBy;
  lastName?: OrderBy;
  isPopular?: OrderBy;
  age?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  mentor?: AuthorOrder;
  publisher?: PublisherOrder;
}

export class AuthorCodegen {
  readonly __orm: EntityOrmField;
  readonly __filterType: AuthorFilter = null!;
  readonly __orderType: AuthorOrder = null!;
  readonly __optsType: AuthorOpts = null!;

  readonly authors: Collection<Author, Author> = new OneToManyCollection(
    this as any,
    authorMeta,
    "authors",
    "mentor",
    "mentor_id",
  );

  readonly books: Collection<Author, Book> = new OneToManyCollection(
    this as any,
    bookMeta,
    "books",
    "author",
    "author_id",
  );

  readonly mentor: Reference<Author, Author, undefined> = new ManyToOneReference<Author, Author, undefined>(
    this as any,
    Author,
    "mentor",
    "authors",
    false,
  );

  readonly publisher: Reference<Author, Publisher, undefined> = new ManyToOneReference<Author, Publisher, undefined>(
    this as any,
    Publisher,
    "publisher",
    "authors",
    false,
  );

  constructor(em: EntityManager, opts: AuthorOpts) {
    this.__orm = { em, metadata: authorMeta, data: {}, originalData: {} };
    em.register(this);
    setOpts(this, opts);
  }

  get id(): AuthorId | undefined {
    return this.__orm.data["id"];
  }

  get idOrFail(): AuthorId {
    return this.__orm.data["id"] || fail("Entity has no id yet");
  }

  get firstName(): string {
    return this.__orm.data["firstName"];
  }

  set firstName(firstName: string) {
    setField(this, "firstName", firstName);
  }

  get lastName(): string | undefined {
    return this.__orm.data["lastName"];
  }

  set lastName(lastName: string | undefined) {
    setField(this, "lastName", lastName);
  }

  get isPopular(): boolean | undefined {
    return this.__orm.data["isPopular"];
  }

  set isPopular(isPopular: boolean | undefined) {
    setField(this, "isPopular", isPopular);
  }

  get age(): number | undefined {
    return this.__orm.data["age"];
  }

  set age(age: number | undefined) {
    setField(this, "age", age);
  }

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }

  toString(): string {
    return "Author#" + this.id;
  }

  set(opts: Partial<AuthorOpts>): void {
    setOpts(this, opts, false);
  }
}
