import { Table } from "pg-structure";
import { code, Code } from "ts-poet";
import { EntityDbMetadata, entityType, metaName } from "./EntityDbMetadata";
import { EntityMetadata, EnumFieldSerde, ForeignKeySerde, PrimaryKeySerde, SimpleSerde } from "./symbols";

export function generateMetadataFile(sortedEntities: string[], table: Table): Code {
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
