import { testDriver } from "src/testEm";

describe("FlushDatabase", () => {
  it("uses sequences for this schema", async () => {
    const result = await testDriver.sql`
      SELECT pg_get_functiondef(p.oid) AS source
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname = 'flush_database'
      AND n.nspname = 'public';
    `;
    const { source } = result[0];
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
             WHERE schemaname = 'public' AND last_value IS NOT NULL AND sequencename LIKE '%_id_seq' AND sequencename NOT IN ('advance_status_id_seq', 'book_range_id_seq', 'color_id_seq', 'image_type_id_seq', 'publisher_size_id_seq', 'publisher_type_id_seq', 'task_type_id_seq')
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
