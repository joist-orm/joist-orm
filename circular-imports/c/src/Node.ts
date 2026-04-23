import { AbstractNode } from "./AbstractNode.js";

export class Node extends AbstractNode {
  constructor(
    public readonly value: Record<string, unknown>,
    parent: AbstractNode | null = null,
  ) {
    super(parent);
  }

  print(): string {
    const entries = Object.entries(this.value).map(
      ([k, v]) => `${k}: ${AbstractNode.from(v, this).print()}`,
    );
    return `{ ${entries.join(", ")} }`;
  }
}
