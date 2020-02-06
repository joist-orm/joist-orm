import {
  Entity,
  EntityConstructor,
  EntityManager,
  EntityMetadata,
  EntityOrmField,
  ForeignKeySerde,
  SimpleSerde,
} from "../src/EntityManager";
import { Author } from "./Author";

class Relation<T extends Entity, U extends Entity> {
  constructor(private entity: T, private otherType: EntityConstructor<U>, private fieldName: string) {}

  load(): Promise<U> {
    const id = this.entity.__orm.data[this.fieldName];
    return this.entity.__orm.em.load(this.otherType, id);
  }

  set(other: U): void {
    this.entity.__orm.data[this.fieldName] = other.id || other;
  }
}

export class Book {
  readonly __orm: EntityOrmField;
  readonly author = new Relation(this, Author, "author");

  constructor(em: EntityManager) {
    this.__orm = { metadata: bookMeta, data: {} as Record<any, any>, em };
    em.register(this);
  }

  // TODO Codegen
  get id(): string {
    return this.__orm.data["id"];
  }

  get title(): string {
    return this.__orm.data["title"];
  }

  set title(title: string) {
    this.__orm.data["title"] = title;
    this.__orm.em.markDirty(this);
  }
}

// TODO Codegen
const bookMeta: EntityMetadata = {
  cstr: Book,
  tableName: "books",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new SimpleSerde("id", "id") },
    { fieldName: "title", columnName: "title", dbType: "varchar", serde: new SimpleSerde("title", "title") },
    {
      fieldName: "author",
      columnName: "author_id",
      dbType: "int",
      serde: new ForeignKeySerde("author", "author_id"),
    },
  ],
  order: 2,
};

(Book as any).metadata = bookMeta;
