# circular-imports/c — ESM reproducer

Same source structure as [`../a`](../a), ported to native ES modules:

- `package.json` sets `"type": "module"`
- `tsconfig.json` uses `module: "NodeNext"` and `moduleResolution: "NodeNext"`
- sibling imports use explicit `.js` extensions, per the NodeNext
  resolution rules

## Running

```bash
npm install
npm run run-repro
```

## Expected output

```
ReferenceError: Cannot access 'AbstractNode' before initialization
    at file://.../dist/Leaf.js:... (the `class Leaf extends AbstractNode` line)
```

## Why it fails — ESM flavor

In CJS (`../a`), the failure mode is "subclass module sees an empty
`module.exports` because CJS hands out partial exports during cycles". The
subclass extends `undefined`.

In ESM there is no partial-exports object; every export is a live binding.
But live bindings can be in the TDZ. Evaluation order is:

1. The module graph is fully parsed and linked.
2. Starting from `index.js`, Node performs a DFS through imports.
3. To evaluate `index.js`, its dependency `AbstractNode.js` must evaluate
   first.
4. To evaluate `AbstractNode.js`, ITS dependencies `Leaf.js` and `Node.js`
   must evaluate first (in source order).
5. To evaluate `Leaf.js`, its dependency `AbstractNode.js` must evaluate.
   But `AbstractNode.js` is already on the evaluation stack — cycle — so
   Node proceeds to run `Leaf.js`'s body anyway.
6. `Leaf.js` body runs: `class Leaf extends AbstractNode {}`. The
   `AbstractNode` binding exists (ESM imports are hoisted) but the class
   declaration inside `AbstractNode.js` has not executed yet, so the
   binding is still in the TDZ.
7. V8 throws `ReferenceError: Cannot access 'AbstractNode' before
   initialization`.

Same root cause as CJS (module-top-level `extends` inside a cycle), just
a different error class.

See `../d` for the fix.
