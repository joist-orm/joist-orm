---
theme: default
title: Making GraphQL Fun for the Backend Too
info: |
  Joist ORM — putting the domain model on the wire
  A 10-minute lightning talk by Stephen Haberman.
author: Stephen Haberman
colorSchema: dark
transition: fade
highlighter: shiki
lineNumbers: false
mdc: true
fonts:
  sans: Inter
  mono: JetBrains Mono
  provider: google

---

<div class="flex flex-col items-center gap-8">
  <img src="/logo.svg" class="w-56" alt="Joist" />
  <div class="title-line font-bold">
    Making GraphQL <span class="text-joist">fun</span> for the backend too
  </div>
  <div class="flex flex-col items-center gap-2">
    <div class="text-2xl opacity-85">
      <span v-mark="{ at: 1, type: 'strike-through', color: '#fc8a22' }">Putting the domain model on the wire</span>
    </div>
    <div v-click="1" class="text-2xl text-joist font-semibold italic">
      Cloning Ent in TypeScript
    </div>
  </div>
  <div class="text-lg opacity-70 mt-5">
    Stephen Haberman · GraphQL Conf 2026
  </div>
</div>

<!--
Hi, I'm Stephen Haberman, an engineer at Homebound, a VC-backed construction startup,
where we don't sell SaaS, we actually build the homes; we have GC licenses in several
states, and have built a GraphQL/TypeScript monolith to power our construction platform.

We use GraphQL heavily in our stack, and really love it, which leads me to the talk
today -- Making...

..aka...aka...
-->

---
layout: default
---

# Clients love GraphQL ♥️

- **Relay** + **Apollo** set the bar for client-side DX
- GraphQL "fat shapes" subgraphs are super-easy to render
- Even REST wants to *look* like GraphQL now

<div v-click class="mt-12 text-joist text-2xl">
GraphQL's client story is amazing
</div>

<!--
No denying that frontends love GraphQL...
-->

---

# ...but the backend 😰

- **N+1** s by default
- **DataLoader** boilerplate
- **Validation** scattered across every mutation
- "Resolver spaghetti" business logic
- **Auth** 🙈

<div v-click class="mt-12 text-joist text-2xl">
Frontends drove GraphQL's peak hype, the backend DX killed it
</div>

<!--
Which is curious, what about Facebook?
-->

---
layout: two-cols-header
---

# How did Facebook do this? 🤔

- **Ent** — a rich entity/domain model in Hack
- **GraphQL** — a *wire format* for querying Ent
- Probably few resolvers, graph-based auth, graph-based traversal, etc.
- The domain model came first

<div v-click class="mt-10 text-2xl">
  <span class="text-joist font-bold">Joist</span> = entity-based ORM for TypeScript/Postgres
</div>

<!--
I haven't worked at Facebook, but my understanding is that Ent already existed.
-->

---

# Codegen & Scaffolding

<div class="grid grid-cols-3 gap-6 text-sm mt-4">

<div>

**1. `authors` table**

```sql
CREATE TABLE authors (
  id    serial primary key,
  name  varchar not null,
  bio   text
);
```

<div class="text-xs opacity-60 mt-1">
Update schema using migrations
</div>


</div>

<div>

**2. `Author` entity**

```ts
// src/entities/Author.ts
export class Author
  extends AuthorCodegen {
  // getters/setters in base class
    
  // add your own fields/logic here
}

// add custom rules and reactions
```

<div class="text-xs opacity-60 mt-1">
<code>yarn joist-codegen</code>
</div>

</div>

<div>

**3. Schema**

```graphql
# author.graphql, auto-generated
# scaffold, change as needed
type Author {
  id: ID!
  name: String!
  bio: String
  books: [Book!]!
  # Delete internal fields 
  # password
}

extend type Mutation {
  saveAuthor(input: ...): ...
}
```

<div class="text-xs opacity-60 mt-1">
Evergreen scaffolding
</div>

</div>

</div>

<div class="text-center mt-8 text-xl text-joist font-semibold">
DB &rarr; entities &rarr; GraphQL
</div>

