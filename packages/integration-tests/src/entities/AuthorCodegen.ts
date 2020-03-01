import {
  Flavor,
  ValueFilter,
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
} from "joist-orm";
import { authorMeta, Publisher, Book, PublisherId, Author, bookMeta } from "./entities";

export type AuthorId = Flavor<string, "Author">;

export interface AuthorOpts {
  firstName: string;
  lastName?: string | null;
  isPopular?: boolean | null;
  age?: number | null;
  publisher?: Publisher | null;
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
  publisher?: EntityFilter<Publisher, PublisherId, FilterOf<Publisher>, null | undefined>;
}

export class AuthorCodegen {
  readonly __orm: EntityOrmField;
  readonly __filterType: AuthorFilter = null!;
  readonly __optsType: AuthorOpts = null!;

  readonly books: Collection<Author, Book> = new OneToManyCollection(
    this as any,
    bookMeta,
    "books",
    "author",
    "author_id",
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
    this.ensureNotDeleted();
    this.__orm.em.setField(this, "firstName", firstName);
  }

  get lastName(): string | undefined {
    return this.__orm.data["lastName"];
  }

  set lastName(lastName: string | undefined) {
    this.ensureNotDeleted();
    this.__orm.em.setField(this, "lastName", lastName);
  }

  get isPopular(): boolean | undefined {
    return this.__orm.data["isPopular"];
  }

  set isPopular(isPopular: boolean | undefined) {
    this.ensureNotDeleted();
    this.__orm.em.setField(this, "isPopular", isPopular);
  }

  get age(): number | undefined {
    return this.__orm.data["age"];
  }

  set age(age: number | undefined) {
    this.ensureNotDeleted();
    this.__orm.em.setField(this, "age", age);
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

  private ensureNotDeleted() {
    if (this.__orm.deleted) {
      throw new Error(this.toString() + " is marked as deleted");
    }
  }
}
