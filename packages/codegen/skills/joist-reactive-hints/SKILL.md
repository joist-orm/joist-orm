---
name: joist-reactive-hint
description: Explains how Joist reactive hints work and what they cost to run — a hint is both a reverse-reactivity trigger (which roots re-run when a hinted field changes) and a forward load hint (what gets populated before the lambda runs), so a rule can pull an entire child collection into memory even when its lambda only reads a parent field. Covers followReverseHint, the two rule shapes (child-rooted reacting up to a parent vs parent-rooted reacting down into a child collection), and how to avoid surprise O(children) loads. Use when reasoning about the performance of a reactive rule/field/property (addRule, hasReactiveField, hasReactiveProperty, hasReactiveReference), when a validation rule seems to load far more rows than expected, when deciding whether to put a field in a reactive hint vs load it on-demand, or when a hot-path mutation (e.g. a bulk job) triggers surprise N×M loads. Keywords: reactive hint, load hint, reverse reactivity, followReverseHint, reverseSubHint, m2o vs o2m reactivity, over-invalidation, populate, "a parent rule that hints a child collection loads the whole collection".
---

# Joist reactive hints

Reactive hints declare the fields a rule, `ReactiveField`, `ReactiveProperty`, or `ReactiveReference`
depends on. A hint does **double duty**: Joist walks it in **reverse** to find *which* roots to re-run
when a hinted field changes, then uses it **forward as a load hint** to populate that data on each root
before the lambda runs. Most hints are cheap — but either direction can pull an entire child collection
into memory, and the *forward* load is the surprising one, so both are the focus below.

## TL;DR

A reactive rule/field is declared on a **root entity** with a hint. There are two shapes, and they
cost very differently.

**Shape #1 — rule on the child, hint reaches *up* to the parent** (e.g. a rule on `Book` with
`{ author: ["currentDraftBook"] }`). When `Author.currentDraftBook` changes, Joist walks the hint in
reverse (`followReverseHint`), reversing the `Book.author` m2o into the `Author.books` o2m and
**loading the whole collection** to enumerate the child roots, then re-runs each book's rule.
`O(children)` per parent-field change. This is **intuitive**: "change the author, and all of its books
re-check."

**Shape #2 — rule on the parent, hint reaches *down* into a child collection** (e.g. a rule on `Author`
with `{ books: ["title"] }`). When a single `Book.title` changes, the reverse walk is **cheap** — one
`book.author` m2o hop to the one author. But the reactive hint is **also a load hint**: before running
the author's lambda, Joist populates `author.books`, pulling the **entire** collection into memory —
*even if the lambda only reads `author.status` and never touches the books*.

> The surprising one is **Shape #2**. `{ books: ["title"] }` reads like "react to book titles," but it
> *also* means "load all of this author's books every time this rule fires." A lambda whose body is just
> `return a.status === "active" ? undefined : "…"` still pays to load `author.books`, because the
> **hint, not the lambda body, decides what gets loaded**.

Neither shows up in tests (behavior is correct; only throughput/memory suffer). Both bite bulk/hot-path
jobs at scale — Shape #2 especially, because it looks cheap from the reverse-reactivity side.

## Why: reverse reactivity *and* load hints

A hinted-field change triggers two steps, both in `joist-core/build/reactiveHints.js`:

**Step 1 — find the roots (reverse walk).** `followReverseHint` starts at the changed entity and walks
the hint in reverse, reversing each *traversed relation* (via `reverseSubHint`):

