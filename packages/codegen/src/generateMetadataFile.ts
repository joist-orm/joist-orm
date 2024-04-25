import { DbMetadata } from "index";
import { Code, code, imp, Import } from "ts-poet";
import { Config } from "./config";
import { EntityDbMetadata } from "./EntityDbMetadata";
import {
  BigIntSerde,
  CustomSerdeAdapter,
  DateSerde,
  DecimalToNumberSerde,
  EntityMetadata,
  EnumArrayFieldSerde,
  EnumFieldSerde,
  JsonSerde,
  KeySerde,
  PlainDateSerde,
  PlainDateTimeSerde,
  PolymorphicKeySerde,
  PrimitiveSerde,
  SuperstructSerde,
  ZodSerde,
  ZonedDateTimeSerde,
} from "./symbols";
import { q } from "./utils";

export function generateMetadataFile(config: Config, dbMeta: DbMetadata, meta: EntityDbMetadata): Code {
  const { entity, createdAt, updatedAt, deletedAt } = meta;

  const fields = generateFields(config, meta);

  Object.values(fields).forEach((code) => code.asOneline());

  const maybeBaseType = meta.baseClassName ? `"${meta.baseClassName}"` : undefined;
  // We want to put inheritanceType: sti/cti onto base classes as well
  const maybeInheritanceType = meta.inheritanceType ? `inheritanceType: "${meta.inheritanceType}",` : "";
  const maybeStiColumn = meta.stiDiscriminatorField ? `stiDiscriminatorField: "${meta.stiDiscriminatorField}",` : "";
  const maybeStiValue = meta.stiDiscriminatorValue ? `stiDiscriminatorValue: ${meta.stiDiscriminatorValue},` : "";
  // Force subtype `timestampFields` to be `undefined` to ensure all runtime code is reading from the baseMeta values.
  const maybeTimestampConfig = meta.baseClassName
    ? code`undefined!`
    : code`
    {
      createdAt: ${q(createdAt?.fieldName)},
      updatedAt: ${q(updatedAt?.fieldName)},
      deletedAt: ${q(deletedAt?.fieldName)},
    }
  `;

  return code`
    export const ${entity.metaName}: ${EntityMetadata}<${entity.name}> = {
      cstr: ${entity.typeForMetadataFile},
      type: "${entity.name}",
      baseType: ${maybeBaseType}, ${maybeInheritanceType} ${maybeStiColumn} ${maybeStiValue}
      idType: "${config.idType ?? "tagged-string"}",
      idDbType: "${meta.primaryKey.columnType}",
      tagName: "${meta.tagName}",
      tableName: "${meta.tableName}",
      fields: ${fields},
      allFields: {},
      orderBy: ${q(config.entities[meta.name]?.orderBy)},
      timestampFields: ${maybeTimestampConfig},
      config: ${entity.configConst},
      factory: ${imp(`new${entity.name}@./entities.ts`)},
      baseTypes: [],
      subTypes: [],
    };

    (${entity.name} as any).metadata = ${entity.metaName};
  `;
}

function generateFields(config: Config, dbMetadata: EntityDbMetadata): Record<string, Code> {
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
    let serde: Code;
    if (customSerde) {
      serde = code`new ${CustomSerdeAdapter}("${fieldName}", "${columnName}", "${columnType}", ${customSerde})`;
    } else if (superstruct) {
      serde = code`new ${SuperstructSerde}("${fieldName}", "${columnName}", ${superstruct})`;
    } else if (zodSchema) {
      serde = code`new ${ZodSerde}("${fieldName}", "${columnName}", ${zodSchema})`;
    } else if (columnType === "numeric") {
      serde = code`new ${DecimalToNumberSerde}("${fieldName}", "${columnName}")`;
    } else if (columnType === "jsonb") {
      serde = code`new ${JsonSerde}("${fieldName}", "${columnName}")`;
    } else if (fieldType === "bigint") {
      serde = code`new ${BigIntSerde}("${fieldName}", "${columnName}")`;
    } else {
      let serdeType: Import;
      if (columnType === "date") {
        serdeType = config.temporal ? PlainDateSerde : DateSerde;
      } else if (columnType === "timestamp without time zone") {
        serdeType = config.temporal ? PlainDateTimeSerde : DateSerde;
      } else if (columnType === "timestamp with time zone") {
        serdeType = config.temporal ? ZonedDateTimeSerde : DateSerde;
      } else {
        serdeType = PrimitiveSerde;
      }
      if (serdeType === PrimitiveSerde || serdeType === DateSerde) {
        serde = isArray
          ? code`new ${serdeType}("${fieldName}", "${columnName}", "${columnType}[]", true)`
          : code`new ${serdeType}("${fieldName}", "${columnName}", "${columnType}")`;
      } else {
        const timeZone = typeof config.temporal === "object" ? config.temporal.timeZone : "UTC";
        serde = isArray
          ? code`new ${serdeType}("${fieldName}", "${columnName}", "${columnType}[]", "${timeZone}", true)`
          : code`new ${serdeType}("${fieldName}", "${columnName}", "${columnType}", "${timeZone}")`;
      }
    }
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
        serde: ${serde},
        immutable: false,
        ${extras}
        ${maybeDefault(p)}
      }`;
  });

  // Treat native enums as primitives
  dbMetadata.pgEnums.forEach((p) => {
    const { columnName, fieldName, notNull, dbType } = p;
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
        ${maybeDefault(p)}
      }`;
  });

  dbMetadata.enums.forEach((field) => {
    const { fieldName, enumDetailType, notNull, isArray, columnName, columnType, derived } = field;
    const serdeType = isArray ? EnumArrayFieldSerde : EnumFieldSerde;
    const columnTypeWithArray = `${columnType}${isArray ? "[]" : ""}`;
    fields[fieldName] = code`
      {
        kind: "enum",
        fieldName: "${fieldName}",
        fieldIdName: undefined,
        required: ${notNull},
        derived: ${!derived ? false : `"${derived}"`},
        enumDetailType: ${enumDetailType},
        serde: new ${serdeType}("${fieldName}", "${columnName}", "${columnTypeWithArray}", ${enumDetailType}),
        immutable: false,
        ${maybeDefault(field)}
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
        ${maybeDefault(m2o)}
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

function maybeDefault(f: { hasConfigDefault: boolean; columnDefault?: any }): Code | "" {
  return f.hasConfigDefault ? code`default: "config",` : f.columnDefault ? code`default: "schema",` : "";
}
