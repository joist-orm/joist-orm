# circular-imports

Four small standalone TypeScript projects that walk through the circular
dependency problem described in
[*How to fix nasty circular dependency issues once and for all*](https://medium.com/visual-development/how-to-fix-nasty-circular-dependency-issues-once-and-for-all-in-javascript-typescript-a04c987cf0de)
and apply the "internal module" fix, first in CommonJS and then in ESM.

Each project is self-contained — its own `package.json`, its own
`node_modules`, its own `tsconfig.json`. They are deliberately NOT part of
the root yarn workspace.

| Project | Module system | Status | What it shows |
| --- | --- | --- | --- |
| [`a/`](./a) | CommonJS | ❌ fails deterministically | Reproduces `TypeError: Class extends value undefined is not a constructor or null` |
| [`b/`](./b) | CommonJS | ✅ passes | Fixes it with the internal-module pattern |
| [`c/`](./c) | ESM | ❌ fails deterministically | Reproduces `ReferenceError: Cannot access 'AbstractNode' before initialization` |
| [`d/`](./d) | ESM | ✅ passes | Internal-module fix ported to ESM, plus brainstorm of alternative ESM-only fixes |

## The reproduction, in one paragraph

An abstract base class (`AbstractNode`) has a static factory
`AbstractNode.from(value)` that picks between two subclasses (`Leaf` and
`Node`). To do that, `AbstractNode.ts` has to import `Leaf.ts` and
`Node.ts` at the top of the file. But those subclass files also import
`AbstractNode` (for `class Leaf extends AbstractNode {}`). That's a
circular import. When the entry point happens to hit `AbstractNode.ts`
first, its imports of `Leaf`/`Node` cause those files to start
evaluating before `AbstractNode`'s own `class ... {}` declaration has
assigned anything to the module's exports — and then the subclass's
`extends` clause blows up.

## Running everything

```bash
for p in a b c d; do
  echo "--- $p ---"
  (cd "$p" && npm install --loglevel=error >/dev/null && npm run -s run-repro; echo "exit=$?")
done
```

You should see `a` and `c` exit non-zero with a runtime error, and `b`
and `d` print `{ name: "joist", kind: "orm", stars: 42 }` and exit 0.
