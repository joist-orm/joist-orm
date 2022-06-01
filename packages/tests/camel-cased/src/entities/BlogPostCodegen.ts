import {
  BaseEntity,
  Changes,
  ConfigApi,
  EntityFilter,
  EntityGraphQLFilter,
  EntityOrmField,
  fail,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
  hasOne,
  isLoaded,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  ManyToOneReference,
  newChangesProxy,
  newRequiredRule,
  OptsOf,
  OrderBy,
  PartialOrNull,
  setField,
  setOpts,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import { EntityManager } from "src/entities";
import { Author, AuthorId, authorMeta, AuthorOrder, BlogPost, blogPostMeta, newBlogPost } from "./entities";

export type BlogPostId = Flavor<string, "BlogPost">;

export interface BlogPostOpts {
  title: string;
  author: Author;
}

export interface BlogPostIdsOpts {
  authorId?: AuthorId | null;
}

export interface BlogPostFilter {
  id?: ValueFilter<BlogPostId, never>;
  title?: ValueFilter<string, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  author?: EntityFilter<Author, AuthorId, FilterOf<Author>, never>;
}

export interface BlogPostGraphQLFilter {
  id?: ValueGraphQLFilter<BlogPostId>;
  title?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  author?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>>;
}

export interface BlogPostOrder {
  id?: OrderBy;
  title?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  author?: AuthorOrder;
}

export const blogPostConfig = new ConfigApi<BlogPost, Context>();

blogPostConfig.addRule(newRequiredRule("title"));
blogPostConfig.addRule(newRequiredRule("createdAt"));
blogPostConfig.addRule(newRequiredRule("updatedAt"));
blogPostConfig.addRule(newRequiredRule("author"));

export abstract class BlogPostCodegen extends BaseEntity<EntityManager> {
  static defaultValues: object = {};

  readonly __orm!: EntityOrmField & {
    filterType: BlogPostFilter;
    gqlFilterType: BlogPostGraphQLFilter;
    orderType: BlogPostOrder;
    optsType: BlogPostOpts;
    optIdsType: BlogPostIdsOpts;
    factoryOptsType: Parameters<typeof newBlogPost>[1];
  };

  readonly author: ManyToOneReference<BlogPost, Author, never> = hasOne(authorMeta, "author", "blogPosts");

  constructor(em: EntityManager, opts: BlogPostOpts) {
    super(em, blogPostMeta, BlogPostCodegen.defaultValues, opts);
    setOpts(this as any as BlogPost, opts, { calledFromConstructor: true });
  }

  get id(): BlogPostId | undefined {
    return this.idTagged;
  }

  get idOrFail(): BlogPostId {
    return this.id || fail("BlogPost has no id yet");
  }

  get idTagged(): BlogPostId | undefined {
    return this.__orm.data["id"];
  }

  get title(): string {
    return this.__orm.data["title"];
  }

  set title(title: string) {
    setField(this, "title", title);
  }

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }

  set(opts: Partial<BlogPostOpts>): void {
    setOpts(this as any as BlogPost, opts);
  }

  setPartial(opts: PartialOrNull<BlogPostOpts>): void {
    setOpts(this as any as BlogPost, opts as OptsOf<BlogPost>, { partial: true });
  }

  get changes(): Changes<BlogPost> {
    return newChangesProxy(this as any as BlogPost);
  }

  load<U, V>(fn: (lens: Lens<BlogPost>) => Lens<U, V>): Promise<V> {
    return loadLens(this as any as BlogPost, fn);
  }

  populate<H extends LoadHint<BlogPost>>(hint: H): Promise<Loaded<BlogPost, H>>;
  populate<H extends LoadHint<BlogPost>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<BlogPost, H>>;
  populate<H extends LoadHint<BlogPost>, V>(hint: H, fn: (bp: Loaded<BlogPost, H>) => V): Promise<V>;
  populate<H extends LoadHint<BlogPost>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (bp: Loaded<BlogPost, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<BlogPost>, V>(
    hintOrOpts: any,
    fn?: (bp: Loaded<BlogPost, H>) => V,
  ): Promise<Loaded<BlogPost, H> | V> {
    return this.em.populate(this as any as BlogPost, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<BlogPost>>(hint: H): this is Loaded<BlogPost, H> {
    return isLoaded(this as any as BlogPost, hint);
  }
}
