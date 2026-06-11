import { Leaf } from "./Leaf.js";
import { Node } from "./Node.js";

export abstract class AbstractNode {
  constructor(public readonly parent: AbstractNode | null = null) {}

  getDepth(): number {
    return this.parent === null ? 0 : this.parent.getDepth() + 1;
  }

  static from(value: unknown, parent: AbstractNode | null = null): AbstractNode {
    if (value !== null && typeof value === "object") {
      return new Node(value as Record<string, unknown>, parent);
    }
    return new Leaf(value, parent);
  }

  abstract print(): string;
}
