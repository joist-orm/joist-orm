import { testDriver } from "src/testEm";

describe("FlushDatabase", () => {
  it("uses sequences for this schema", async () => {
    const result = await testDriver.knex.raw(`
      SELECT pg_get_functiondef(p.oid) AS source
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname = 'flush_database'
      AND n.nspname = 'public';
    `);
    const { source } = result.rows[0];
    expect(source).toMatchInlineSnapshot(`
     "CREATE OR REPLACE FUNCTION public.flush_database()
      RETURNS void
      LANGUAGE plpgsql
     AS $function$
         DECLARE seq_record RECORD; table_name TEXT; seq_name TEXT;
         BEGIN
           FOR seq_record IN
             SELECT sequencename
             FROM pg_sequences
             WHERE schemaname = 'public' AND last_value IS NOT NULL AND sequencename LIKE '%_id_seq' AND sequencename NOT IN ('advance_status_id_seq', 'book_range_id_seq', 'color_id_seq', 'image_type_id_seq', 'publisher_size_id_seq', 'publisher_type_id_seq', 'task_type_id_seq')
           LOOP
             seq_name := seq_record.sequencename;
             table_name := regexp_replace(seq_name, '_id_seq$', '');
             EXECUTE format('DELETE FROM %I', table_name);
             EXECUTE format('ALTER SEQUENCE %I RESTART WITH 1', seq_name);
           END LOOP;
         END;
        $function$
     "
    `);
  });
});
