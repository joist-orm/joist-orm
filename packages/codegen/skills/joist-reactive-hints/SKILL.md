---
name: joist-reactive-hint
description: Explains the load cost of Joist reactive hints — specifically how followReverseHint walks reverse paths and when a reactive rule/field on a child entity reverse-loads its parent's ENTIRE children collection. Use when reasoning about the performance of a reactive rule/field/property (addRule, hasReactiveField, hasReactiveProperty, hasReactiveReference), when a validation rule seems to load far more rows than expected, when deciding whether to put a field in a reactive hint vs load it on-demand, or when a hot-path mutation (e.g. a bulk job) triggers surprise N×M loads. Keywords: reactive hint, reverse reactivity, followReverseHint, reverseSubHint, m2o vs o2m reactivity, over-invalidation, "reacting to a parent field reloads all siblings".
---

# Joist reactive-hint load cost (`followReverseHint`)

## TL;DR

A reactive rule/field is declared on a **root entity** with a hint. When any field in that hint
changes, Joist must find the root entities to re-run — it does this by **walking the hint in
reverse** (`followReverseHint` in `joist-core/build/reactiveHints.js`). The reverse walk **loads
the relations it traverses**. The trap:

> A reactive rule/field rooted on the **"many" side** (e.g. a `...Version`) that depends on a
> field of its **m2o parent** (e.g. `identity.draftVersion`) will, **every time that parent field
> changes, reverse-load the parent's ENTIRE children collection** (`identity.versions`) and
> re-validate all of them. That's `O(children)` load per parent-field change — and if the parent
> field changes once per child in a bulk job, the whole job is `O(children × siblings)`.

This is easy to introduce accidentally and does **not** show up in tests (behavior is correct; only
throughput/memory suffer). It bites bulk/hot-path jobs at scale.

## Why: how the reverse path is built and walked

Two functions in `joist-core/build/reactiveHints.js`:

- **`reverseSubHint`** builds the reverse path by reversing each *traversed relation*:
  - Traverse an **m2o** (`child.parent`, e.g. `Version.identity`) → reverse is the **o2m**
    (`parent.children`, e.g. `Identity.versions`). The reverse path segment is that collection.
  - A **leaf field** in the hint (primitive / enum / **m2o read as a value**, e.g.
    `["activeVersion", "draftVersion"]`) is pushed as a "react to this field changing" trigger — it
    is **not** traversed into; the reverse path back to the root is still via the o2m above.
- **`followReverseHint`** starts at the changed entity and walks each reverse segment with
  `relation.load()`. For an **o2m/collection** step that means **loading the whole collection**.

So a hint like `{ identity: ["draftVersion"] }` on a `Version` compiles to a reactive target
`{ entity: Identity, fields: ["draftVersion"], path: ["versions"] }`: "when `Identity.draftVersion`
changes, load `Identity.versions` and re-validate each." Every sibling version is re-checked, even
though only the old/new target of the FK could possibly change outcome (Joist over-invalidates for
correctness).

## The old/new-value shortcut — and when it does NOT apply

`followReverseHint` has a reference-history optimization (`getInstanceData(c).getReferenceHistory`)
that pulls in **old + new** values — but only when the **step being walked is itself an m2o/poly**
(the "`Book.author` moved to a new `Author`" reparent case). It exists so a reparent re-validates
both the old and new parent.

It does **not** turn a child→`parent.field` reaction into a cheap old/new lookup: there, the walked
step is the `versions` **o2m**, so Joist takes the `relation.load()` (full-collection) branch. The
`draftVersion` field's own m2o-ness is irrelevant — it's reacted to *as a field*, not *traversed*.

Rule of thumb for the cost of one changed field:
- reverse step is an **o2m/o2o** (you're on the child, parent-field changed) → **loads the full
  sibling collection**.
- reverse step is an **m2o/poly** being reparented → loads a couple entities (current + history).

## How to spot / avoid it

- **Root the rule where the frequently-changing field lives.** A rule on `Version` reacting to
  `identity.draftVersion` reloads all siblings; the same check rooted on `Identity` reacting to its
  own `["draftVersion"]` needs no reverse collection-load (but then detecting anything about the
  *children* forces you to scan them anyway — so this only helps if the check is about the parent).
- **Only react to fields that change rarely.** Put a field in the reactive hint only if you truly
  need to re-run when it changes. If you just need to *read* a value, `await rel.load()` it on
  demand inside the rule and leave it out of the hint. Reserve the hint for the rare-change trigger
  that actually needs to fire the rule.
- **Watch bulk/hot-path mutations.** If a job sets some `parent.fk` once per child (e.g.
  `pushToDraft` setting `identity.draftVersion`), any child-rooted rule reacting to that fk reloads
  every child's siblings — the same `O(children × siblings)` you'd get from an explicit
  `parent.children.load()` in the loop.

## Worked example (the one that motivated this skill)

Invariant wanted: "an open (`final=null`) aggregate member version must be its identity's
`activeVersion` or `draftVersion`."

```ts
// ❌ Simple but O(children × versions) on the copy-job hot path:
// pushToDraft sets identity.draftVersion per child -> reverse-loads identity.versions each time.
versionConfig.addRule({ final: {}, identity: ["activeVersion", "draftVersion"] }, (v) => { ... });

// ✅ React only to activeVersion (which changes rarely — on publish, not per draft edit);
// read draftVersion on-demand so it's not a reactive dependency.
versionConfig.addRule({ final: {}, identity: ["activeVersion"] }, async (v) => {
  if (v.final.isSet) return;
  const identity = v.identity.get;
  const active = identity.activeVersion.get;
  const draft = await identity.draftVersion.load(); // read, don't react
  if (v !== active && v !== draft) return `${v} is open but neither active nor draft`;
});
