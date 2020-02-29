import pgStructure, { Db, Table } from "pg-structure";
import { camelCase, pascalCase } from "change-case";
import { promises as fs } from "fs";
import { Client } from "pg";
import pluralize from "pluralize";
import { code, Code, imp } from "ts-poet";
import TopologicalSort from "topological-sort";
import {
  isEntityTable,
  isEnumTable,
  isJoinTable,
  mapSimpleDbType,
  merge,
  tableToEntityName,
  trueIfResolved,
} from "./utils";
import { SymbolSpec } from "ts-poet/build/SymbolSpecs";
import { newPgConnectionConfig } from "./connection";
import { EntityDbMetadata, entityType, metaName, metaType } from "./EntityDbMetadata";
import entity from "pg-structure/dist/pg-structure/base/entity";

const columnCustomizations: Record<string, ColumnMetaData> = {};

const Flavor = imp("Flavor@joist-orm");
const Reference = imp("Reference@joist-orm");
const Collection = imp("Collection@joist-orm");
const OneToManyCollection = imp("OneToManyCollection@joist-orm");
const EntityOrmField = imp("EntityOrmField@joist-orm");
const EntityManager = imp("EntityManager@joist-orm");
const EntityMetadata = imp("EntityMetadata@joist-orm");
const PrimaryKeySerde = imp("PrimaryKeySerde@joist-orm");
const ManyToOneReference = imp("ManyToOneReference@joist-orm");
const ManyToManyCollection = imp("ManyToManyCollection@joist-orm");
const EnumFieldSerde = imp("EnumFieldSerde@joist-orm");
const ForeignKeySerde = imp("ForeignKeySerde@joist-orm");
const SimpleSerde = imp("SimpleSerde@joist-orm");
const fail = imp("fail@joist-orm");
const setOpts = imp("setOpts@joist-orm");

export interface CodeGenFile {
  name: string;
  contents: Code | string;
  overwrite: boolean;
}

export interface ColumnMetaData {
  typeConverter?: SymbolSpec;
  fieldType: SymbolSpec | string;
}

/** A map from Enum table name to the rows currently in the table. */
export type EnumRows = Record<string, EnumRow[]>;
export type EnumRow = { id: number; code: string; name: string };

interface Config {
  entitiesDirectory: string;
}

const defaultConfig: Config = {
  entitiesDirectory: "./src/entities",
};

/** Uses entities and enums from the `db` schema and saves them into our entities directory. */
export async function generateAndSaveFiles(db: Db, enumRows: EnumRows): Promise<void> {
  const config = await loadConfig();
  const files = generateFiles(db, enumRows);
  await fs.mkdir(config.entitiesDirectory, { recursive: true });
  for await (const file of files) {
    const path = `${config.entitiesDirectory}/${file.name}`;
    if (file.overwrite) {
      await fs.writeFile(path, await contentToString(file.contents, file.name));
    } else {
      const exists = await trueIfResolved(fs.access(path));
      if (!exists) {
        await fs.writeFile(path, await contentToString(file.contents, file.name));
      }
    }
  }
}

/** Generates our `${Entity}` and `${Entity}Codegen` files based on the `db` schema. */
export function generateFiles(db: Db, enumRows: EnumRows): CodeGenFile[] {
  const entities = db.tables.filter(isEntityTable).sortBy("name");
  const enums = db.tables.filter(isEnumTable).sortBy("name");

  const entityFiles = entities
    .map(table => {
      const entityName = tableToEntityName(table);
      return [
        { name: `${entityName}Codegen.ts`, contents: generateEntityCodegenFile(table, entityName), overwrite: true },
        { name: `${entityName}.ts`, contents: generateInitialEntityFile(table, entityName), overwrite: false },
      ];
    })
    .reduce(merge, []);

  const enumFiles = enums
    .map(table => {
      const enumName = tableToEntityName(table);
      return [{ name: `${enumName}.ts`, contents: generateEnumFile(table, enumRows, enumName), overwrite: true }];
    })
    .reduce(merge, []);

  const sortedEntities = sortByRequiredForeignKeys(db);
  const metadataFile: CodeGenFile = {
    name: "./metadata.ts",
    contents: code`${entities.map(table => generateMetadataFile(sortedEntities, table))}`,
    overwrite: true,
  };

  const entitiesFile: CodeGenFile = {
    name: "./entities.ts",
    contents: generateEntitiesFile(entities, enums),
    overwrite: true,
  };

  const indexFile: CodeGenFile = {
    name: "./index.ts",
    contents: code`export * from "./entities"`,
    overwrite: false,
  };

  return [...entityFiles, ...enumFiles, entitiesFile, metadataFile, indexFile];
}

