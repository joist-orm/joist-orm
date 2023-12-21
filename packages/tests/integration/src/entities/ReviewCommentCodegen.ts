import {
  Changes,
  ConfigApi,
  EntityMetadata,
  EntityOrmField,
  failNoIdYet,
  Flavor,
  getField,
  isLoaded,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  OptsOf,
  OrderBy,
  PartialOrNull,
  setField,
  setOpts,
  TaggedId,
  toIdOf,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import {
  Comment,
  CommentFields,
  CommentFilter,
  CommentGraphQLFilter,
  CommentIdsOpts,
  CommentOpts,
  CommentOrder,
  Entity,
  EntityManager,
  newReviewComment,
  ReviewComment,
  reviewCommentMeta,
} from "./entities";

export type ReviewCommentId = Flavor<string, ReviewComment> & Flavor<string, "Comment">;

export interface ReviewCommentFields extends CommentFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  score: { kind: "primitive"; type: number; unique: false; nullable: never; derived: false };
}

export interface ReviewCommentOpts extends CommentOpts {
  score: number;
}

export interface ReviewCommentIdsOpts extends CommentIdsOpts {
}

export interface ReviewCommentFilter extends CommentFilter {
  score?: ValueFilter<number, never>;
}

export interface ReviewCommentGraphQLFilter extends CommentGraphQLFilter {
  score?: ValueGraphQLFilter<number>;
}

export interface ReviewCommentOrder extends CommentOrder {
  score?: OrderBy;
}

export const reviewCommentConfig = new ConfigApi<ReviewComment, Context>();

reviewCommentConfig.addRule(newRequiredRule("score"));

export abstract class ReviewCommentCodegen extends Comment implements Entity {
  static defaultValues: object = {};
  static readonly tagName = "comment";
  static readonly metadata: EntityMetadata<ReviewComment>;

  declare readonly __orm: EntityOrmField & {
    filterType: ReviewCommentFilter;
    gqlFilterType: ReviewCommentGraphQLFilter;
    orderType: ReviewCommentOrder;
    optsType: ReviewCommentOpts;
    fieldsType: ReviewCommentFields;
    optIdsType: ReviewCommentIdsOpts;
    factoryOptsType: Parameters<typeof newReviewComment>[1];
  };

  constructor(em: EntityManager, opts: ReviewCommentOpts) {
    // @ts-ignore
    super(em, reviewCommentMeta, ReviewCommentCodegen.defaultValues, opts);
    setOpts(this as any as ReviewComment, opts, { calledFromConstructor: true });
  }

  get id(): ReviewCommentId {
    return this.idMaybe || failNoIdYet("ReviewComment");
  }

  get idMaybe(): ReviewCommentId | undefined {
    return toIdOf(reviewCommentMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("ReviewComment");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get score(): number {
    return getField(this, "score");
  }

  set score(score: number) {
    setField(this, "score", score);
  }

  set(opts: Partial<ReviewCommentOpts>): void {
    setOpts(this as any as ReviewComment, opts);
  }

  setPartial(opts: PartialOrNull<ReviewCommentOpts>): void {
    setOpts(this as any as ReviewComment, opts as OptsOf<ReviewComment>, { partial: true });
  }

  get changes(): Changes<ReviewComment> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<ReviewComment>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as ReviewComment, fn, opts);
  }

  populate<H extends LoadHint<ReviewComment>>(hint: H): Promise<Loaded<ReviewComment, H>>;
  populate<H extends LoadHint<ReviewComment>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<ReviewComment, H>>;
  populate<H extends LoadHint<ReviewComment>, V>(hint: H, fn: (comment: Loaded<ReviewComment, H>) => V): Promise<V>;
  populate<H extends LoadHint<ReviewComment>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (comment: Loaded<ReviewComment, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<ReviewComment>, V>(
    hintOrOpts: any,
    fn?: (comment: Loaded<ReviewComment, H>) => V,
  ): Promise<Loaded<ReviewComment, H> | V> {
    return this.em.populate(this as any as ReviewComment, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<ReviewComment>>(hint: H): this is Loaded<ReviewComment | Comment, H> {
    return isLoaded(this as any as ReviewComment, hint);
  }
}
