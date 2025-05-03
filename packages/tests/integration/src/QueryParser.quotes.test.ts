import { Book } from "@src/entities";
import { knex } from "@src/testEm";
import { buildQuery } from "joist-knex";

describe("QueryParser", () => {
  it("quotes with abbreviation", () => {
    // This is technically testing the old knex-based flow/quoting...
    const q = buildQuery(knex, Book, { where: { author: { firstName: "jeff", schedules: { id: "4" } } } });
    expect(q.toSQL().sql).toEqual(
      [
        "SELECT b.*",
        " FROM books AS b",
        " JOIN authors AS a ON b.author_id = a.id",
        ' CROSS JOIN LATERAL (SELECT count(*) as _ FROM author_schedules AS "as" WHERE a.id = "as".author_id AND "as".id = ?) AS "as"',
        " WHERE b.deleted_at IS NULL",
        " AND a.deleted_at IS NULL",
        " AND a.first_name = ?",
        ' AND "as"._ > ?',
        " ORDER BY b.title ASC, b.id ASC",
      ].join(""),
    );
  });
});
