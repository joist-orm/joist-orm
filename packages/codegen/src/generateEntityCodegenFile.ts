import { Table } from "pg-structure";
import { code, Code, imp } from "ts-poet";
import { EntityDbMetadata, entityType, metaType } from "./EntityDbMetadata";
import {
  Collection,
  EntityManager,
  EntityOrmField,
  fail,
  Flavor,
  ManyToManyCollection,
  ManyToOneReference,
  OneToManyCollection,
  Reference,
  setOpts,
} from "./symbols";
import { camelCase } from "change-case";
import { mapSimpleDbType } from "./utils";
import { SymbolSpec } from "ts-poet/build/SymbolSpecs";

export interface ColumnMetaData {
  typeConverter?: SymbolSpec;
  fieldType: SymbolSpec | string;
}

const columnCustomizations: Record<string, ColumnMetaData> = {};

/** Creates the base class with the boilerplate annotations. */
export function generateEntityCodegenFile(table: Table, entityName: string): Code {
  const meta = new EntityDbMetadata(table);
  const entityType2 = entityType(entityName);

  // Add the primitives
  const primitives = meta.primitives.map(p => {
    const { fieldName, columnName, columnType, notNull } = p;
    const type = mapType(table.name, columnName, columnType);
    const maybeOptional = notNull ? "" : " | undefined";
    const getter = code`
        get ${fieldName}(): ${type.fieldType}${maybeOptional} {
          return this.__orm.data["${fieldName}"];
        }
     `;
    const setter = code`
        set ${fieldName}(${fieldName}: ${type.fieldType}${maybeOptional}) {
          this.ensureNotDeleted();
          this.__orm.em.setField(this, "${fieldName}", ${fieldName});
        }
      `;
    return code`${getter} ${!ormMaintainedFields.includes(fieldName) ? setter : ""}`;
  });

  // Add ManyToOne
  meta.enums.forEach(e => {
    const { fieldName, enumType, notNull } = e;
    const maybeOptional = notNull ? "" : " | undefined";
    const getter = code`
        get ${fieldName}(): ${enumType}${maybeOptional} {
          return this.__orm.data["${fieldName}"];
        }
     `;
    const setter = code`
        set ${fieldName}(${fieldName}: ${enumType}${maybeOptional}) {
          this.ensureNotDeleted();
          this.__orm.em.setField(this, "${fieldName}", ${fieldName});
        }
      `;
    // Group enums as primitives
    primitives.push(getter);
    primitives.push(setter);
  });

  // Add ManyToOne
  const m2o = meta.manyToOnes.map(m2o => {
    const { fieldName, otherEntity, otherFieldName, notNull } = m2o;
    const otherEntityType = entityType(otherEntity);
    const maybeOptional = notNull ? "never" : "undefined";
    return code`
        readonly ${fieldName}: ${Reference}<${entityType2}, ${otherEntityType}, ${maybeOptional}> =
          new ${ManyToOneReference}<${entityType2}, ${otherEntityType}, ${maybeOptional}>(
            this as any,
            ${otherEntityType},
            "${fieldName}",
            "${otherFieldName}",
            ${notNull},
          );
      `;
  });

  // Add OneToMany
  const o2m = meta.oneToManys.map(o2m => {
    const { fieldName, otherFieldName, otherColumnName, otherEntity } = o2m;
    return code`
        readonly ${fieldName}: ${Collection}<${entityType2}, ${entityType(otherEntity)}> = new ${OneToManyCollection}(
          this as any,
          ${metaType(otherEntity)},
          "${fieldName}",
          "${otherFieldName}",
          "${otherColumnName}"
        );
      `;
  });

  // Add ManyToMany
  const m2m = meta.manyToManys.map(m2m => {
    const { joinTableName, fieldName, columnName, otherEntity, otherFieldName, otherColumnName } = m2m;
    return code`
        readonly ${fieldName}: ${Collection}<${entityType2}, ${entityType(otherEntity)}> = new ${ManyToManyCollection}(
          "${joinTableName}",
          this,
          "${fieldName}",
          "${columnName}",
          ${entityType(otherEntity)},
          "${otherFieldName}",
          "${otherColumnName}",
        );
      `;
  });

  const metadata = imp(`${camelCase(entityName)}Meta@./entities`);

  return code`
    export type ${entityName}Id = ${Flavor}<string, "${entityName}">;

    export interface ${entityName}Opts {
      ${generateOptsFields(table, meta)}
    }
  
    export class ${entityName}Codegen {
      readonly __orm: ${EntityOrmField};
      ${[o2m, m2o, m2m]}
      
      constructor(em: ${EntityManager}, opts: ${entityName}Opts) {
        this.__orm = { em, metadata: ${metadata}, data: {}, originalData: {} };
        em.register(this);
        ${setOpts}(this, opts);
      }

      get id(): ${entityName}Id | undefined {
        return this.__orm.data["id"];
      }

      get idOrFail(): ${entityName}Id {
        return this.__orm.data["id"] || ${fail}("Entity has no id yet");
      }

      ${primitives}
      
      toString(): string {
        return "${entityName}#" + this.id;
      }

      private ensureNotDeleted() {
        if (this.__orm.deleted) {
          throw new Error(this.toString() + " is marked as deleted");
        }
      }
    }
  `;
}

function generateOptsFields(table: Table, meta: EntityDbMetadata): Code[] {
  // Make our opts type
  const primitives = meta.primitives.map(({ fieldName, columnName, notNull, columnType }) => {
    if (ormMaintainedFields.includes(fieldName)) {
      return code``;
    }
    const type = mapType(table.name, columnName, columnType);
    return code`${fieldName}${maybeOptional(notNull)}: ${type.fieldType};`;
  });
  const enums = meta.enums.map(({ fieldName, enumType, notNull }) => {
    return code`${fieldName}${maybeOptional(notNull)}: ${enumType};`;
  });
  const m2o = meta.manyToOnes.map(({ fieldName, otherEntity, notNull }) => {
    return code`${fieldName}${maybeOptional(notNull)}: ${otherEntity};`;
  });
  const o2m = meta.oneToManys.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${entityType(otherEntity)}[];`;
  });
  const m2m = meta.manyToManys.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${entityType(otherEntity)}[];`;
  });
  return [...primitives, ...enums, ...m2o, ...o2m, ...m2m];
}

function maybeOptional(notNull: boolean): string {
  return notNull ? "" : "?";
}

function mapType(tableName: string, columnName: string, dbColumnType: string): ColumnMetaData {
  return (
    columnCustomizations[`${tableName}.${columnName}`] || {
      fieldType: mapSimpleDbType(dbColumnType),
    }
  );
}

const ormMaintainedFields = ["createdAt", "updatedAt"];
