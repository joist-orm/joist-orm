import { Table } from "pg-structure";
import { code, Code } from "ts-poet";
import { EntityDbMetadata } from "./EntityDbMetadata";
import { EntityMetadata, EnumFieldSerde, ForeignKeySerde, PrimaryKeySerde, SimpleSerde } from "./symbols";
import { isDerived } from "./generateEntityCodegenFile";
import { Config } from "./index";

export function generateMetadataFile(config: Config, table: Table): Code {
  const dbMetadata = new EntityDbMetadata(table);
  const { entity } = dbMetadata;

  const { primaryKey, primitives, enums, m2o } = generateColumns(dbMetadata);
  const { primaryKeyField, primitiveFields, enumFields, m2oFields, o2mFields, m2mFields } = generateFields(
    config,
    dbMetadata,
  );

  return code`
    export const ${entity.metaName}: ${EntityMetadata}<${entity.type}> = {
      cstr: ${entity.type},
      type: "${entity.name}",
      tableName: "${table.name}",
      columns: [ ${primaryKey} ${enums} ${primitives} ${m2o} ],
      fields: [ ${primaryKeyField} ${enumFields} ${primitiveFields} ${m2oFields} ${o2mFields} ${m2mFields} ],
    };
    
    (${entity.name} as any).metadata = ${entity.metaName};
  `;
}

function generateColumns(
  dbMetadata: EntityDbMetadata,
): { primaryKey: Code; primitives: Code[]; enums: Code[]; m2o: Code[] } {
  const primaryKey = code`
    { fieldName: "id", columnName: "id", dbType: "int", serde: new ${PrimaryKeySerde}("id", "id") },
  `;

  const primitives = dbMetadata.primitives.map((p) => {
    const { fieldName, columnName, columnType } = p;
    return code`
      {
        fieldName: "${fieldName}",
        columnName: "${columnName}",
        dbType: "${columnType}",
        serde: new ${SimpleSerde}("${fieldName}", "${columnName}"),
      },`;
  });

  const enums = dbMetadata.enums.map((e) => {
    const { fieldName, columnName, enumDetailType } = e;
    return code`
      {
        fieldName: "${fieldName}",
        columnName: "${columnName}",
        dbType: "int",
        serde: new ${EnumFieldSerde}("${fieldName}", "${columnName}", ${enumDetailType}),
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

  return { primaryKey, primitives, enums, m2o };
}

function generateFields(
  config: Config,
  dbMetadata: EntityDbMetadata,
): {
  primaryKeyField: Code;
  primitiveFields: Code[];
  enumFields: Code[];
  m2oFields: Code[];
  o2mFields: Code[];
  m2mFields: Code[];
} {
  const primaryKeyField = code`
    { kind: "primaryKey", fieldName: "id", required: true },
  `;

  const primitiveFields = dbMetadata.primitives.map((p) => {
    const { fieldName } = p;
    return code`
      {
        kind: "primitive",
        fieldName: "${fieldName}",
        ${
          isDerived(config, dbMetadata.entity, fieldName)
            ? "derived: true, required: false,"
            : `required: ${p.notNull},`
        }
      },`;
  });

  const enumFields = dbMetadata.enums.map(({ fieldName, notNull }) => {
    return code`
      {
        kind: "enum",
        fieldName: "${fieldName}",
        required: ${notNull},
      },
    `;
  });

  const m2oFields = dbMetadata.manyToOnes.map((m2o) => {
    const { fieldName, notNull, otherEntity, otherFieldName } = m2o;
    return code`
      {
        kind: "m2o",
        fieldName: "${fieldName}",
        required: ${notNull},
        otherMetadata: () => ${otherEntity.metaName},
        otherFieldName: "${otherFieldName}",
      },
    `;
  });

  const o2mFields = dbMetadata.oneToManys.map((m2o) => {
    const { fieldName, otherEntity, otherFieldName } = m2o;
    return code`
      {
        kind: "o2m",
        fieldName: "${fieldName}",
        required: false,
        otherMetadata: () => ${otherEntity.metaName},
        otherFieldName: "${otherFieldName}",
      },
    `;
  });

  const m2mFields = dbMetadata.manyToManys.map((m2o) => {
    const { fieldName, otherEntity, otherFieldName } = m2o;
    return code`
      {
        kind: "m2m",
        fieldName: "${fieldName}",
        required: false,
        otherMetadata: () => ${otherEntity.metaName},
        otherFieldName: "${otherFieldName}",
      },
    `;
  });

  return { primaryKeyField, primitiveFields, enumFields, m2oFields, o2mFields, m2mFields };
}
