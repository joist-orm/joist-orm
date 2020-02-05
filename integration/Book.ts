import { EntityManager, EntityMetadata, SimpleSerde } from "../src/EntityManager";

export class Book {
  readonly __orm = { metadata: bookMeta, data: {} as Record<any, any> };

  constructor(private em: EntityManager) {
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
    this.em.markDirty(this);
  }
}

// TODO Codegen
const bookMeta: EntityMetadata = {
  cstr: Book,
  tableName: "books",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new SimpleSerde("id", "id") },
    { fieldName: "title", columnName: "title", dbType: "varchar", serde: new SimpleSerde("title", "title") },
  ],
};

(Book as any).metadata = bookMeta;
