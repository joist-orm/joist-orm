import { Entity, EntityManager, EntityMetadata, EntityOrmField, SimpleSerde } from "../src/EntityManager";

export class Author implements Entity {
  readonly __orm: EntityOrmField;

  constructor(em: EntityManager) {
    this.__orm = { metadata: authorMeta, data: {} as Record<any, any>, em };
    em.register(this);
  }

  // TODO Codegen
  get id(): string {
    return this.__orm.data["id"];
  }

  get firstName(): string {
    return this.__orm.data["firstName"];
  }

  set firstName(firstName: string) {
    this.__orm.data["firstName"] = firstName;
    this.__orm.em.markDirty(this);
  }
}

// TODO Codegen
const authorMeta: EntityMetadata = {
  cstr: Author,
  tableName: "authors",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new SimpleSerde("id", "id") },
    {
      fieldName: "firstName",
      columnName: "first_name",
      dbType: "varchar",
      serde: new SimpleSerde("firstName", "first_name"),
    },
  ],
};

(Author as any).metadata = authorMeta;
