// As in circular-imports/b, we pull `Leaf` and `Node` off ./internal rather
// than from their sibling files directly. Those bindings may still be in the
// TDZ when THIS module evaluates, but we only use them inside method bodies
// that don't run until well after the whole graph has finished loading.
import { Leaf, Node } from "./internal.js";

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
