import { testDriver } from "src/testEm";

describe("FlushDatabase", () => {
  it("uses sequences for this schema", async () => {
    // Given entity tables and enum lookup tables share the public schema
    // When database reset chooses the sequences to clear
    const result = await testDriver.knex.raw(`
      SELECT pg_get_functiondef(p.oid) AS source
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname = 'flush_database'
      AND n.nspname = 'public';
    `);
    const { source } = result.rows[0];
    // Then entity sequences are reset while enum lookup rows remain available
    expect(source).toMatchInlineSnapshot(`
     "CREATE OR REPLACE FUNCTION public.flush_database()
      RETURNS void
      LANGUAGE plpgsql
     AS $function$
         DECLARE seq RECORD;
         BEGIN
           FOR seq IN
             SELECT sequencename AS name
             FROM pg_sequences
             WHERE schemaname = 'public' AND last_value IS NOT NULL AND sequencename LIKE '%_id_seq' AND sequencename NOT IN ('advance_status_id_seq', 'book_range_id_seq', 'color_id_seq', 'image_type_id_seq', 'publisher_size_id_seq', 'publisher_status_id_seq', 'publisher_type_id_seq', 'task_type_id_seq', 'migrations_id_seq')
           LOOP
             EXECUTE format('DELETE FROM %I', regexp_replace(seq.name, '_id_seq$', ''));
             EXECUTE format('ALTER SEQUENCE %I RESTART WITH 1', seq.name);
           END LOOP;
         END;
        $function$
     "
    `);
  });
});
