import { Table } from "pg-structure";
import { code, Code } from "ts-poet";
import { EntityDbMetadata } from "./EntityDbMetadata";
import { EntityMetadata, EnumFieldSerde, ForeignKeySerde, PrimaryKeySerde, SimpleSerde } from "./symbols";

export function generateMetadataFile(sortedEntities: string[], table: Table): Code {
  const dbMetadata = new EntityDbMetadata(table);
  const { entity } = dbMetadata;

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
          serde: new ${ForeignKeySerde}("${fieldName}", "${columnName}", () => ${otherEntity.metaName}),
        },
      `;
  });

  return code`
    export const ${entity.metaName}: ${EntityMetadata}<${entity.type}> = {
      cstr: ${entity.type},
      type: "${entity.name}",
      tableName: "${table.name}",
      columns: [ ${primaryKey} ${enums} ${primitives} ${m2o} ],
      order: ${sortedEntities.indexOf(entity.name)},
    };
    
    (${entity.name} as any).metadata = ${entity.metaName};
  `;
}
