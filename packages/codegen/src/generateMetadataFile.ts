import { code, Code, imp } from "ts-poet";
import { Config } from "./config";
import { EntityDbMetadata } from "./EntityDbMetadata";
import {
  DecimalToNumberSerde,
  EntityMetadata,
  EnumArrayFieldSerde,
  EnumFieldSerde,
  ForeignKeySerde,
  PolymorphicKeySerde,
  PrimaryKeySerde,
  SimpleSerde,
  SuperstructSerde,
} from "./symbols";

export function generateMetadataFile(config: Config, dbMetadata: EntityDbMetadata): Code {
  const { entity } = dbMetadata;

  const { primaryKey, primitives, enums, m2o, polymorphics } = generateColumns(dbMetadata);
  const fields = generateFields(config, dbMetadata);

  return code`
    export const ${entity.metaName}: ${EntityMetadata}<${entity.type}> = {
      cstr: ${entity.type},
      type: "${entity.name}",
      tagName: "${config.entities[entity.name].tag}",
      tableName: "${dbMetadata.tableName}",
      columns: [ ${primaryKey} ${enums} ${primitives} ${m2o} ${polymorphics}],
      fields: ${fields},
      config: ${entity.configConst},
      factory: ${imp(`new${entity.name}@./entities`)},
    };

    (${entity.name} as any).metadata = ${entity.metaName};
  `;
}

function generateColumns(dbMetadata: EntityDbMetadata): {
  primaryKey: Code;
  primitives: Code[];
  enums: Code[];
  m2o: Code[];
  polymorphics: Code[];
} {
  const primaryKey = code`
    { fieldName: "id", columnName: "id", dbType: "int", serde: new ${PrimaryKeySerde}(() => ${dbMetadata.entity.metaName}, "id", "id") },
  `;

  const primitives = dbMetadata.primitives.map((p) => {
    const { fieldName, columnName, columnType, superstruct } = p;
    const serdeType = columnType === "numeric" ? DecimalToNumberSerde : SimpleSerde;
    if (superstruct) {
      return code`
        {
          fieldName: "${fieldName}",
          columnName: "${columnName}",
          dbType: "${columnType}",
          serde: new ${SuperstructSerde}("${fieldName}", "${columnName}", ${superstruct}),
        },
      `;
    } else {
      return code`
        {
          fieldName: "${fieldName}",
          columnName: "${columnName}",
          dbType: "${columnType}",
          serde: new ${serdeType}("${fieldName}", "${columnName}"),
        },
      `;
    }
  });

  const enums = dbMetadata.enums.map((e) => {
    const { fieldName, columnName, enumDetailType, isArray } = e;
    return code`
      {
        fieldName: "${fieldName}",
        columnName: "${columnName}",
        dbType: "int",
        serde: new ${
          isArray ? EnumArrayFieldSerde : EnumFieldSerde
        }("${fieldName}", "${columnName}", ${enumDetailType}),
      },
    `;
  });

  const m2o = dbMetadata.manyToOnes.map((m2o) => {
    const { fieldName, columnName, otherEntity } = m2o;
    return code`
      {
        fieldName: "${fieldName}",
        columnName: "${columnName}",
        dbType: "int",
        serde: new ${ForeignKeySerde}("${fieldName}", "${columnName}", () => ${otherEntity.metaName}),
      },
    `;
  });

  const polymorphics = dbMetadata.polymorphics.flatMap((m2o) => {
    const { fieldName, components } = m2o;
    return components.map(
      ({ columnName, otherEntity }) => code`
        {
          fieldName: "${fieldName}",
          columnName: "${columnName}",
          dbType: "int",
          serde: new ${PolymorphicKeySerde}("${fieldName}", "${columnName}", () => ${otherEntity.metaName}),
        },
      `,
    );
  });

  return { primaryKey, primitives, enums, m2o, polymorphics };
}

function generateFields(config: Config, dbMetadata: EntityDbMetadata): Record<string, Code> {
  const fields: Record<string, Code> = {};

  fields["id"] = code`
    { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true }
  `;

  dbMetadata.primitives.forEach((p) => {
    const { fieldName, derived } = p;
    fields[fieldName] = code`
      {
        kind: "primitive",
        fieldName: "${fieldName}",
        fieldIdName: undefined,
        derived: ${!derived ? false : `"${derived}"`},
        required: ${!derived && p.notNull},
        protected: ${p.protected},
        type: ${typeof p.rawFieldType === "string" ? `"${p.rawFieldType}"` : p.rawFieldType},
      }`;
  });

  dbMetadata.enums.forEach(({ fieldName, enumDetailType, notNull }) => {
    fields[fieldName] = code`
      {
        kind: "enum",
        fieldName: "${fieldName}",
        fieldIdName: undefined,
        required: ${notNull},
        enumDetailType: ${enumDetailType},
      }
    `;
  });

  dbMetadata.manyToOnes.forEach((m2o) => {
    const { fieldName, notNull, otherEntity, otherFieldName } = m2o;
    fields[fieldName] = code`
      {
        kind: "m2o",
        fieldName: "${fieldName}",
        fieldIdName: "${fieldName}Id",
        required: ${notNull},
        otherMetadata: () => ${otherEntity.metaName},
        otherFieldName: "${otherFieldName}",
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
        components: [ ${components.map(
          ({ otherFieldName, otherEntity, columnName }) => code`
          {
            otherMetadata: () => ${otherEntity.metaName},
            otherFieldName: "${otherFieldName}",
            columnName: "${columnName}",
          },`,
        )} ],
      }
    `;
  });

  return fields;
}
