import { Book } from "@src/entities";
import { getMetadata, ParsedFindQuery, parseFindQuery } from "joist-orm";
import { buildRawQuery } from "joist-orm/build/drivers/buildRawQuery";

function generateSql(t: ParsedFindQuery) {
  return buildRawQuery(t, {}).sql;
}

const bm = getMetadata(Book);

describe("QueryParser", () => {
  it("quotes with abbreviation", () => {
    expect(generateSql(parseFindQuery(bm, { author: { firstName: "jeff", schedules: { id: 4 } } }))).toEqual(
      [
        "SELECT b.*",
        " FROM books AS b",
        " JOIN authors AS a ON b.author_id = a.id",
        ' CROSS JOIN LATERAL (SELECT count(*) as _ FROM author_schedules AS "as" WHERE "as".id = ? AND a.id = "as".author_id) AS "as"',
        " WHERE b.deleted_at IS NULL",
        " AND a.deleted_at IS NULL",
        " AND a.first_name = ?",
        ' AND "as"._ > ?',
        " ORDER BY b.title ASC, b.id ASC",
      ].join(""),
    );
  });
});
