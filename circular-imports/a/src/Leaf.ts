import { AbstractNode } from "./AbstractNode";

export class Leaf extends AbstractNode {
  constructor(
    public readonly value: unknown,
    parent: AbstractNode | null = null,
  ) {
    super(parent);
  }

  print(): string {
    return JSON.stringify(this.value);
  }
}
