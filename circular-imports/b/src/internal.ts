// The "internal module" pattern from the Medium article.
//
// Every file in this project imports from `./internal` instead of from its
// siblings directly. That centralizes the module-load order in ONE place:
// the order of these re-exports below.
//
// The rule: list modules from least-dependent to most-dependent. The base
// class must finish evaluating before any subclass runs `class X extends Y {}`.
export * from "./AbstractNode";
export * from "./Node";
export * from "./Leaf";