function generateEnumFile(table: Table, enumRows: EnumRows, enumName: string): Code {
  const rows = enumRows[table.name];
  return code`
    export enum ${enumName} {
      ${rows.map(row => `${pascalCase(row.code)} = '${row.code}'`).join(",\n")}
    }

    type Details = { id: number, code: ${enumName}, name: string };

    const details: Record<${enumName}, Details> = {
      ${rows
        .map(row => {
          const code = pascalCase(row.code);
          const safeName = row.name.replace(/(["'])/g, "\\$1");
          return `[${enumName}.${code}]: { id: ${row.id}, code: ${enumName}.${code}, name: '${safeName}' }`;
        })
        .join(",")}
    };

    export const ${pluralize(enumName)} = {
      getByCode(code: ${enumName}): Details {
        return details[code];
      },

      findByCode(code: string): Details | undefined {
        return details[code as ${enumName}];
      },

      findById(id: number): Details | undefined {
        return Object.values(details).find(d => d.id === id);
      },

      getValues(): ReadonlyArray<${enumName}> {
        return Object.values(${enumName});
      },

      getDetails(): ReadonlyArray<Details> {
        return Object.values(details);
      },
    };
  `;
}

/** Creates the placeholder file for our per-entity custom business logic in. */
function generateInitialEntityFile(table: Table, entityName: string): Code {
  const codegenClass = imp(`${entityName}Codegen@./entities`);
  const optsClass = imp(`${entityName}Opts@./entities`);
  return code`
    export class ${entityName} extends ${codegenClass} {
      constructor(em: ${EntityManager}, opts: ${optsClass}) {
        super(em, opts);
      }
    }
  `;
}

function mapType(tableName: string, columnName: string, dbColumnType: string): ColumnMetaData {
  return (
    columnCustomizations[`${tableName}.${columnName}`] || {
      fieldType: mapSimpleDbType(dbColumnType),
    }
  );
}

function generateMetadataFile(sortedEntities: string[], table: Table): Code {
  const dbMetadata = new EntityDbMetadata(table);

  const primaryKey = code`
    { fieldName: "id", columnName: "id", dbType: "int", serde: new ${PrimaryKeySerde}("id", "id") },
  `;

  const primitives = dbMetadata.primitives.map(p => {
    const { fieldName, columnName, columnType } = p;
    return code`
      {
        fieldName: "${fieldName}",
        columnName: "${columnName}",
        dbType: "${columnType}",
        serde: new ${SimpleSerde}("${fieldName}", "${columnName}"),
      },`;
  });

  const enums = dbMetadata.enums.map(e => {
    const { fieldName, columnName, enumType } = e;
    return code`
        {
          fieldName: "${fieldName}",
          columnName: "${columnName}",
          dbType: "int",
          serde: new ${EnumFieldSerde}("${fieldName}", "${columnName}", ${enumType}),
        },
      `;
  });

  const m2o = dbMetadata.manyToOnes.map(m2o => {
    const { fieldName, columnName, otherEntity } = m2o;
    return code`
        {
          fieldName: "${fieldName}",
          columnName: "${columnName}",
          dbType: "int",
          serde: new ${ForeignKeySerde}("${fieldName}", "${columnName}", () => ${metaName(otherEntity)}),
        },
      `;
  });

  const { entityName } = dbMetadata;

  return code`
    export const ${metaName(entityName)}: ${EntityMetadata}<${entityType(entityName)}> = {
      cstr: ${entityType(entityName)},
      type: "${entityName}",
      tableName: "${table.name}",
      columns: [ ${primaryKey} ${enums} ${primitives} ${m2o} ],
      order: ${sortedEntities.indexOf(entityName)},
    };
    
    (${entityName} as any).metadata = ${metaName(entityName)};
  `;
}

const ormMaintainedFields = ["createdAt", "updatedAt"];

