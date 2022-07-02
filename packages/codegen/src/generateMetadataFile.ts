import { DbMetadata } from "index";
import { code, Code, imp } from "ts-poet";
import { Config } from "./config";
import { EntityDbMetadata } from "./EntityDbMetadata";
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
  const { entity, createdAt, updatedAt } = meta;

  const fields = generateFields(config, meta);

  Object.values(fields).forEach((code) => code.asOneline());

  return code`
    export const ${entity.metaName}: ${EntityMetadata}<${entity.type}> = {
      cstr: ${entity.type},
      type: "${entity.name}",
      idType: "${meta.idDbType}",
      tagName: "${meta.tagName}",
      tableName: "${meta.tableName}",
      fields: ${fields},
      timestampFields: { createdAt: ${q(createdAt?.fieldName)}, updatedAt: ${q(updatedAt?.fieldName)} },
      config: ${entity.configConst},
      factory: ${imp(`new${entity.name}@./entities`)},
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
      serde: new ${KeySerde}("${dbMetadata.tagName}", "id", "id", "${dbMetadata.idDbType}"),
      immutable: true,
    }
  `;

  dbMetadata.primitives.forEach((p) => {
    const { fieldName, derived, columnName, columnType, superstruct } = p;
    const serdeType = superstruct
      ? code`new ${SuperstructSerde}("${fieldName}", "${columnName}", ${superstruct})`
      : columnType === "numeric"
      ? code`new ${DecimalToNumberSerde}("${fieldName}", "${columnName}")`
      : code`new ${PrimitiveSerde}("${fieldName}", "${columnName}", "${columnType}")`;
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
      }`;
  });

  // Treat native enums as primitives
  dbMetadata.pgEnums.forEach(({ columnName, fieldName, notNull, enumName }) => {
    fields[fieldName] = code`
      {
        kind: "primitive",
        fieldName: "${fieldName}",
        fieldIdName: undefined,
        derived: false,
        required: ${notNull},
        protected: false,
        type: "string",
        serde: new ${PrimitiveSerde}("${fieldName}", "${columnName}", "${enumName}"),
        immutable: false,
      }`;
  });

  dbMetadata.enums.forEach(({ fieldName, enumType, notNull, isArray, columnName }) => {
    fields[fieldName] = code`
      {
        kind: "enum",
        fieldName: "${fieldName}",
        fieldIdName: undefined,
        required: ${notNull},
        enumType: ${enumType},
        serde: new ${isArray ? EnumArrayFieldSerde : EnumFieldSerde}("${fieldName}", "${columnName}", ${enumType}),
        immutable: false,
      }
    `;
  });

  dbMetadata.manyToOnes.forEach((m2o) => {
    const { fieldName, columnName, notNull, otherEntity, otherFieldName, dbType } = m2o;
    const otherTagName = config.entities[otherEntity.name].tag;
    fields[fieldName] = code`
      {
        kind: "m2o",
        fieldName: "${fieldName}",
        fieldIdName: "${fieldName}Id",
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

  dbMetadata.manyToManys.forEach((m2o) => {
    const { fieldName, singularName, otherEntity, otherFieldName } = m2o;
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
