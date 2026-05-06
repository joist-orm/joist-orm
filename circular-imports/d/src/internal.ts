// Same "internal module" pattern as circular-imports/b, but for ESM.
//
// In ESM the ordering semantics are a little different -- evaluation is a
// DFS through the module graph, and the graph is fully built before any
// body runs -- but the fix is identical: put the base class first so that
// by the time a subclass's `class X extends Y` line runs, the parent
// class has already been initialized in its own module.
export * from "./AbstractNode.js";
export * from "./Node.js";
export * from "./Leaf.js";
