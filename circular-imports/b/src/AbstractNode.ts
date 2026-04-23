// Note: we import Leaf and Node via ./internal, NOT directly from ./Leaf or
// ./Node. When this file is evaluated, ./internal is already "in flight" --
// internal.ts is the module that kicked off loading AbstractNode in the first
// place -- so the `Leaf` and `Node` bindings we pull off it will still be
// undefined at this point in time.
//
// That's fine! The only place we reference them is inside the body of
// `static from(...)`, which doesn't run until *after* all three modules have
// finished loading and `internal.ts`'s re-exports have been fully populated.
import { Leaf, Node } from "./internal";

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
