import { AbstractNode } from "./internal.js";

const tree = AbstractNode.from({ name: "joist", kind: "orm", stars: 42 });
console.log(tree.print());
