---
name: entity-docs
description: Read and write the `src/entities/<Entity>.md` business-docs that sit next to each Joist entity. Use when working on ANY entity in `src/entities/` (its `.ts`, resolvers, jobs, or tests) — read the sibling `.md` first for the business rationale, worked scenarios, and gotchas the code can't show, and record any non-obvious domain knowledge you learn back into it. Also covers the codegen doc-sync: how `## Overview` and `## Fields`/`### fieldName` sections become entity JSDocs via `yarn joist-codegen`, and what belongs in field docs vs. free-form narrative.
---

# Entity docs (`src/entities/<Entity>.md`)

Many Joist entities have a sibling Markdown doc — `src/entities/Author.ts` ↔
`src/entities/Author.md` (same basename; enums under `src/entities/enums/` too). These files hold the
**"why"** that code can't: business rationale, worked scenarios, gotchas, domain vocabulary, and
cross-entity workflows. They are written for **both humans and agents** — you are a primary audience.

Two jobs, and you should do both as a matter of course:

1. **Read** the sibling `.md` before/while you work on an entity, to get domain context.
2. **Write** back to it whenever you learn something useful, weird, or non-obvious.

## 1. Read it first

Before editing an entity — its `src/entities/<Entity>.ts`, its resolvers, a job that touches it, or its
tests — open `src/entities/<Entity>.md` if one exists. It routinely explains things you would otherwise
have to reverse-engineer or would get subtly wrong:

- **Business rationale** — *why* a field/entity exists and what real-world thing it models
  (e.g. `PurchaseOrder.md` on tracking "what and why" a project's cost changed).
- **Worked scenarios** — concrete `I.e.` walkthroughs with real values ("when an `Employee` is termined, the status workflow is...").
- **Gotchas & edge cases** — footguns, "this looks stale but isn't", exemptions
- **Domain vocabulary** — statuses, flags, and other "esoteric unless you know it" domain concepts

Follow the cross-links (`[Book](Book.md)`, sometimes with anchors like
`Book.md#Definitions`) into related docs. If the doc is missing or thin, that's your cue to add
to it once you've figured things out (job #2).

## 2. How the file maps to code (the codegen doc-sync)

`joist-config.json` has `"docs": true`, so `yarn joist-codegen` keeps these `.md` files and the entity
JSDocs in sync. Understanding this is what makes your writing land in the right place.

**Only two heading shapes are parsed and synced; everything else is free-form narrative:**

| `.md` section | Syncs to | Notes |
|---|---|---|
| `## Overview` (body) | the entity **class** JSDoc | exact heading `## Overview` |
| `## Fields` → `### <fieldName>` (body) | that field/property/relation's JSDoc | `### ` heading must be the **exact member name** |
| any other `## Section` (e.g. `## Hard vs. Soft Costs`, `## DB Constraints`, mermaid) | **nothing** | free-form; lives only in the `.md`, preserved verbatim |

Synced JSDocs are tagged `@generated <Entity>.md` in the `.ts` — that tag means "this comment came from
the `.md`; edit the `.md`, not here."

**Sync is bidirectional, but the `.md` wins.** `yarn joist-codegen`:

1. **Backfills** the `.md` from any hand-written `.ts` JSDoc that isn't in the `.md` yet (so a jsdoc you
   write directly on a field gets pulled into `## Fields` for you), then
2. **Writes the `.md` back into the `.ts`** JSDocs — so for anything already in the `.md`, the `.md` is
   the source of truth and will overwrite a divergent `.ts` comment.

Net rule: **to durably document an entity or field, edit the `.md`.** Hand-editing a `@generated` JSDoc
in the `.ts` gets stomped on the next codegen.

### Field-heading constraints (easy to get wrong)

- `### <fieldName>` must be a **single word** — the parser matches `\w+` only. `### excludeFromBudget`
  works; `### is excluded`, `` ### `excludeFromBudget` ``, or `### excludeFromBudget (derived)` are **not**
  recognized as field docs.
- It must be the **exact** name of a field, relation, or property on the entity, and must sit **under the
  `## Fields` heading**. Any other `##` heading ends the fields section — so keep all `### fieldName`
  entries together under the one `## Fields` section (conventionally at the bottom of the file).
- **Methods don't sync** — only fields/getters/properties/relations get their JSDoc updated.

## 3. Write back what you learn

When you discover something useful/weird/non-obvious while working — record it. This is the point of the
files. Good triggers to write:

- You just figured out **why** an entity or field exists, or what it really models.
- A **non-obvious business rule**, invariant, or "this only applies to X clients" exemption.
- A **gotcha / footgun** — a value that looks stale but isn't, an ordering requirement, a special-cased
  type.
- A **cross-entity interaction** or workflow that isn't visible from one file.
- **Domain vocabulary** a newcomer (human or agent) wouldn't know.
- A **worked scenario** that makes an abstract entity concrete.

**Don't** document what the code already says plainly (restating a type, signature, or an obvious
one-liner), or transient implementation detail that will rot.

**Where to put it:**

- Something specific to one field → a `### <fieldName>` block under `## Fields`. It syncs to that
  member's JSDoc, so it shows on hover/`@generated` in the `.ts`.
- Broad rationale, scenarios, diagrams, cross-entity workflows, DB constraints, glossary → a free-form
  `##` section (`## Overview` for the headline, or a custom section like `## Employee Onboarding Flow`).

**Style** (match the existing docs):

- Lead with business meaning and *why*, not mechanics.
- Use `I.e. ...` worked examples with concrete values.
- Cross-link related entities with relative links: `[Book](Book.md)`.
- Reference field/entity names in backticks.

## 4. Workflow to add or update a doc

1. Edit `src/entities/<Entity>.md` (create it if missing — basename must equal the entity, e.g.
   `Author.md`). For field docs, use the exact member name as a `### ` heading under `## Fields`.
2. Sync into the JSDocs:
   ```bash
   mise exec -- yarn joist-codegen
   ```
   (or `mise exec -- yarn codegen` to also run graphql-codegen.)
3. Verify the `@generated <Entity>.md` JSDoc now appears on the class / field in `src/entities/<Entity>.ts`.
4. Commit the `.md` **and** the regenerated `.ts` JSDoc changes together.

Never hand-edit a `@generated <Entity>.md` JSDoc in the `.ts` — edit the `.md` and re-run codegen. Do not
touch files under `src/entities/codegen/` (see the repo's generated-files rules).

## Skeleton for a new doc

```markdown
# <Entity>

## Overview

<What this entity models and *why* it exists, in business terms. One short paragraph.>

## <Some Business Concept>   <!-- free-form: rationale, scenarios, gotchas, diagrams; NOT synced -->

<Prose, `I.e.` examples, mermaid, cross-links to [OtherEntity](OtherEntity.md).>

## Fields   <!-- each ### below syncs into that member's JSDoc -->

### someField

<Why it exists / the non-obvious rule or gotcha. Exact field name, single word.>
```
