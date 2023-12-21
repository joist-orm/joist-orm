import { DbMetadata } from "index";
import { code, Code, imp } from "ts-poet";
import { Config } from "./config";
import { EntityDbMetadata } from "./EntityDbMetadata";
import {
  BigIntSerde,
  CustomSerdeAdapter,
  DecimalToNumberSerde,
  EntityMetadata,
  EnumArrayFieldSerde,
  EnumFieldSerde,
  JsonSerde,
  KeySerde,
  PolymorphicKeySerde,
  PrimitiveSerde,
  SuperstructSerde,
  ZodSerde,
} from "./symbols";
import { q } from "./utils";

export function generateMetadataFile(config: Config, dbMeta: DbMetadata, meta: EntityDbMetadata): Code {
  const { entity, createdAt, updatedAt, deletedAt } = meta;

  const baseEntity = meta.baseClassName ? dbMeta.entities.find((e) => e.name === meta.baseClassName)! : undefined;

  const fields = generateFields(config, meta, baseEntity);

  Object.values(fields).forEach((code) => code.asOneline());

  const maybeBaseType = meta.baseClassName ? `"${meta.baseClassName}"` : undefined;

  return code`
    export const ${entity.metaName}: ${EntityMetadata}<${entity.name}> = {
      cstr: ${entity.type},
      type: "${entity.name}",
      baseType: ${maybeBaseType},
      idType: "${config.idType ?? "tagged-string"}",
      idDbType: "${meta.primaryKey.columnType}",
      tagName: "${meta.tagName}",
      tableName: "${meta.tableName}",
      fields: ${fields},
      allFields: {},
      orderBy: ${q(config.entities[meta.name]?.orderBy)},
      timestampFields: {
        createdAt: ${q(createdAt?.fieldName)},
        updatedAt: ${q(updatedAt?.fieldName)},
        deletedAt: ${q(deletedAt?.fieldName)},
      },
      config: ${entity.configConst},
      factory: ${imp(`new${entity.name}@./entities`)},
      baseTypes: [],
      subTypes: [],
    };

    (${entity.name} as any).metadata = ${entity.metaName};
  `;
}

