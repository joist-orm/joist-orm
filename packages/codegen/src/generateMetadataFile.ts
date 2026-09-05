import { type Code, type Import, code, imp } from "ts-poet";

import { type Config } from "./config.ts";
import {
  type DatabaseColumnType,
  type DbMetadata,
  type EntityDbMetadata,
  type OneToManyField,
  type PrimitiveField,
} from "./EntityDbMetadata.ts";
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
  PlainTimeSerde,
  PolymorphicKeySerde,
  PrimitiveSerde,
  SuperstructSerde,
  ZodSerde,
  ZonedDateTimeSerde,
} from "./symbols.ts";
import { mapSimpleDbTypeToTypescriptType, q } from "./utils.ts";

export function generateMetadataFile(config: Config, dbMeta: DbMetadata, meta: EntityDbMetadata): Code {
  const { entity, createdAt, updatedAt, deletedAt } = meta;

  const fields = generateFields(config, meta);

  Object.values(fields).forEach((code) => code.asOneline());

  const maybeBaseType = meta.baseClassName ? `"${meta.baseClassName}"` : undefined;
  // We want to put inheritanceType: sti/cti onto base classes as well
  const maybeInheritanceType = meta.inheritanceType ? `inheritanceType: "${meta.inheritanceType}",` : "";
  const maybeStiColumn = meta.stiDiscriminatorField ? `stiDiscriminatorField: "${meta.stiDiscriminatorField}",` : "";
  const maybeStiValue = meta.stiDiscriminatorValue ? `stiDiscriminatorValue: ${meta.stiDiscriminatorValue},` : "";
  const maybeCtiAbstract = meta.abstract ? `ctiAbstract: ${meta.abstract},` : "";
  // Force subtype `timestampFields` to be `undefined` to ensure all runtime code is reading from the baseMeta values.
  // Force subtype `timestampFields` to be `undefined` to ensure all runtime code is reading from the baseMeta values.
  const maybeTimestampConfig = meta.baseClassName
    ? code`undefined`
    : code`
    {
      createdAt: ${q(createdAt?.fieldName)},
      updatedAt: ${q(updatedAt?.fieldName)},
      deletedAt: ${q(deletedAt?.fieldName)},
    }
  `;
  const maybeInsertionOrder = meta.nonDeferredFkOrder !== 0 ? `nonDeferredFkOrder: ${meta.nonDeferredFkOrder},` : ``;
  const uniqueBy = getUniqueBy(config, meta);
  const maybeUniqueBy = uniqueBy.length > 0 ? code`uniqueBy: ${JSON.stringify(uniqueBy)},` : code``;

  return code`
    export const ${entity.metaName}: ${EntityMetadata}<${entity.name}> = {
      cstr: ${entity.typeForMetadataFile},
      type: "${entity.name}",
      baseType: ${maybeBaseType}, ${maybeInheritanceType} ${maybeStiColumn} ${maybeStiValue} ${maybeCtiAbstract}
      idType: "${config.idType ?? "tagged-string"}",
      idDbType: "${meta.primaryKey.columnType}",
      tagName: "${meta.tagName}",
      tableName: "${meta.tableName}",
      supportsEmExecute: ${!meta.inheritanceType && meta.supportsEmExecute === true},
      fields: ${fields},
      allFields: {},
      orderBy: ${q(config.entities[meta.name]?.orderBy)},
      timestampFields: ${maybeTimestampConfig},
      config: ${entity.configConst},
      factory: ${imp(`new${entity.name}@./entities.ts`)},
      baseTypes: [],
      subTypes: [], ${maybeInsertionOrder} ${maybeUniqueBy}
    };

    (${entity.typeForMetadataFile} as any).metadata = ${entity.metaName};
  `;
}