---
layout: two-cols-header
---

# 1. Query Resolvers

<div class="text-lg -mt-1">Every field + relation, N+1 safe</div>

::left::

**Before** — a `DataLoader` per relation

```ts
const authorLoader = new DataLoader(async (ids) => {
  const rows = await db.authors
    .whereIn("id", ids);
  return ids.map(id =>
    rows.find(r => r.id === id));
});

const bookResolvers = {
  Book: {
    author:  (b) => authorLoader.load(b.authorId),
    reviews: (b) => reviewsByBookLoader.load(b.id),
    // ...repeat per relation
  },
};
```

::right::

**After** — one liner

```ts
import { Book } from "src/entities";
import { entityResolver } from "src/resolvers/utils";

export const bookResolvers: BookResolvers = {
  // Maps entity fields/relations by default
  ...entityResolver(Book),
  // Implement one-off field resolvers
};
```

---
layout: two-cols-header
---

# 2. Mutation Resolvers

<div class="text-lg -mt-1">Map inputs to entities, validation on the model</div>

::left::

**Before** — hand-wired partial updates

```ts
async function saveAuthor(_, { input }, ctx) {
  const a = input.id
    ? await ctx.em.load(Author, input.id)
    : ctx.em.create(Author, {});
  if (input.name !== undefined) a.name = input.name;
  if (input.bio  !== undefined) a.bio  = input.bio;
  // ...20 more fields
  if (input.bookIds)
    a.books.set(
      await ctx.em.loadAll(Book, input.bookIds));
  await validateAuthor(a);
  await db.insert(authors).values(a).returning();
  return a;
}
```

::right::

**After** — `saveEntity`

```ts
import { saveEntity } from "src/resolvers/utils";

export const saveAuthor = {
  async saveAuthor(_, args, { em }) {
    // Upsert and copy fields that map 1:1 automatically
    const author = await saveEntity(em, Author, args.input);
    // Run validations, reactions, and issue SQL calls
    await em.flush();  
    return { author };
  },
};
```

---
layout: two-cols-header
---

# 3. Dataloaders for Free

<div class="text-lg -mt-1">No N+1s</div>

::left::

**User code** — `Promise.all` with `.load()`

```ts
// load 100 authors
const authors = await em.loadAll(Author, ids);

// per-author book load, in parallel
const allBooks = await Promise.all(
  // Risks an N+1 of per-Author
  // SELECT * FROM books WHERE author_id = ?
  authors.map(a => a.books.load())
);

// But really 1 SQL query for all 100 authors:
// SELECT * FROM books WHERE author_id IN (...)
```

::right::

**Emergent batching** — no restructuring needed

```ts
// Some big gnarly function
async function someComplicatedLogic(authors: Author[]) {
  // ...do some stuff...
  await authors.asyncForEach(async (a) => {
    // lots of lines
    await helerMethod(a);
  });
}


// em.flush() invokes the rule for each dirty author,
// and all authors' books are still loaded in 1 SQL call
async function someHelperMethod(a: Author) {
  const books = await a.books.load();
  return books.map(b => b.title).join(", ");
}
```

---
layout: two-cols-header
---

# 4. Type-safe Relation Loading

<div class="text-lg -mt-1">"Load in a loop" is safe but ugly, instead declare the shape up-front</div>

::left::

**Before** — `Promise.all` soup

```ts
const author = await em.load(Author, id);
// compile error, books is unloaded
console.log(author.books.get);
// Forces safe await-based pattern by default
const books = await author.books.load();
// ...but boilerplately
const reviews = (await Promise.all(
  books.map(b => b.reviews.load())
)).flat();
const fourStar = reviews
  .filter(r => r.rating >= 4).length;
```

::right::

**After** — populate hint of subgraph

```ts
// Typed as `Loaded<Author, { books: "reviews" }>`
const author = await em.populate(id, {
  books: "reviews",
});

// No awaits!
const fourStar = author.books.get
  .flatMap(b => b.reviews.get)
  .filter(r => r.rating.get >= 4)
  .length;
```

---
layout: two-cols-header
---