function generateFields(
  config: Config,
  dbMetadata: EntityDbMetadata,
  baseEntity?: EntityDbMetadata,
): Record<string, Code> {
  const fields: Record<string, Code> = {};

  fields["id"] = code`
    {
      kind: "primaryKey",
      fieldName: "id",
      fieldIdName: undefined,
      required: true,
      serde: new ${KeySerde}("${dbMetadata.tagName}", "id", "id", "${dbMetadata.primaryKey.columnType}"),
      immutable: true,
    }
  `;

  dbMetadata.primitives.forEach((p) => {
    const { fieldName, derived, columnName, columnType, fieldType, superstruct, zodSchema, customSerde, isArray } = p;
    const serdeType = customSerde
      ? code`new ${CustomSerdeAdapter}("${fieldName}", "${columnName}", "${columnType}", ${customSerde})`
      : superstruct
      ? code`new ${SuperstructSerde}("${fieldName}", "${columnName}", ${superstruct})`
      : zodSchema
      ? code`new ${ZodSerde}("${fieldName}", "${columnName}", ${zodSchema})`
      : columnType === "numeric"
      ? code`new ${DecimalToNumberSerde}("${fieldName}", "${columnName}")`
      : columnType === "jsonb"
      ? code`new ${JsonSerde}("${fieldName}", "${columnName}")`
      : fieldType === "bigint"
      ? code`new ${BigIntSerde}("${fieldName}", "${columnName}")`
      : isArray
      ? code`new ${PrimitiveSerde}("${fieldName}", "${columnName}", "${columnType}[]", true)`
      : code`new ${PrimitiveSerde}("${fieldName}", "${columnName}", "${columnType}")`;
    const extras = columnType === "citext" ? code`citext: true,` : "";
    fields[fieldName] = code`
      {
        kind: "primitive",
        fieldName: "${fieldName}",
        fieldIdName: undefined,
        derived: ${!derived ? false : `"${derived}"`},
        required: ${!derived && p.notNull},
        protected: ${p.protected},
        type: ${typeof p.rawFieldType === "string" ? `"${p.rawFieldType}"` : p.rawFieldType},
        serde: ${serdeType},
        immutable: false,
        ${extras}
      }`;
  });

  // Treat native enums as primitives
  dbMetadata.pgEnums.forEach(({ columnName, fieldName, notNull, dbType }) => {
    fields[fieldName] = code`
      {
        kind: "primitive",
        fieldName: "${fieldName}",
        fieldIdName: undefined,
        derived: false,
        required: ${notNull},
        protected: false,
        type: "string",
        serde: new ${PrimitiveSerde}("${fieldName}", "${columnName}", "${dbType}"),
        immutable: false,
      }`;
  });

  dbMetadata.enums.forEach(({ fieldName, enumDetailType, notNull, isArray, columnName, columnType }) => {
    const serdeType = isArray ? EnumArrayFieldSerde : EnumFieldSerde;
    const columnTypeWithArray = `${columnType}${isArray ? "[]" : ""}`;
    fields[fieldName] = code`
      {
        kind: "enum",
        fieldName: "${fieldName}",
        fieldIdName: undefined,
        required: ${notNull},
        enumDetailType: ${enumDetailType},
        serde: new ${serdeType}("${fieldName}", "${columnName}", "${columnTypeWithArray}", ${enumDetailType}),
        immutable: false,
      }
    `;
  });

  dbMetadata.manyToOnes.forEach((m2o) => {
    const { fieldName, columnName, notNull, otherEntity, otherFieldName, derived, dbType } = m2o;
    const otherTagName = config.entities[otherEntity.name].tag;
    fields[fieldName] = code`
      {
        kind: "m2o",
        fieldName: "${fieldName}",
        fieldIdName: "${fieldName}Id",
        derived: ${!derived ? false : `"${derived}"`},
        required: ${notNull},
        otherMetadata: () => ${otherEntity.metaName},
        otherFieldName: "${otherFieldName}",
        serde: new ${KeySerde}("${otherTagName}", "${fieldName}", "${columnName}", "${dbType}"),
        immutable: false,
      }
    `;
  });

  dbMetadata.oneToManys.forEach((m2o) => {
    const { fieldName, singularName, otherEntity, otherFieldName } = m2o;
    fields[fieldName] = code`
      {
        kind: "o2m",
        fieldName: "${fieldName}",
        fieldIdName: "${singularName}Ids",
        required: false,
        otherMetadata: () => ${otherEntity.metaName},
        otherFieldName: "${otherFieldName}",
        serde: undefined,
        immutable: false,
      }
    `;
  });

  dbMetadata.largeOneToManys.forEach((m2o) => {
    const { fieldName, singularName, otherEntity, otherFieldName } = m2o;
    fields[fieldName] = code`
      {
        kind: "lo2m",
        fieldName: "${fieldName}",
        fieldIdName: "${singularName}Ids",
        required: false,
        otherMetadata: () => ${otherEntity.metaName},
        otherFieldName: "${otherFieldName}",
        serde: undefined,
        immutable: false,
      }
    `;
  });

  dbMetadata.manyToManys.forEach((m2m) => {
    const { fieldName, singularName, otherEntity, otherFieldName } = m2m;
    fields[fieldName] = code`
      {
        kind: "m2m",
        fieldName: "${fieldName}",
        fieldIdName: "${singularName}Ids",
        required: false,
        otherMetadata: () => ${otherEntity.metaName},
        otherFieldName: "${otherFieldName}",
        serde: undefined,
        immutable: false,
        joinTableName: "${m2m.joinTableName}",
        columnNames: ["${m2m.columnName}", "${m2m.otherColumnName}"],
      }
    `;
  });

  dbMetadata.oneToOnes.forEach((o2o) => {
    const { fieldName, otherEntity, otherFieldName } = o2o;
    fields[fieldName] = code`
      {
        kind: "o2o",
        fieldName: "${fieldName}",
        fieldIdName: "${fieldName}Id",
        required: false,
        otherMetadata: () => ${otherEntity.metaName},
        otherFieldName: "${otherFieldName}",
        serde: undefined,
        immutable: false,
      }
    `;
  });

  dbMetadata.polymorphics.forEach((p) => {
    const { fieldName, notNull, components } = p;
    fields[fieldName] = code`
      {
        kind: "poly",
        fieldName: "${fieldName}",
        fieldIdName: "${fieldName}Id",
        required: ${notNull},
        components: [${components.map(
          ({ otherFieldName, otherEntity, columnName }) => code`
          {
            otherMetadata: () => ${otherEntity.metaName},
            otherFieldName: "${otherFieldName}",
            columnName: "${columnName}",
          },`,
        )}],
        serde: new ${PolymorphicKeySerde}(() => ${dbMetadata.entity.metaName}, "${fieldName}"),
        immutable: false,
      }
    `;
  });

  return fields;
}
