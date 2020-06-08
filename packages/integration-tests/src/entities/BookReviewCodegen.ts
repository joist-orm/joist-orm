import {
  Flavor,
  ValueFilter,
  OrderBy,
  ConfigApi,
  BaseEntity,
  EntityManager,
  setOpts,
  OptsOf,
  PartialOrNull,
  Changes,
  newChangesProxy,
  Lens,
  loadLens,
  LoadHint,
  Loaded,
  getEm,
  EntityFilter,
  FilterOf,
  newRequiredRule,
  Reference,
  ManyToOneReference,
  setField,
} from "joist-orm";
import { BookReview, bookReviewMeta, Book, BookId, BookOrder } from "./entities";

export type BookReviewId = Flavor<string, "BookReview">;

export interface BookReviewOpts {
  rating: number;
  book: Book;
}

export interface BookReviewFilter {
  id?: ValueFilter<BookReviewId, never>;
  rating?: ValueFilter<number, never>;
  isPublic?: ValueFilter<boolean, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  book?: EntityFilter<Book, BookId, FilterOf<Book>, never>;
}

export interface BookReviewOrder {
  id?: OrderBy;
  rating?: OrderBy;
  isPublic?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  book?: BookOrder;
}

export const bookReviewConfig = new ConfigApi<BookReview>();

bookReviewConfig.addRule(newRequiredRule("rating"));
bookReviewConfig.addRule(newRequiredRule("isPublic"));
bookReviewConfig.addRule(newRequiredRule("createdAt"));
bookReviewConfig.addRule(newRequiredRule("updatedAt"));
bookReviewConfig.addRule(newRequiredRule("book"));

export abstract class BookReviewCodegen extends BaseEntity {
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
    super(em, bookReviewMeta);
    this.set(opts as BookReviewOpts, { calledFromConstructor: true } as any);
  }

  get id(): BookReviewId | undefined {
    return this.__orm.data["id"];
  }

  get rating(): number {
    return this.__orm.data["rating"];
  }

  set rating(rating: number) {
    setField(this, "rating", rating);
  }

  get isPublic(): boolean {
    if (!("isPublic" in this.__orm.data)) {
      throw new Error("isPublic has not been derived yet");
    }
    return this.__orm.data["isPublic"];
  }

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }

  set(values: Partial<BookReviewOpts>, opts: { ignoreUndefined?: boolean } = {}): void {
    setOpts(this, values as OptsOf<this>, opts);
  }

  setUnsafe(values: PartialOrNull<BookReviewOpts>, opts: { ignoreUndefined?: boolean } = {}): void {
    setOpts(this, values as OptsOf<this>, { ignoreUndefined: true, ...opts });
  }

  get changes(): Changes<BookReview> {
    return newChangesProxy((this as any) as BookReview);
  }

  async load<U, V>(fn: (lens: Lens<BookReview>) => Lens<U, V>): Promise<V> {
    return loadLens((this as any) as BookReview, fn);
  }

  async populate<H extends LoadHint<BookReview>>(hint: H): Promise<Loaded<BookReview, H>> {
    return getEm(this).populate((this as any) as BookReview, hint);
  }
}
