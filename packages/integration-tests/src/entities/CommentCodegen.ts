import {
  BaseEntity,
  Changes,
  ConfigApi,
  Entity,
  EntityConstructor,
  EntityFilter,
  EntityGraphQLFilter,
  EntityManager,
  Flavor,
  getEm,
  IdOf,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  OptsOf,
  OrderBy,
  OrmApi,
  PartialOrNull,
  setField,
  setOpts,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import { Book, BookReview, Comment, commentMeta, newComment } from "./entities";

export type CommentId = Flavor<string, "Comment">;

export type CommentParent = Book | BookReview;
export function getCommentParentConstructors(): EntityConstructor<CommentParent>[] {
  return [Book, BookReview];
}
export function isCommentParent(maybeEntity: Entity | undefined | null): maybeEntity is CommentParent {
  return (
    maybeEntity !== undefined &&
    maybeEntity !== null &&
    getCommentParentConstructors().some((type) => maybeEntity instanceof type)
  );
}

export interface CommentOpts {
  text?: string | null;
  parent: CommentParent;
}

export interface CommentIdsOpts {
  parentId?: IdOf<CommentParent> | null;
}

export interface CommentFilter {
  id?: ValueFilter<CommentId, never>;
  text?: ValueFilter<string, null | undefined>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  parent?: EntityFilter<CommentParent, IdOf<CommentParent>, never, null | undefined>;
}

export interface CommentGraphQLFilter {
  id?: ValueGraphQLFilter<CommentId>;
  text?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  parent?: EntityGraphQLFilter<CommentParent, IdOf<CommentParent>, never>;
}

export interface CommentOrder {
  id?: OrderBy;
  text?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
}

export const commentConfig = new ConfigApi<Comment, Context>();

commentConfig.addRule(newRequiredRule("createdAt"));
commentConfig.addRule(newRequiredRule("updatedAt"));
commentConfig.addRule(newRequiredRule("parent"));

export abstract class CommentCodegen extends BaseEntity {
  readonly __types: {
    filterType: CommentFilter;
    gqlFilterType: CommentGraphQLFilter;
    orderType: CommentOrder;
    optsType: CommentOpts;
    optIdsType: CommentIdsOpts;
    factoryOptsType: Parameters<typeof newComment>[1];
  } = null!;
  protected readonly orm = new OrmApi(this as any as Comment);

  readonly parent = this.orm.hasOnePolymorphic("parent", true);

  constructor(em: EntityManager, opts: CommentOpts) {
    super(em, commentMeta, {}, opts);
    setOpts(this as any as Comment, opts, { calledFromConstructor: true });
  }

  get id(): CommentId | undefined {
    return this.__orm.data["id"];
  }

  get text(): string | undefined {
    return this.__orm.data["text"];
  }

  set text(text: string | undefined) {
    setField(this, "text", text);
  }

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }

  set(opts: Partial<CommentOpts>): void {
    setOpts(this as any as Comment, opts);
  }

  setPartial(opts: PartialOrNull<CommentOpts>): void {
    setOpts(this as any as Comment, opts as OptsOf<Comment>, { partial: true });
  }

  get changes(): Changes<Comment> {
    return newChangesProxy(this as any as Comment);
  }

  async load<U, V>(fn: (lens: Lens<Comment>) => Lens<U, V>): Promise<V> {
    return loadLens(this as any as Comment, fn);
  }

  async populate<H extends LoadHint<Comment>>(hint: H): Promise<Loaded<Comment, H>> {
    return getEm(this).populate(this as any as Comment, hint);
  }
}
