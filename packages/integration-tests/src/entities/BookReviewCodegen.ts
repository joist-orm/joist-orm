import {
  Flavor,
  ValueFilter,
  OrderBy,
  BaseEntity,
  EntityOrmField,
  EntityManager,
  setOpts,
  fail,
  EntityFilter,
  FilterOf,
  Reference,
  ManyToOneReference,
  setField,
} from "joist-orm";
import { bookReviewMeta, Book, BookId, BookOrder, BookReview } from "./entities";

export type BookReviewId = Flavor<string, "BookReview">;

export interface BookReviewOpts {
  rating: number;
  book: Book;
}

export interface BookReviewFilter {
  id?: ValueFilter<BookReviewId, never>;
  rating?: ValueFilter<number, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  book?: EntityFilter<Book, BookId, FilterOf<Book>, never>;
}

export interface BookReviewOrder {
  id?: OrderBy;
  rating?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  book?: BookOrder;
}

export class BookReviewCodegen extends BaseEntity {
  readonly __orm: EntityOrmField;
  readonly __filterType: BookReviewFilter = null!;
  readonly __orderType: BookReviewOrder = null!;
  readonly __optsType: BookReviewOpts = null!;

  readonly book: Reference<BookReview, Book, never> = new ManyToOneReference<BookReview, Book, never>(
    this as any,
    Book,
    "book",
    "reviews",
    true,
  );

  constructor(em: EntityManager, opts: BookReviewOpts) {
    super();
    this.__orm = { em, metadata: bookReviewMeta, data: {}, originalData: {} };
    em.register(this);
    setOpts(this, opts);
  }

  get id(): BookReviewId | undefined {
    return this.__orm.data["id"];
  }

  get idOrFail(): BookReviewId {
    return this.__orm.data["id"] || fail("Entity has no id yet");
  }

  get rating(): number {
    return this.__orm.data["rating"];
  }

  set rating(rating: number) {
    setField(this, "rating", rating);
  }

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }

  toString(): string {
    return "BookReview#" + this.id;
  }

  set(opts: Partial<BookReviewOpts>): void {
    setOpts(this, opts, false);
  }
}
