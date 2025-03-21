import { Book } from "@src/entities";
import { knex } from "@src/testEm";
import { buildQuery } from "joist-knex";

describe("QueryParser", () => {
  it("quotes with abbreviation", () => {
    // This is technically testing the old knex-based flow/quoting...
    const q = buildQuery(knex, Book, { where: { author: { firstName: "jeff", schedules: { id: "4" } } } });
    expect(q.toSQL().sql).toEqual(
      [
        "select distinct b.*, b.title, b.id",
        " from books as b",
        " inner join authors as a on b.author_id = a.id",
        ' left outer join author_schedules as "as" on a.id = "as".author_id',
        " where b.deleted_at IS NULL",
        " AND a.deleted_at IS NULL",
        " AND a.first_name = ?",
        ' AND "as".id = ?',
        " order by b.title ASC, b.id ASC",
      ].join(""),
    );
  });
});
