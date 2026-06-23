// Entry points import from ./internal too, so that THEY also play by the
// rules of the centralized load order.
import { AbstractNode } from "./internal";

const tree = AbstractNode.from({ name: "joist", kind: "orm", stars: 42 });
console.log(tree.print());
