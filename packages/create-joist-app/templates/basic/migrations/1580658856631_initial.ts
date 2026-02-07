import {
  createCreatedAtFunction,
  createEntityTable,
  createUpdatedAtFunction,
  foreignKey,
} from "joist-migration-utils";
import { MigrationBuilder } from "node-pg-migrate";

export function up(b: MigrationBuilder): void {
  createUpdatedAtFunction(b);
  createCreatedAtFunction(b);

  // Create flush_database function for test cleanup
  b.sql(`
    CREATE OR REPLACE FUNCTION flush_database() RETURNS void AS $$
    DECLARE
      tables CURSOR FOR
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename != 'pgmigrations';
    BEGIN
      FOR t IN tables LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(t.tablename) || ' CASCADE';
      END LOOP;
    END;
    $$ LANGUAGE plpgsql;
  `);

  createEntityTable(b, "authors", {
    first_name: { type: "varchar(255)", notNull: true },
    last_name: { type: "varchar(255)", notNull: false },
  });

  createEntityTable(b, "books", {
    title: { type: "varchar(255)", notNull: true },
    author_id: foreignKey("authors", { notNull: true }),
  });
}
