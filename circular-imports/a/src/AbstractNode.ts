// AbstractNode is the base class. It imports its own subclasses so that it can
// offer a static `from(...)` factory that picks Leaf vs Node based on the input.
//
// This is the shape the Medium article warns about: the base class has a
// compile-time reference to its subclasses.
import { Leaf } from "./Leaf";
import { Node } from "./Node";

export abstract class AbstractNode {
  constructor(public readonly parent: AbstractNode | null = null) {}

  getDepth(): number {
    return this.parent === null ? 0 : this.parent.getDepth() + 1;
  }

  // Factory that constructs a Leaf for primitives and a Node for objects.
  // The references to `Leaf` and `Node` here are what force the circular import.
  static from(value: unknown, parent: AbstractNode | null = null): AbstractNode {
    if (value !== null && typeof value === "object") {
      return new Node(value as Record<string, unknown>, parent);
    }
    return new Leaf(value, parent);
  }

  abstract print(): string;
}
