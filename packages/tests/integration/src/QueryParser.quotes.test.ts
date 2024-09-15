import { Book } from "@src/entities";
import { knex } from "@src/testEm";
import { getMetadata, ParsedFindQuery, parseFindQuery } from "joist-orm";
import { buildKnexQuery } from "joist-orm/build/drivers/buildKnexQuery";

function generateSql(t: ParsedFindQuery) {
  return buildKnexQuery(knex, t, {}).toSQL().sql;
}

const bm = getMetadata(Book);

describe("QueryParser", () => {
  it("quotes with abbreviation", () => {
    expect(generateSql(parseFindQuery(bm, { author: { firstName: "jeff", schedules: { id: 4 } } }))).toEqual(
      [
        'select distinct b.*, b.title, b.id',
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