/** Returns configured identities plus conservative database-backed unique identities. */
function getUniqueBy(config: Config, meta: EntityDbMetadata): string[][] {
  const uniqueBy = config.entities[meta.name]?.uniqueBy ?? [];
  const seen = new Set<string>();
  return [...uniqueBy, ...(meta.uniqueConstraints ?? [])].filter((fields) => {
    const key = fields.join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function generateFields(config: Config, dbMetadata: EntityDbMetadata): Record<string, Code> {
  const fields: Record<string, Code> = {};

  fields["id"] = code`
    {
      kind: "primaryKey",
      fieldName: "id",
      fieldIdName: undefined,
      required: true,
      serde: new ${KeySerde}("${dbMetadata.tagName}", "id", "id", "${dbMetadata.primaryKey.columnType}", ${columnOptions(dbMetadata.primaryKey)}),
      immutable: true,
    }
  `;

  dbMetadata.primitives.forEach((p) => {
    const { fieldName, derived, columnName, columnType, superstruct, zodSchema, customSerde, isArray } = p;
    const column = columnOptions(p);
    let serde: Code;
    if (customSerde) {
      serde = isArray
        ? code`new ${CustomSerdeAdapter}("${fieldName}", "${columnName}", "${columnType}[]", ${customSerde}, true, ${!p.notNull}, ${column})`
        : code`new ${CustomSerdeAdapter}("${fieldName}", "${columnName}", "${columnType}", ${customSerde}, false, false, ${column})`;
    } else if (superstruct) {
      serde = code`new ${SuperstructSerde}("${fieldName}", "${columnName}", ${superstruct}, ${column})`;
    } else if (zodSchema) {
      serde = code`new ${ZodSerde}("${fieldName}", "${columnName}", ${zodSchema}, ${column})`;
    } else if (columnType === "numeric" || columnType === "decimal") {
      serde = isArray
        ? code`new ${DecimalToNumberSerde}("${fieldName}", "${columnName}", true, ${!p.notNull}, ${column})`
        : code`new ${DecimalToNumberSerde}("${fieldName}", "${columnName}", false, false, ${column})`;
    } else if (columnType === "jsonb") {
      serde = code`new ${JsonSerde}("${fieldName}", "${columnName}", ${column})`;
    } else if (p.rawFieldType === "bigint") {
      serde = isArray
        ? code`new ${BigIntSerde}("${fieldName}", "${columnName}", true, ${!p.notNull}, ${column})`
        : code`new ${BigIntSerde}("${fieldName}", "${columnName}", false, false, ${column})`;
    } else {
      let serdeType: Import;
      if (columnType === "date") {
        serdeType = config.temporal ? PlainDateSerde : DateSerde;
      } else if (columnType === "timestamp without time zone") {
        serdeType = config.temporal ? PlainDateTimeSerde : DateSerde;
      } else if (columnType === "timestamp with time zone") {
        serdeType = config.temporal ? ZonedDateTimeSerde : DateSerde;
      } else if (columnType === "time without time zone") {
        serdeType = config.temporal ? PlainTimeSerde : PrimitiveSerde;
      } else {
        serdeType = PrimitiveSerde;
      }
      serde = isArray
        ? code`new ${serdeType}("${fieldName}", "${columnName}", "${columnType}[]", true, ${!p.notNull}, ${column})`
        : code`new ${serdeType}("${fieldName}", "${columnName}", "${columnType}", false, false, ${column})`;
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
        ${p.lazy ? code`lazy: true,` : ""}
        ${extras}
        ${maybeDefault(p)}
        ${maybeSanitize(config, p)}
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
        serde: new ${PrimitiveSerde}("${fieldName}", "${columnName}", "${dbType}", false, false, ${columnOptions(p)}),
        immutable: false,
        ${maybeDefault(p)}
      }`;
  });

  dbMetadata.enums.forEach((field) => {
    const { fieldName, enumDetailType, notNull, isArray, columnName, columnType, derived } = field;
    const serdeType = isArray ? EnumArrayFieldSerde : EnumFieldSerde;
    const columnTypeWithArray = `${columnType}${isArray ? "[]" : ""}`;
    const maybeIsNullable = isArray ? `, ${!notNull}` : "";
    fields[fieldName] = code`
      {
        kind: "enum",
        fieldName: "${fieldName}",
        fieldIdName: undefined,
        required: ${notNull},
        derived: ${!derived ? false : `"${derived}"`},
        enumDetailType: ${enumDetailType},
        serde: new ${serdeType}("${fieldName}", "${columnName}", "${columnTypeWithArray}"${maybeIsNullable}, ${enumDetailType}, ${columnOptions(field)}),
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
        serde: new ${KeySerde}("${otherTagName}", "${fieldName}", "${columnName}", "${dbType}", ${columnOptions(m2o)}),
        immutable: false,
        ${maybeDefault(m2o)}
      }
    `;
  });

  dbMetadata.oneToManys.forEach((o2m) => {
    const { fieldName, singularName, otherEntity, otherFieldName, otherColumnName } = o2m;
    fields[fieldName] = code`
      {
        kind: "o2m",
        fieldName: "${fieldName}",
        fieldIdName: "${singularName}Ids",
        required: false,
        otherMetadata: () => ${otherEntity.metaName},
        otherFieldName: "${otherFieldName}",
        otherColumnName: "${otherColumnName}",
        serde: undefined,
        immutable: false,
        ${maybeOrderBy(o2m)}
        ${maybeSoftDeletes(o2m)}
      }
    `;
  });

  dbMetadata.largeOneToManys.forEach((o2m) => {
    const { fieldName, singularName, otherEntity, otherFieldName, otherColumnName } = o2m;
    fields[fieldName] = code`
      {
        kind: "lo2m",
        fieldName: "${fieldName}",
        fieldIdName: "${singularName}Ids",
        required: false,
        otherMetadata: () => ${otherEntity.metaName},
        otherFieldName: "${otherFieldName}",
        otherColumnName: "${otherColumnName}",
        serde: undefined,
        immutable: false,
      }
    `;
  });

  dbMetadata.manyToManys.forEach((m2m) => {
    const { fieldName, singularName, otherEntity, otherFieldName, derived } = m2m;
    fields[fieldName] = code`
      {
        kind: "m2m",
        fieldName: "${fieldName}",
        fieldIdName: "${singularName}Ids",
        required: false,
        derived: ${derived === "async" ? `"async"` : derived === "otherSide" ? `"otherSide"` : "false"},
        otherMetadata: () => ${otherEntity.metaName},
        otherFieldName: "${otherFieldName}",
        serde: undefined,
        immutable: false,
        joinTableName: "${m2m.joinTableName}",
        columnNames: ["${m2m.columnName}", "${m2m.otherColumnName}"],
        hasJoinTableId: ${m2m.hasJoinTableId},
        ${maybeSoftDeletes(m2m)}
      }
    `;
  });

  dbMetadata.manyToManyEnums.forEach((m2m) => {
    const { fieldName, enumDetailType } = m2m;
    fields[fieldName] = code`
      {
        kind: "m2mEnum",
        fieldName: "${fieldName}",
        fieldIdName: undefined,
        required: false,
        derived: false,
        enumDetailType: ${enumDetailType},
        serde: undefined,
        immutable: false,
        joinTableName: "${m2m.joinTableName}",
        columnNames: ["${m2m.columnName}", "${m2m.otherColumnName}"],
        hasJoinTableId: ${m2m.hasJoinTableId},
      }
    `;
  });

  dbMetadata.oneToOnes.forEach((o2o) => {
    const { fieldName, otherEntity, otherFieldName, otherColumnName } = o2o;
    fields[fieldName] = code`
      {
        kind: "o2o",
        fieldName: "${fieldName}",
        fieldIdName: "${fieldName}Id",
        required: false,
        otherMetadata: () => ${otherEntity.metaName},
        otherFieldName: "${otherFieldName}",
        otherColumnName: "${otherColumnName}",
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

/** Emits constructor options using codegen's existing column facts. */
function columnOptions(
  column: Pick<PrimitiveField, "notNull" | "columnGenerated"> & Partial<Pick<PrimitiveField, "columnDefault">>,
): Code {
  return code`{ sqlNullable: ${!column.notNull}, hasDefault: ${column.columnDefault != null && !column.columnGenerated}, isGenerated: ${column.columnGenerated} }`;
}

function maybeDefault(f: { hasConfigDefault: boolean; columnDefault?: number | boolean | string | null }): Code | "" {
  return f.hasConfigDefault ? code`default: "config",` : f.columnDefault != null ? code`default: "schema",` : "";
}

function maybeOrderBy(f: OneToManyField): Code | "" {
  return f.orderBy ? code`orderBy: { field: "${f.orderBy.field}", direction: "${f.orderBy.direction}" },` : "";
}

/** Emits the `softDeletes` config, i.e. `softDeletes: "include",`, for relations that opt out of hiding soft-deletes. */
function maybeSoftDeletes(f: { softDeletes: "include" | "exclude" | undefined }): Code | "" {
  return f.softDeletes ? code`softDeletes: "${f.softDeletes}",` : "";
}

/** We sanitize/cleanStringValue all varchars, unless opted out by the column default/arrays/custom serdes. */
function maybeSanitize(
  config: Config,
  f: { columnType: DatabaseColumnType; columnDefault?: any; isArray: boolean; customSerde: any },
): Code | "" {
  // Only strings need to maybe turn off their cleanStringValue sanitization, if the default="" or its an array
  return isString(config, f.columnType) && (f.columnDefault === "''" || f.isArray || f.customSerde)
    ? code`sanitize: false,`
    : "";
}

function isString(config: Config, columnType: DatabaseColumnType): boolean {
  return mapSimpleDbTypeToTypescriptType(config, columnType) === "string";
}