/** Creates the base class with the boilerplate annotations. */
function generateEntityCodegenFile(table: Table, entityName: string): Code {
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

  // Make our opts type
  const optsFields = meta.primitives.map(p => {
    const { fieldName, columnName, notNull, columnType } = p;
    if (ormMaintainedFields.includes(fieldName)) {
      return "";
    }
    const type = mapType(table.name, columnName, columnType);
    const maybeOptional = notNull ? "" : "?";
    return code`${fieldName}${maybeOptional}: ${type.fieldType};`;
  });
  const optsEnumFields = meta.enums.map(e => {
    const { fieldName, enumType, notNull } = e;
    const maybeOptional = notNull ? "" : "?";
    return code`${fieldName}${maybeOptional}: ${enumType};`;
  });
  const optsM2oRelationFields = meta.manyToOnes.map(m2o => {
    const { fieldName, otherEntity, notNull } = m2o;
    const maybeOptional = notNull ? "" : "?";
    return code`${fieldName}${maybeOptional}: ${otherEntity};`;
  });
  const optsO2mRelationFields = meta.oneToManys.map(o2m => {
    const { fieldName, otherEntity } = o2m;
    return code`${fieldName}?: ${entityType(otherEntity)}[];`;
  });
  const optsM2mRelationFields = meta.manyToManys.map(m2m => {
    const { fieldName, otherEntity } = m2m;
    return code`${fieldName}?: ${entityType(otherEntity)}[];`;
  });

  const metadata = imp(`${camelCase(entityName)}Meta@./entities`);

  return code`
    export type ${entityName}Id = ${Flavor}<string, "${entityName}">;

    export interface ${entityName}Opts {
      ${[optsFields, optsEnumFields, optsM2oRelationFields, optsO2mRelationFields, optsM2mRelationFields]}
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

function generateEntitiesFile(entities: Table[], enums: Table[]): Code {
  return code`
    // This file drives our import order to avoid undefined errors
    // when the subclasses extend the base classes, see:
    // https://medium.com/visual-development/how-to-fix-nasty-circular-dependency-issues-once-and-for-all-in-javascript-typescript-a04c987cf0de
    ${enums.map(table => {
      return `export * from "./${tableToEntityName(table)}";`;
    })}
    ${entities.map(table => {
      return `export * from "./${tableToEntityName(table)}Codegen";`;
    })}
    ${entities.map(table => {
      return `export * from "./${tableToEntityName(table)}";`;
    })}
    export * from "./metadata";
  `;
}

export async function loadEnumRows(db: Db, client: Client): Promise<EnumRows> {
  const promises = db.tables.filter(isEnumTable).map(async table => {
    const result = await client.query(`SELECT * FROM ${table.name} ORDER BY id`);
    const rows = result.rows.map(row => ({ id: row.id, code: row.code, name: row.name } as EnumRow));
    return [table.name, rows] as [string, EnumRow[]];
  });
  return Object.fromEntries(await Promise.all(promises));
}

export async function contentToString(content: Code | string, fileName: string): Promise<string> {
  if (typeof content === "string") {
    return content;
  }
  return await content.toStringWithImports(fileName);
}

/**
 * For now, we insert entities in a deterministic order based on FK dependencies.
 *
 * This will only work with a subset of schemas, so we'll work around that later.
 */
function sortByRequiredForeignKeys(db: Db): string[] {
  const tables = db.tables.filter(isEntityTable);
  const ts = new TopologicalSort<string, Table>(new Map());
  tables.forEach(t => ts.addNode(t.name, t));
  tables.forEach(t => {
    t.m2oRelations
      .filter(m2o => isEntityTable(m2o.targetTable))
      .forEach(m2o => {
        if (m2o.foreignKey.columns.every(c => c.notNull)) {
          ts.addEdge(m2o.targetTable.name, t.name);
        }
      });
  });
  return Array.from(ts.sort().values()).map(v => tableToEntityName(v.node));
}

async function loadConfig(): Promise<Config> {
  const configPath = "./joist-codegen.json";
  const exists = await trueIfResolved(fs.access(configPath));
  if (exists) {
    const content = await fs.readFile(configPath);
    return JSON.parse(content.toString()) as Config;
  }
  return defaultConfig;
}

if (require.main === module) {
  if (Object.fromEntries === undefined) {
    throw new Error("Joist requires Node v12.4.0+");
  }
  (async function() {
    const config = newPgConnectionConfig();
    const db = await pgStructure(config);

    const client = new Client(config);
    await client.connect();
    const enumRows = await loadEnumRows(db, client);
    await client.end();

    await generateAndSaveFiles(db, enumRows);
  })().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
