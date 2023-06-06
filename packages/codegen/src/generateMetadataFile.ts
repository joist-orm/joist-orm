import {DbMetadata, EnumField, ManyToOneField, PrimitiveField} from "index";
import { code, Code, imp } from "ts-poet";
import { Config } from "./config";
import {EntityDbMetadata, PgEnumField, PolymorphicField} from "./EntityDbMetadata";
import {
  DecimalToNumberSerde,
  EntityMetadata,
  EnumArrayFieldSerde,
  EnumFieldSerde,
  KeySerde,
  PolymorphicKeySerde,
  PrimitiveSerde,
  SuperstructSerde,
} from "./symbols";
import { q } from "./utils";

export function generateMetadataFile(config: Config, dbMeta: DbMetadata, meta: EntityDbMetadata): Code {
  const { entity, createdAt, updatedAt, deletedAt } = meta;

  const fields = generateFields(config, meta);

  Object.values(fields).forEach((code) => code.asOneline());

  const maybeBaseType = meta.baseClassName ? `"${meta.baseClassName}"` : undefined;

  return code`
    export const ${entity.metaName}: ${EntityMetadata}<${entity.type}> = {
      cstr: ${entity.type},
      type: "${entity.name}",
      baseType: ${maybeBaseType},
      idType: "${meta.primaryKey.columnType}",
      idTagged: ${config.idType !== "untagged-string"},
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

function generateBaseFieldSerdeOpts(dbMetadata: EntityDbMetadata, field: PolymorphicField | PrimitiveField | PgEnumField | EnumField | ManyToOneField) {
  // The `as never` isn't great, but the alternative is separating splitting
  // FieldSerde for PolymorphicFields vs all others
  const columnName = 'columnName' in field ? code`"${field.columnName}"` : code`undefined as never`;
  const dbType = 'dbType' in field ? code`"${field.dbType}"` :'enumName' in field ? code`"${field.enumName}"` : 'columnType' in field ? code`"${field.columnType}"` : code`undefined as never`;

  return code`
      fieldName: "${field.fieldName}",
      columnName: ${columnName},
      dbType: ${dbType},
      tagName: "${dbMetadata.tagName}",
  `
}

function generateFields(config: Config, dbMetadata: EntityDbMetadata): Record<string, Code> {
  const fields: Record<string, Code> = {};

  fields["id"] = code`
    {
      kind: "primaryKey",
      fieldName: "id",
      fieldIdName: undefined,
      required: true,
      serde: new ${KeySerde}({
        fieldName: "id",
        columnName: "id",
        dbType: "${dbMetadata.primaryKey.columnType}",
        tagName: "${dbMetadata.tagName}"
      }),
      immutable: true,
    }
  `;

  dbMetadata.primitives.forEach((field) => {
    const { fieldName, derived, columnName, columnType, superstruct } = field;
    const serdeType = superstruct
      ? code`new ${SuperstructSerde}({ ${generateBaseFieldSerdeOpts(dbMetadata, field)} superstruct: ${superstruct} })`
      : columnType === "numeric"
      ? code`new ${DecimalToNumberSerde}({ ${generateBaseFieldSerdeOpts(dbMetadata, field)} })`
      : code`new ${PrimitiveSerde}({ ${generateBaseFieldSerdeOpts(dbMetadata, field)} })`;
    fields[fieldName] = code`
      {
        kind: "primitive",
        fieldName: "${fieldName}",
        fieldIdName: undefined,
        derived: ${!derived ? false : `"${derived}"`},
        required: ${!derived && field.notNull},
        protected: ${field.protected},
        type: ${typeof field.rawFieldType === "string" ? `"${field.rawFieldType}"` : field.rawFieldType},
        serde: ${serdeType},
        immutable: false,
      }`;
  });

  // Treat native enums as primitives
  dbMetadata.pgEnums.forEach((field) => {
    fields[field.fieldName] = code`
      {
        kind: "primitive",
        fieldName: "${field.fieldName}",
        fieldIdName: undefined,
        derived: false,
        required: ${field.notNull},
        protected: false,
        type: "string",
        serde: new ${PrimitiveSerde}({ ${generateBaseFieldSerdeOpts(dbMetadata, field)} }),
        immutable: false,
      }`;
  });

  dbMetadata.enums.forEach((field) => {
    fields[field.fieldName] = code`
      {
        kind: "enum",
        fieldName: "${field.fieldName}",
        fieldIdName: undefined,
        required: ${field.notNull},
        enumDetailType: ${field.enumDetailType},
        serde: new ${
          field.isArray ? EnumArrayFieldSerde : EnumFieldSerde
        }({ ${generateBaseFieldSerdeOpts(dbMetadata, field)} enumObject: ${field.enumDetailType } }),
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
        serde: new ${KeySerde}({ ${generateBaseFieldSerdeOpts(dbMetadata, m2o)} otherTagName: "${otherTagName}" }),
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
        serde: new ${PolymorphicKeySerde}({ ${generateBaseFieldSerdeOpts(dbMetadata, p)} meta: () => ${dbMetadata.entity.metaName} }),
        immutable: false,
      }
    `;
  });

  return fields;
}