- Reverse of an **m2o** (`Book.author`) is the **o2m** (`Author.books`) — so a **child-rooted** rule
  reacting to a parent field loads the whole sibling collection just to list the roots (Shape #1).
- Reverse of an **o2m** (`Author.books`) is the **m2o** (`Book.author`) — so a **parent-rooted** rule
  reacting to a child field finds exactly one root per changed child (Shape #2's reverse is cheap).
- A **leaf field** (primitive / enum / m2o read as a value, e.g. `["title"]`, `["currentDraftBook"]`) is
  only a "react to this field changing" trigger; it is **not** traversed into.

**Step 2 — load the hint (forward populate).** Before running each root's lambda, Joist populates the
reactive hint *as a load hint* on that root so the lambda can read it synchronously. For a parent-rooted
rule with `{ books: [...] }`, that is effectively `author.populate("books")` — the **full collection** —
**regardless of what the lambda actually reads**. This is why Shape #2 is expensive even though its
reverse walk touched only one author: the cost is in the forward load, not the reverse walk.

So `{ author: ["currentDraftBook"] }` on `Book` compiles to a reactive target
`{ entity: Author, fields: ["currentDraftBook"], path: ["books"] }` — "when `Author.currentDraftBook`
changes, load `Author.books` and re-validate each" — while `{ books: ["title"] }` on `Author` loads
`author.books` on every fire so the rule can run at all. Either way Joist over-invalidates for
correctness: every sibling is re-checked/loaded even when only one could change the outcome.

## The old/new-value shortcut — and when it does NOT apply

`followReverseHint` has a reference-history optimization (`getInstanceData(c).getReferenceHistory`)
that pulls in **old + new** values — but only when the **step being walked is itself an m2o/poly**
(the "`Book.author` moved to a new `Author`" reparent case). It exists so a reparent re-validates
both the old and new parent.

It does **not** turn a child→`parent.field` reaction into a cheap old/new lookup: there, the walked
step is the `books` **o2m**, so Joist takes the `relation.load()` (full-collection) branch. The
`currentDraftBook` field's own m2o-ness is irrelevant — it's reacted to *as a field*, not *traversed*.

Rule of thumb for the cost of one changed field:
- reverse step is an **o2m/o2o** (you're on the child, parent-field changed) → **loads the full
  sibling collection**.
- reverse step is an **m2o/poly** being reparented → loads a couple entities (current + history).

## How to spot / avoid it

- **The hint decides the load, not the lambda body.** A parent rule with `{ books: [...] }` loads
  *every* book on *every* fire, even if the lambda only reads the parent's own fields. If the rule does
  not actually need the collection, do not hint it; if it does, know you are paying `O(children)` memory
  per fire.
- **For SQL-derived fields, split the hint with `hasAsyncReactiveField`.** It takes two hints — a
  `loadHint`, whose data is populated into memory and passed to the lambda, and a `reactiveHint`, whose
  data only *triggers* recalculation but is **not** loaded into memory (the lambda recomputes from SQL
  instead). Put the large child collections you merely need to react to in the `reactiveHint` so a
  child-field change still recomputes the value without pulling every sibling into memory.
- **Root the rule where the frequently-changing field lives.** A rule on `Book` reacting to
  `author.currentDraftBook` reloads all siblings; the same check rooted on `Author` reacting to its
  own `["currentDraftBook"]` needs no reverse collection-load (but then detecting anything about the
  *children* forces you to scan them anyway — so this only helps if the check is about the parent).
- **Only react to fields that change rarely.** Put a field in the reactive hint only if you truly
  need to re-run when it changes. If you just need to *read* a value, `await rel.load()` it on
  demand inside the rule and leave it out of the hint. Reserve the hint for the rare-change trigger
  that actually needs to fire the rule.
- **Watch bulk/hot-path mutations.** If a job sets some `parent.fk` once per child (e.g. a bulk
  copy job setting `author.currentDraftBook` per book), any child-rooted rule reacting to that fk
  reloads every child's siblings — the same `O(children × siblings)` you'd get from an explicit
  `parent.children.load()` in the loop.

## Worked examples

### Shape #2 — the surprising one: a parent rule hinting into a child collection

```ts
// ❌ Rooted on Author. The hint `{ books: ["title"] }` reads like "react to book titles" — but it is
// ALSO a load hint, so every time ANY book's title changes, Joist loads the author's ENTIRE `books`
// collection into memory to run this rule, even though the lambda only looks at the author's status.
authorConfig.addRule(["status", { books: ["title"] }], (a) => {
  return a.status === "active" ? undefined : "inactive authors need review";
});

// ✅ The rule only depends on the author's own status, so hint only that — no books are loaded.
authorConfig.addRule("status", (a) => {
  return a.status === "active" ? undefined : "inactive authors need review";
});
```

If the rule genuinely must react to a child field, keep the hint — but know each fire loads the whole
collection, so reserve it for collections the lambda actually reads and for child fields that change
rarely.

### Shape #1 — intuitive but still O(children): a child rule reacting to a parent field

Invariant wanted: "an unpublished book must be one of its author's tracked books — its `favoriteBook` or
`currentDraftBook`."

```ts
// ❌ Simple but O(books × siblings) on the bulk copy-job hot path:
// the job sets author.currentDraftBook per book -> reverse-loads author.books each time.
bookConfig.addRule(
  ["publishedAt", { author: ["favoriteBook", "currentDraftBook"] }],
  (b) => { ... },
);

// ✅ React only to favoriteBook (which changes rarely — on publish, not per draft edit);
// read currentDraftBook on-demand so it's not a reactive dependency.
bookConfig.addRule(["publishedAt", { author: ["favoriteBook"] }], async (b) => {
  if (b.publishedAt) return;
  const author = b.author.get;
  const favorite = author.favoriteBook.get;
  const draft = await author.currentDraftBook.load(); // read, don't react
  if (b !== favorite && b !== draft) return `${b} is unpublished but neither the favorite nor current draft`;
});
```
