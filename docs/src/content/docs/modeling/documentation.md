---
title: Documentation
description: Documentation for your domain model
sidebar:
  order: 10
---

Joist can keep your domain model's documentation in dedicated Markdown (`.md`) files that live right next to your entities, i.e.:

* `src/entities/Author.ts`
* `src/entities/Author.md`
* `src/entities/Book.ts`
* `src/entities/Book.md`

This lets you write high-quality docs in readable, easy-to-edit Markdown, to define core business terminology & concepts (i.e. "purchase orders are ...", "_cancelled_ purchase orders are ...") that cover the "what" and "why" rationale of the domain model.

The vision is that these docs become the authoritative knowledge base for your domain model, where engineers, agents/LLMs, Product Managers, and even your system's power-users can all reference the domain's documentation without knowing TypeScript or the technical intricacies of your codebase.

## Two Way Syncing

For engineers, a key feature is that Joist injects the `*.md` docs into the `*.ts` files as JSDocs, so hovering over a field or relation in your IDE shows its documentation. I.e. given:

```markdown
## Fields

### firstName

The first name is important.
```

`joist-codegen` injects the doc onto the `firstName` getter in the generated `AuthorCodegen.ts`, tagged with `@generated Author.md` so it's clear the JSDoc is managed by (and should be edited in) the `.md` file:

```ts
export abstract class AuthorCodegen {
  /**
   * The first name is important.
   * @generated Author.md
   */
  get firstName(): string {
    return getField(this, "firstName");
  }
}
```

Schema-derived members (primitives, enums, and relations) live in the generated `*Codegen.ts` file, so their docs are injected there.

For your own hand-written members (i.e. [derived properties](./derived-properties) or async properties you've defined in `Author.ts`), Joist injects the doc into `Author.ts` instead, with the same `@generated Author.md` tag:

```ts
export class Author extends AuthorCodegen {
  /**
   * The author's first and last name combined.
   * @generated Author.md
   */
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}
```

This happens on every `joist-codegen` run, so the `*.md` files stay the source-of-truth, while still being available as JSDocs within your IDE.

The sync is "two-way" because if an engineer initially writes docs as a JSDoc first (which can be very natural, while in the flow), `joist-codegen` will recognize this case, automatically migrate the JSDoc into the `*.md` file, and then re-inject it with the `@generated Author.md` tag.

## Enabling

Docs syncing is opt-in via two `joist-config.json` knobs (see [Configuration](/getting-started/configuration/)):

```json
{
  "docs": true,
  "outputDocs": true
}
```

* `docs` enables syncing `Entity.md` docs into the generated `EntityCodegen.ts` JSDocs (and into any hand-written members in `Entity.ts`).
* `outputDocs` emits a `./codegen/metadata-docs.ts` file so the docs are available at runtime.

The two knobs are independent: you can turn on `docs` for the `.md` ↔ JSDoc syncing without `outputDocs`, or vice versa.

## Markdown Format

Each entity's docs live in an `Entity.md` file next to its `Entity.ts` file (i.e. `Author.md` next to `Author.ts`). Joist only looks at two specific sections:

```md
## Overview

The Author entity represents a writer who can publish books.

Authors can have mentors (other authors) forming a recursive tree.

## Fields

### numberOfBooks

The number of books this author has written.

### fullName

The author's first and last name combined.
```

* The `## Overview` section becomes the entity class's JSDoc.
* Each `### fieldName` subsection under `## Fields` becomes that field's (or relation's / async property's) JSDoc.

Any other sections (e.g. a `## Business Rules` table or a `## Notes` section with code blocks) are ignored by Joist and left untouched, so you're free to add whatever extra prose you like to the `.md` file.

## Runtime Access

With `outputDocs` enabled, codegen also writes a `./codegen/metadata-docs.ts` file that exposes the docs as a plain `const`:

```ts
export const docs = {
  Author: {
    comment: "The Author entity represents a writer who can publish books.",
    fields: {
      numberOfBooks: "The number of books this author has written.",
    },
    operations: undefined,
  },
  // ...one entry per entity...
} as const;

export type EntityDocs = typeof docs;
```

This makes your entity/field documentation available at runtime, so you can wire it into GraphQL SDL descriptions, admin UI tooltips, or any other tooling that wants to describe your domain model.

## Documentation Skill

Joist also ships with a `joist-docs` skill so that agents can both:

* Read `md` files while working on their tasks, to gain context about the domain model, and
* Write back to the `md` files when they learn new information about the domain model.

See [Agent Skills](/advanced/agent-skills/) for more details.
