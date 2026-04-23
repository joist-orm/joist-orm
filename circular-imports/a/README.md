# circular-imports/a — CommonJS reproducer

Reproduces the runtime error described in
<https://medium.com/visual-development/how-to-fix-nasty-circular-dependency-issues-once-and-for-all-in-javascript-typescript-a04c987cf0de>
using three TypeScript classes compiled to CommonJS.

## Layout

```
src/
  index.ts          entry, imports AbstractNode
  AbstractNode.ts   base class, imports Leaf and Node (for its static factory)
  Leaf.ts           extends AbstractNode
  Node.ts           extends AbstractNode
```

`AbstractNode` ↔ `Leaf` and `AbstractNode` ↔ `Node` form two import cycles,
and because `AbstractNode.ts` imports its subclasses at the *top* of the file
(before the `class AbstractNode` declaration has populated `module.exports`),
the subclass modules see an empty `exports` object when they try to extend it.

## Running

```bash
npm install
npm run run-repro
```

## Expected output

```
TypeError: Class extends value undefined is not a constructor or null
    at Object.<anonymous> (.../dist/Leaf.js:...)
    ...
```

## Why it fails

1. Node begins executing `dist/index.js`, which `require`s `./AbstractNode`.
2. `AbstractNode.js` is added to the require cache with an empty `exports`
   object, then its body starts running.
3. Its first statement is `require("./Leaf")`.
4. `Leaf.js` starts running. Its first statement is `require("./AbstractNode")`
   — which is already in the cache, so it gets back the *empty* `exports`.
5. `Leaf.js` runs `class Leaf extends AbstractNode {}`. `AbstractNode` is
   `undefined` on the partial exports object, so V8 throws
   `TypeError: Class extends value undefined is not a constructor or null`.
6. `AbstractNode.js`'s own `class AbstractNode { ... }` statement — the one
   that would actually populate `exports.AbstractNode` — never runs.

See `circular-imports/b` for the fix.
