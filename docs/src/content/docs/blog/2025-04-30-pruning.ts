async function getAuthors(filter: AuthorFilter): Promise<Author[]> {
  const { publisherId, publisherName, bookStatusId, highRating } = filter;
  const rows = await sql<Author[]>`
    SELECT DISTINCT ON (a.id) a.*
    FROM authors a
      ${publisherId || publisherName ? 'JOIN publishers p ON a.publisher_id = p.id' : ''}
      ${bookStatusId || highRating !== undefined ? 'LEFT JOIN books b ON a.id = b.author_id' : ''}
      ${highRating !== undefined ? 'LEFT JOIN book_reviews br ON b.id = br.book_id' : ''}
    WHERE 1 = 1
      ${publisherId ? sql`AND p.id = ${publisherId}` : sql``}
      ${publisherName ? sql`AND p.name = ${publisherName}` : sql``}
      ${bookStatusId ? sql`AND b.status_id = ${bookStatusId}` : sql``}
      ${highRating !== undefined ? sql`AND br.rating = ${highRating ? 3 : 1}` : sql``};
  `;
  // assume `a.*` matches our `Author` type
  return rows;
}
