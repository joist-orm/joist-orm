
/** Default view of a collection that requires a promise. */
interface ManyToOneCollection<T> {
  load(): Promise<T[]>
}

/** A populated view of a collection, only available by explicitly calling `populate`. */
interface PopulatedManyToOneCollection<T> extends ManyToOneCollection<T> {
  get: T[];
  [Symbol.iterator](): IterableIterator<T>;
}

/**
 * Given a property P, i.e. a ManyToOneCollection, mark it as the populated version.
 *
 * `H` is any nested hints to recursively apply.
 * */
type MarkLoaded<P, H = {}> = P extends ManyToOneCollection<infer U> ? PopulatedManyToOneCollection<Loaded<U, H>> : never;

/** Given an entity `T` that is being populated with `LK`, marks the `LK` attributes as populated. */
type Loaded<T, H> = {
  [K in keyof T]:
    H extends NestedHint<T> ? (K extends keyof H ? MarkLoaded<T[K], H[K]> : T[K]) :
    //
    H extends Array<infer U> ? (K extends U ? MarkLoaded<T[K]> : T[K]) :
    //
    K extends H ? MarkLoaded<T[K]> :
    //
    T[K]
};

// We accept load hints as a string, or a string[], or a hash of { key: nested };
type LoadHint<T> = keyof T | Array<keyof T> | NestedHint<T>;

type NestedHint<T> = {
  [K in keyof T]?: T[K] extends ManyToOneCollection<infer U> ? LoadHint<U> : never;
};

function populate<T, H extends LoadHint<T>>(entity: T, key: H): Loaded<T, H> {
  return undefined as any;
}

async function somethingAuthor(author: Author): Promise<void> {
  (await author.posts.load()).length;
  const author2 = await populate(author, 'posts');
  author2.posts.get.length;
}

async function somethingAuthor2(author: Author): Promise<void> {
  const author2 = await populate(author, ['posts', 'comments']);
  author2.posts.get.length;
  author2.comments.get.length;
}

async function somethingAuthor3(author: Author): Promise<void> {
  const author3 = await populate(author, { posts: { comments: 'votes' } } as const);
  author3.posts.get[0].comments.get.length;
  for (const post of author3.posts) {
    for (const comment of post.comments) {
    }
  }
}

interface Author {
  firstName: string;
  lastName: string;
  posts: ManyToOneCollection<Post>
  comments: ManyToOneCollection<Comment>;
}

interface Comment {
  body: string;
  votes: ManyToOneCollection<Vote>;
}

interface Vote {
  count: number
}

interface Post {
  title: string;
  author: string;
  comments: ManyToOneCollection<Comment>;
}

// Author.posts
// Author.comments
// Post.author

type Narrowable = string | number | boolean | symbol | object | undefined | void | null | {};


// Repro of why `as const` is needed
type P<T> = {
  [K in keyof T]? : T[K] extends ManyToOneCollection<infer U> ? keyof U : never;
}
const p = { posts: "comments" };
type PA = P<Author>;
type Z = typeof p extends PA ? number : string;
