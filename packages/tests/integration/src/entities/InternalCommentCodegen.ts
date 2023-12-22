import {
  Changes,
  cleanStringValue,
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
  InternalComment,
  internalCommentMeta,
  newInternalComment,
} from "./entities";

export type InternalCommentId = Flavor<string, InternalComment> & Flavor<string, "Comment">;

export interface InternalCommentFields extends CommentFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  textInternal: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
}

export interface InternalCommentOpts extends CommentOpts {
  textInternal?: string | null;
}

export interface InternalCommentIdsOpts extends CommentIdsOpts {
}

export interface InternalCommentFilter extends CommentFilter {
  textInternal?: ValueFilter<string, null>;
}

export interface InternalCommentGraphQLFilter extends CommentGraphQLFilter {
  textInternal?: ValueGraphQLFilter<string>;
}

export interface InternalCommentOrder extends CommentOrder {
  textInternal?: OrderBy;
}

export const internalCommentConfig = new ConfigApi<InternalComment, Context>();

export abstract class InternalCommentCodegen extends Comment implements Entity {
  static defaultValues: object = {};
  static readonly tagName = "comment";
  static readonly metadata: EntityMetadata<InternalComment>;

  declare readonly __orm: EntityOrmField & {
    filterType: InternalCommentFilter;
    gqlFilterType: InternalCommentGraphQLFilter;
    orderType: InternalCommentOrder;
    optsType: InternalCommentOpts;
    fieldsType: InternalCommentFields;
    optIdsType: InternalCommentIdsOpts;
    factoryOptsType: Parameters<typeof newInternalComment>[1];
  };

  constructor(em: EntityManager, opts: InternalCommentOpts) {
    // @ts-ignore
    super(em, internalCommentMeta, InternalCommentCodegen.defaultValues, opts);
    setOpts(this as any as InternalComment, opts, { calledFromConstructor: true });
  }

  get id(): InternalCommentId {
    return this.idMaybe || failNoIdYet("InternalComment");
  }

  get idMaybe(): InternalCommentId | undefined {
    return toIdOf(internalCommentMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("InternalComment");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get textInternal(): string | undefined {
    return getField(this, "textInternal");
  }

  set textInternal(textInternal: string | undefined) {
    setField(this, "textInternal", cleanStringValue(textInternal));
  }

  set(opts: Partial<InternalCommentOpts>): void {
    setOpts(this as any as InternalComment, opts);
  }

  setPartial(opts: PartialOrNull<InternalCommentOpts>): void {
    setOpts(this as any as InternalComment, opts as OptsOf<InternalComment>, { partial: true });
  }

  get changes(): Changes<InternalComment> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<InternalComment>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as InternalComment, fn, opts);
  }

  populate<H extends LoadHint<InternalComment>>(hint: H): Promise<Loaded<InternalComment, H>>;
  populate<H extends LoadHint<InternalComment>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<InternalComment, H>>;
  populate<H extends LoadHint<InternalComment>, V>(hint: H, fn: (comment: Loaded<InternalComment, H>) => V): Promise<V>;
  populate<H extends LoadHint<InternalComment>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (comment: Loaded<InternalComment, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<InternalComment>, V>(
    hintOrOpts: any,
    fn?: (comment: Loaded<InternalComment, H>) => V,
  ): Promise<Loaded<InternalComment, H> | V> {
    return this.em.populate(this as any as InternalComment, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<InternalComment>>(hint: H): this is Loaded<InternalComment | Comment, H> {
    return isLoaded(this as any as InternalComment, hint);
  }
}
