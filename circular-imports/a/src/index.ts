// The entry point imports the base class first. Because AbstractNode.ts itself
// imports ./Leaf and ./Node at the top, CommonJS will:
//
//   1. begin evaluating AbstractNode.ts
//   2. synchronously require ./Leaf
//   3. Leaf.ts requires ./AbstractNode -- which is already in the require cache
//      in a PARTIALLY initialized state (module.exports is still `{}`)
//   4. `class Leaf extends AbstractNode {}` executes while AbstractNode is
//      undefined
//   5. Node throws: "Class extends value undefined is not a constructor or null"
//
// So this file never even gets to run its own body.
import { AbstractNode } from "./AbstractNode";

const tree = AbstractNode.from({ name: "joist", kind: "orm", stars: 42 });
console.log(tree.print());
