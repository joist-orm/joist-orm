import { Collection } from "../index";
import { Entity, EntityConstructor } from "../EntityManager";

export class ManyToManyCollection<T extends Entity, U extends Entity> implements Collection<T, U> {
  constructor(
    public joinTableName: string,
    // I.e. with entity = Book:
    // fieldName == tags, because it's our collection to tags
    // columnName = book_id, what we use as the `where book_id = us` to find our join table rows
    // otherFieldName = books, how tags points to us
    // otherColumnName = tag_id, how the other side finds its join table rows
    public entity: T,
    public fieldName: keyof T,
    public columnName: string,
    public otherType: EntityConstructor<U>,
    public otherFieldName: keyof U,
    public otherColumnName: string,
  ) {}

  async load(): Promise<ReadonlyArray<U>> {
    const em = this.entity.__orm.em;
    return em.loadJoinTable(this);
  }

  add(other: U): void {}

  // internal impls

  public dataLoaderKey(): string {
    // TODO This is basically a reference
    // TODO Unsaved entities should never get here
    return `${this.columnName}=${this.entity.id}`;
  }
}
