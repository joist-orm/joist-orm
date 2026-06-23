# circular-imports/b — CommonJS fix

Takes the exact same classes from [`../a`](../a) and applies the
"internal module" pattern from the Medium article to fix the circular
dependency.

## Layout

```
src/
  index.ts          entry; imports ONLY from ./internal
  internal.ts       re-exports every sibling, in dependency order
  AbstractNode.ts   imports Leaf/Node from ./internal (used inside methods only)
  Node.ts           imports AbstractNode from ./internal, then extends it
  Leaf.ts           imports AbstractNode from ./internal, then extends it
```

The key rule: **no file imports from a sibling directly; everyone imports
from `./internal`**. That makes `internal.ts` the single arbiter of load
order.

## Running

```bash
npm install
npm run run-repro
```

## Expected output

```
{ name: "joist", kind: "orm", stars: 42 }
```

## Why it works

`internal.ts` re-exports the three class modules in a specific order:

```ts
export * from "./AbstractNode";
export * from "./Node";
export * from "./Leaf";
```

Execution now goes:

1. Node begins executing `dist/index.js`, which requires `./internal`.
2. `internal.js` is added to the require cache; its body starts running.
3. First statement: `require("./AbstractNode")`.
4. `AbstractNode.js` starts. Its first statement is `require("./internal")`
   — which is in the cache already, partial. No problem: the only names
   `AbstractNode.js` pulls off it (`Leaf`, `Node`) are referenced inside
   method bodies, not at module-top-level.
5. `AbstractNode.js` finishes. `exports.AbstractNode` is now populated.
6. Back in `internal.js`: `require("./Node")` runs. `Node.js` does
   `require("./internal")` and pulls `AbstractNode` off it — which is now
   real — and `class Node extends AbstractNode {}` succeeds.
7. Same for `./Leaf`.
8. `internal.js` finishes; `index.js` continues.

The trick is that `AbstractNode`'s references to its subclasses are all
behind function boundaries, so they don't need to be resolved until after
the whole module graph has loaded. The subclasses' references to their
parent, though, DO need to be resolved synchronously (for `class X
extends Y {}`), so `AbstractNode` is listed first in `internal.ts`.