# 5. Validation Rules

<div class="text-lg -mt-1">Invariants belong in entities, not mutations or endpoints</div>

::left::

**Before** — copy/pasted across mutations

```ts
// createAuthor mutation
if (!input.name)
  throw new UserError("name required");
if (input.name.length > 200)
  throw new UserError("too long");

// updateAuthor mutation
if (input.name?.length > 200)
  throw new UserError("too long");

// bulk import script
// (forgotten — rule drifts)
```

::right::

**After** — declared once, runs automatically

```ts
// Author.ts
// Simple field-level rule
config.addRule("name", (a) => {
  if (a.name.length > 200)
    return "name too long";
});

// Complicated cross-entity rules: re-runs when
// any of the author's books' titles change
config.addRule({ books: "title" }, (a) => {
  if (a.books.get.some(b => b.title === a.name))
    return "book title can't match author name";
});

config.addRule(cannotBeUpdated("type"));
```

---
layout: two-cols-header
---

# 6. Derived Fields

<div class="text-lg -mt-1">Let Joist track subgraph dependencies</div>

::left::

**Before** — call `recalc` from every code path

```ts
async function recalcFavorites(p: Publisher) {
  const authors = await p.authors.load();
  p.titlesOfFavoriteBooks = authors
    .map(a => a.favoriteBook?.title)
    .filter(Boolean).join(", ");
}

// call from saveAuthor, deleteBook,
// updateBook, importAuthors...
// miss one → stale.
```

::right::

**After** — `hasReactiveField`

```ts
class Publisher {
  titlesOfFavoriteBooks = hasReactiveField(
    { authors: { favoriteBook: "title" } },
    (p) => p.authors.get
      .map(a => a.favoriteBook.get?.title)
      .compact().join(", ") || undefined,
  );
}

// call em.flush() recalcs any dirtied fields
//
// when book1.title changes, Joist walks the "reverse
// path" of book -> author (favoriteBook) -> publisher
// and recalcs titlesOfFavoriteBooks.
```


---
layout: two-cols-header
---

# 7. Graph-based Auth

<div class="text-lg -mt-1">Bring your own query AST plugin</div>


::left::

**Before** — `where tenant_id = ?` on every query

```ts
// every query, everywhere
await db.authors.where("tenant_id", tenantId);
await db.books.where("tenant_id", tenantId);
await db.reviews.where("tenant_id", tenantId);

// every find, every join, every report...
// miss one => cross-tenant data leak.
```

::right::

**After** — one plugin, applied to the `em`

```ts
class TenantPlugin extends Plugin {
  constructor(private tenantId: string) { super(); }

  beforeFind(meta, query): void {
    for (const table of query.tables) {
      if (meta.fields.tenant) {
        query.conditions.push({
          alias: table.alias,
          column: "tenant_id",
          cond: { kind: "eq", value: this.tenantId },
        });
  } } }
}

// in your request handler
em.addPlugin(new TenantPlugin(tenantId));
```

<div class="text-xs opacity-60 mt-1">
Implementing <code>RbacPlugin</code> is an exercise for the reader
</div>

---
layout: center
class: text-center
---

# Joist

<div class="mt-6 text-lg text-left inline-block">

- *Framework for Majestic Monoliths*
- *Robust domain models*
- *Entities on the (GraphQL) wire*

</div>

<div class="mt-14 grid grid-cols-3 gap-6">
  <div>
    <div class="text-joist font-bold">Docs</div>
    <div class="opacity-85">joist-orm.io</div>
  </div>
  <div>
    <div class="text-joist font-bold">GitHub</div>
    <div class="opacity-85">joist-orm/joist-orm</div>
  </div>
  <div>
    <div class="text-joist font-bold">Discord</div>
    <div class="opacity-85">joist-orm.io/discord</div>
  </div>
</div>

<div class="mt-14 text-joist text-3xl">
Thanks!
</div>

<div class="mt-2 text-lg opacity-75">
Stephen Haberman
</div>

<!-- Because of the robust domain models, we can put entities on the wire ... and it's fun. -->
