// Same layout as ../a, but running as native ESM instead of CommonJS.
//
// ESM fails the cycle differently than CJS:
//
//   - In CJS, partially-loaded modules hand out an empty `exports` object, so
//     the importing file sees `undefined` for its named imports. Extending
//     `undefined` throws "Class extends value undefined is not a constructor
//     or null" at module-top-level.
//
//   - In ESM, bindings are always "live" but can be in the Temporal Dead
//     Zone. Reading them before the exporting module has initialized them
//     throws "Cannot access 'AbstractNode' before initialization"
//     (ReferenceError) the first time `class Leaf extends AbstractNode {}`
//     tries to resolve the parent class.
//
// Either way: module-top-level `class X extends Y {}` inside a cycle is a
// time bomb.
import { AbstractNode } from "./AbstractNode.js";

const tree = AbstractNode.from({ name: "joist", kind: "orm", stars: 42 });
console.log(tree.print());
