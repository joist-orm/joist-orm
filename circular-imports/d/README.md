# circular-imports/d — ESM fix (and brainstorm)

Same classes as [`../c`](../c), with the internal-module pattern from
[`../b`](../b) ported to ESM.

## Running

```bash
npm install
npm run run-repro
```

## Expected output

```
{ name: "joist", kind: "orm", stars: 42 }
```

## Why this works in ESM

The fix carries over more or less verbatim from CJS. The *mechanism* is
different, but the result is the same.

When `index.js` imports `./internal.js`, Node builds the module graph and
then performs a DFS evaluation starting from `internal.js`'s re-exports
in source order:

```ts
// internal.ts
export * from "./AbstractNode.js";
export * from "./Node.js";
export * from "./Leaf.js";
```

1. `internal.js` evaluation begins.
2. DFS: evaluate `AbstractNode.js` first.
3. `AbstractNode.js` imports `Leaf`/`Node` from `./internal.js`, but
   `internal.js` is already on the eval stack → cycle, skip recursion.
4. `AbstractNode.js`'s body runs: `class AbstractNode {}` is declared and
   the binding is now initialized.
5. DFS continues: evaluate `Node.js`. It imports `AbstractNode` from
   `./internal.js` (cycle-skip), but the binding for `AbstractNode` is now
   out of the TDZ, so `class Node extends AbstractNode {}` succeeds.
6. Same for `Leaf.js`.
7. `internal.js` finishes; `index.js` proceeds.

Key invariant: inside the cycle, the only files that run
`class X extends Y {}` at module-top-level are the leaf files (`Node.js`,
`Leaf.js`), and they only run AFTER `internal.js` has forced
`AbstractNode.js` to fully evaluate first.

## Brainstorm: other ways to fix this in ESM

The internal-module pattern is one option, but ESM gives us more tools
than CJS did. Some alternatives, in rough order of invasiveness:

### 1. The internal-module pattern (this project)

**Pros**

- Works identically in CJS and ESM.
- Zero changes to consumer code outside the package.
- Single file controls evaluation order — easy to audit.

**Cons**

- Every sibling import becomes `from "./internal"`, which can obscure the
  real dependency graph and defeat tree-shaking at leaf package
  boundaries.
- Newcomers have to learn the convention.

### 2. Lift the factory out of the base class

Turn `AbstractNode.from(...)` into a standalone `createNode(...)` helper
in its own file. `AbstractNode.ts` no longer imports its subclasses, so
the cycle goes away entirely.

**Pros**

- No cycle at all — the cleanest fix.
- No special conventions.

**Cons**

- Public API change. Callers write `createNode(x)` instead of
  `AbstractNode.from(x)`.
- Doesn't help when the "factory on the base class" is specifically what
  you want for ergonomics.

### 3. Lazy subclass access inside the base class

Keep the `static from(...)` on `AbstractNode`, but don't import `Leaf`
and `Node` at the top of the file. Instead, use a dynamic `import()` or
a lazy indirection:

```ts
// AbstractNode.ts — no top-level imports of Leaf/Node
export abstract class AbstractNode {
  static async from(value: unknown): Promise<AbstractNode> {
    const { Leaf } = await import("./Leaf.js");
    const { Node } = await import("./Node.js");
    return typeof value === "object" && value !== null
      ? new Node(value as Record<string, unknown>)
      : new Leaf(value);
  }
}
```

**Pros**

- No cycle at graph-construction time; ESM evaluates `AbstractNode.js`
  without ever touching `Leaf.js` or `Node.js`.
- Works without any convention file.

**Cons**

- `from` becomes async, which infects callers.
- Dynamic imports have a runtime cost on first hit.
- You can cache them, but now you're hand-rolling a registry.

### 4. Inversion: subclasses register themselves with the base

Have the base class own a small registry and have subclasses call
`AbstractNode.register(...)` at module-init time:

```ts
// AbstractNode.ts
export abstract class AbstractNode {
  private static matchers: Array<{
    test: (v: unknown) => boolean;
    make: (v: unknown) => AbstractNode;
  }> = [];
  static register(m: (typeof AbstractNode.matchers)[number]) {
    AbstractNode.matchers.push(m);
  }
  static from(value: unknown): AbstractNode {
    const m = AbstractNode.matchers.find((x) => x.test(value));
    if (!m) throw new Error("no matcher");
    return m.make(value);
  }
}
```

```ts
// Leaf.ts
import { AbstractNode } from "./AbstractNode.js";
export class Leaf extends AbstractNode { ... }
AbstractNode.register({ test: (v) => typeof v !== "object", make: (v) => new Leaf(v) });
```

**Pros**

- Base class has no static knowledge of its subclasses — clean DAG.
- Scales gracefully to N subclasses added by N different files (or even
  by downstream packages).

**Cons**

- Whoever calls `AbstractNode.from(...)` has to have somehow imported the
  subclass files first (otherwise they never registered).
  That is often solved with a barrel file that imports every subclass
  for its side effects — which is basically the internal-module pattern
  again, just with side-effect imports.
- The set of matchers is now mutable global state.

### 5. Put the `extends` relationship behind a class factory

Not really ESM-specific, but: instead of `class Leaf extends AbstractNode
{}` at module top-level, wrap it:

```ts
// Leaf.ts
import type { AbstractNodeType } from "./AbstractNode.js";
export const makeLeaf = (Base: AbstractNodeType) => class Leaf extends Base { ... };
```

and have `internal.ts` or a consumer instantiate it after `AbstractNode`
is known. This defers the `extends` check past the cycle entirely.

**Pros**

- Fundamentally side-steps the "can't extend a TDZ binding" problem.

**Cons**

- Awkward to use. `instanceof Leaf` no longer makes sense because the
  `Leaf` class identity depends on who called `makeLeaf`.
- Often more ceremony than it's worth.

### Recommendation

For a library like Joist, where cycles emerge between base entities and
their subclasses / meta / factory methods, option 1 (the internal-module
pattern) is almost always the right default: it's mechanical, it's
greppable (every import outside `./internal` is a red flag), and it
works the same in both CJS and ESM builds. Option 2 (refactor the cycle
out of existence) is better when feasible but is not always possible to
retrofit.
