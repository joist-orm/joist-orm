import { expectTypeOf } from "expect-type";
import {
  type DeleteStatement,
  type ExecuteResult,
  type Expr,
  type ExprLike,
  type InsertStatement,
  type InsertValues,
  type Query,
  type SetQuery,
  type UpdateStatement,
  type UpdateValues,
  alias,
  aliases,
  query,
  sql,
} from "joist-orm";
import {
  AdminUser,
  Author,
  type AuthorId,
  AuthorStat,
  Book,
  type BookId,
  BookRange,
  Color,
  Comment,
  FavoriteShape,
  LargePublisher,
  Publisher,
  PublisherGroup,
  type PublisherId,
  SmallPublisher,
  SmallPublisherGroup,
  Tag,
  type TagId,
  Task,
  TaskNew,
  TaskOld,
  User,
} from "src/entities";
import { type Address, type IpAddress, PasswordValue, type Quotes } from "src/entities/types";
import { newEntityManager } from "src/testEm";

describe("EntityManager.execute.types", () => {
  it("type-checks without executing statements", () => {
    // Given compile-time assertions containing valid and deliberately invalid SQL statements
    // When referencing the assertion function without calling it
    // Then loading this suite does not execute reads or mutations
    expect(typeof typeAssertions).toBe("function");
  });
});

/**
 * Checks immediate statement inputs and inferred envelopes through the public consumer declarations.
 * This function is never called; tsc checks expect-type assertions and each @ts-expect-error without a database.
 */
async function typeAssertions(broadSource: NonNullable<SetQuery["union"]>[number]) {
  // Given an EntityManager whose statements are checked but never executed
  const em = newEntityManager();
  // And aliases with distinct ID domains and physical field policies
  const [a, b, c, stat, tag] = aliases(Author, Book, Comment, AuthorStat, Tag);
  // And a persisted Author reference, not nested creation options or an unflushed entity
  const author = await em.load(Author, "a:1");
  // And branded IDs so wrong-entity assignments cannot hide behind unflavored strings
  const authorId: AuthorId = author.id;
  // And a Book ID for primary keys and same-entity references
  const bookId: BookId = "b:1";
  // And all Book SQL-required inputs, including fields with configuration-only defaults
  const values = {
    title: "Imported Book",
    author: authorId,
    notes: "Imported without hooks",
  } satisfies InsertValues<Book>;

  // When executing each operation without RETURNING
  // Then the whole envelope has a numeric command count and never[] rows
  expectTypeOf(em.execute({ insert: b, values })).resolves.toEqualTypeOf<{ rowCount: number; rows: never[] }>();
  expectTypeOf(em.execute({ update: b, set: { title: "Revised" }, where: b.id.eq(bookId) })).resolves.toEqualTypeOf<
    ExecuteResult<never>
  >();
  expectTypeOf(em.execute({ delete: b, where: b.id.eq(bookId) })).resolves.toEqualTypeOf<ExecuteResult<never>>();
  expectTypeOf(em.execute({ insert: b, values: [] })).resolves.toEqualTypeOf<ExecuteResult<never>>();

  // Given a reusable INSERT POJO checked without widening its RETURNING projection
  const insert = {
    insert: b,
    values,
    returning: { id: b.id, author: b.author, title: b.title },
  } satisfies InsertStatement<Book>;
  // And a reusable UPDATE with target-column arithmetic and scalar RETURNING
  const update = {
    update: b,
    set: { order: sql<number>`${b.order} + ${1}` },
    where: b.id.eq(bookId),
    returning: b.order,
  } satisfies UpdateStatement<Book>;
  // And a reusable physical DELETE whose nullable FK is returned as a scalar ID
  const deletion = {
    delete: b,
    where: b.id.eq(bookId),
    softDeletes: "include",
    returning: b.reviewer,
  } satisfies DeleteStatement<Book>;
  // When executing these POJOs without explicit execution type arguments
  // Then satisfies retains exact scalar and POJO envelopes, including ID flavors and SQL NULL
  expectTypeOf(em.execute(insert)).resolves.toEqualTypeOf<
    ExecuteResult<{ id: BookId; author: AuthorId; title: string }>
  >();
  expectTypeOf(em.execute(update)).resolves.toEqualTypeOf<ExecuteResult<number>>();
  expectTypeOf(em.execute(deletion)).resolves.toEqualTypeOf<ExecuteResult<AuthorId | null>>();
  expectTypeOf(em.execute({ ...insert, returning: undefined })).resolves.toEqualTypeOf<ExecuteResult<never>>();

  // Given a runtime choice between mutations with different RETURNING shapes
  const chosenMutation = Math.random() > 0.5 ? insert : deletion;
  // When inferring the choice without an explicit execution result type
  // Then the envelope retains both possible row shapes
  expectTypeOf(em.execute(chosenMutation)).resolves.toEqualTypeOf<
    ExecuteResult<{ id: BookId; author: AuthorId; title: string } | AuthorId | null>
  >();

  // When fresh statements return required scalars, nullable scalars, or named expressions
  // Then all mutation forms infer decoded values rather than entities or { value: ... } wrappers
  expectTypeOf(em.execute({ insert: b, values, returning: b.id })).resolves.toEqualTypeOf<ExecuteResult<BookId>>();
  expectTypeOf(em.execute({ insert: b, values, returning: b.acknowledgements })).resolves.toEqualTypeOf<
    ExecuteResult<string | null>
  >();
  expectTypeOf(
    em.execute({
      update: b,
      set: { acknowledgements: null },
      allowAll: true,
      returning: { title: b.title, acknowledgements: b.acknowledgements },
    }),
  ).resolves.toEqualTypeOf<ExecuteResult<{ title: string; acknowledgements: string | null }>>();
  expectTypeOf(
    em.execute({ delete: b, allowAll: true, returning: { id: b.id, reviewer: b.reviewer } }),
  ).resolves.toEqualTypeOf<ExecuteResult<{ id: BookId; reviewer: AuthorId | null }>>();
  expectTypeOf(em.execute({ delete: b, allowAll: true, returning: b.title })).resolves.toEqualTypeOf<
    ExecuteResult<string>
  >();
  expectTypeOf(em.execute({ insert: b, values: [], returning: b.id })).resolves.toEqualTypeOf<ExecuteResult<BookId>>();

  // Given readonly bulk rows with different optional keys and a permitted explicit serial primary key
  const bulk = [
    { ...values, id: bookId, author, order: undefined, acknowledgements: null },
    { ...values, order: sql<number>`DEFAULT`, prequel: bookId },
  ] as const;
  // And a scalar subquery whose source belongs to its own lexical scope
  const source = alias(Book, "source");
  // And a nullable title expression because the scalar query might select no row
  const sourceTitle = query({ from: source, select: source.title, limit: 1 });
  // When inserting bulk values or using an independent scalar subquery with a required-field fallback
  // Then optional omissions and SQL DEFAULT do not change result inference
  expectTypeOf(em.execute({ insert: b, values: bulk, returning: b.id })).resolves.toEqualTypeOf<
    ExecuteResult<BookId>
  >();
  expectTypeOf(
    em.execute({ insert: b, values: { ...values, title: sourceTitle.coalesce("Untitled") } }),
  ).resolves.toEqualTypeOf<ExecuteResult<never>>();
  expectTypeOf(
    em.execute({
      update: b,
      set: { title: b.title, reviewer: undefined, notes: sql<string>`DEFAULT` },
      where: { and: [b.author.eq(authorId), b.order.gt(0)] },
      softDeletes: "exclude",
    }),
  ).resolves.toEqualTypeOf<ExecuteResult<never>>();
  expectTypeOf(em.execute({ delete: b, where: sql<boolean>`true`, allowAll: true })).resolves.toEqualTypeOf<
    ExecuteResult<never>
  >();
  expectTypeOf(
    em.execute({ update: b, set: { acknowledgements: sourceTitle }, allowAll: true, returning: sourceTitle }),
  ).resolves.toEqualTypeOf<ExecuteResult<string | null>>();

  // Given an Author import with a required persisted derived field and timestamps omitted by convention
  const authorValues = { firstName: "Imported", numberOfBooks: 0 } satisfies InsertValues<Author>;
  // And native values for physical fields, including derived arrays and nullable enum storage
  const nativeValues = {
    ...authorValues,
    initials: "I",
    bookComments: null,
    nickNames: ["First"],
    nickNamesUpper: ["FIRST"],
    graduated: new Date(),
    numberOfAtoms: 1n,
    address: { street: "Main Street" },
    businessAddress: { street: "Office Street" },
    quotes: ["A quote"],
    certificate: new Uint8Array([1]),
    rangeOfBooks: BookRange.Few,
    favoriteColors: [Color.Red],
    favoriteShape: FavoriteShape.Circle,
    mentor: author,
    favoriteBook: bookId,
  } satisfies InsertValues<Author>;
  // And a RETURNING projection checked as a reusable POJO rather than an entity alias
  const nativeInsert = {
    insert: a,
    values: nativeValues,
    returning: {
      id: a.id,
      numberOfBooks: a.numberOfBooks,
      nickNames: a.nickNames,
      graduated: a.graduated,
      atoms: a.numberOfAtoms,
      address: a.address,
      businessAddress: a.businessAddress,
      quotes: a.quotes,
      certificate: a.certificate,
      range: a.rangeOfBooks,
      colors: a.favoriteColors,
      shape: a.favoriteShape,
      publisher: a.publisher,
      createdAt: a.createdAt,
    },
  } satisfies InsertStatement<Author>;
  // When inserting native values and explicitly backfilling persisted derived columns
  // Then decoding preserves native values, array elements, ID domains, and physical nullability
  expectTypeOf(em.execute(nativeInsert)).resolves.toEqualTypeOf<
    ExecuteResult<{
      id: AuthorId;
      numberOfBooks: number;
      nickNames: string[] | null;
      graduated: Date | null;
      atoms: bigint | null;
      address: Address | null;
      businessAddress: { street: string } | null;
      quotes: Quotes | null;
      certificate: Uint8Array | null;
      range: BookRange | null;
      colors: Color[] | null;
      shape: FavoriteShape | null;
      publisher: PublisherId | null;
      createdAt: Date;
    }>
  >();
  expectTypeOf(
    em.execute({
      update: a,
      set: { numberOfBooks: 2, initials: "AB", nickNamesUpper: ["A"], favoriteBook: bookId },
      allowAll: true,
      returning: a.numberOfBooks,
    }),
  ).resolves.toEqualTypeOf<ExecuteResult<number>>();
  expectTypeOf(
    em.execute({
      update: a,
      set: {
        favoriteColors: null,
        address: null,
        businessAddress: null,
        quotes: null,
        graduated: null,
        numberOfAtoms: null,
        certificate: null,
        mentor: null,
      },
      allowAll: true,
      returning: a.favoriteColors,
    }),
  ).resolves.toEqualTypeOf<ExecuteResult<Color[] | null>>();
  expectTypeOf(
    em.execute({ update: a, set: { favoriteColors: [] }, allowAll: true, returning: a.favoriteColors }),
  ).resolves.toEqualTypeOf<ExecuteResult<Color[] | null>>();
  expectTypeOf(
    em.execute({
      insert: stat,
      values: {
        smallint: 1,
        integer: 1,
        bigint: 1n,
        decimal: 1.5,
        real: 1.5,
        doublePrecision: 1.5,
        json: { imported: true },
      },
      returning: stat.decimal,
    }),
  ).resolves.toEqualTypeOf<ExecuteResult<number>>();
  expectTypeOf(
    em.execute({ update: stat, set: { json: null }, allowAll: true, returning: stat.json }),
  ).resolves.toEqualTypeOf<ExecuteResult<Object | null>>();
  expectTypeOf(
    em.execute({ update: stat, set: { json: sql<object>`'null'::jsonb` }, allowAll: true, returning: stat.bigint }),
  ).resolves.toEqualTypeOf<ExecuteResult<bigint>>();

  // Given the actual custom-value fields of User, whose inherited target remains excluded below
  // When inspecting assignment types without claiming User is an executable mutation target
  // Then native objects and branded strings are not replaced by their database representation
  expectTypeOf<UpdateValues<User>["password"]>().toEqualTypeOf<
    PasswordValue | ExprLike<PasswordValue | null> | null | undefined
  >();
  expectTypeOf<User["passwordHistory"]>().toEqualTypeOf<PasswordValue[] | undefined>();
  expectTypeOf<UpdateValues<User>["passwordHistory"]>().toEqualTypeOf<
    PasswordValue[] | ExprLike<PasswordValue[] | null> | null | undefined
  >();
  expectTypeOf<AuthorStat["decimalSamples"]>().toEqualTypeOf<number[] | undefined>();
  expectTypeOf<AuthorStat["bigintSamples"]>().toEqualTypeOf<bigint[] | undefined>();
  expectTypeOf(
    em.execute({
      update: stat,
      set: { decimalSamples: [1.25], bigintSamples: [9007199254740993n] },
      allowAll: true,
      returning: { decimal: stat.decimalSamples, bigint: stat.bigintSamples },
    }),
  ).resolves.toEqualTypeOf<ExecuteResult<{ decimal: number[] | null; bigint: bigint[] | null }>>();
  const user = alias(User);
  expectTypeOf(
    em.execute({
      insert: tag,
      values: { name: "Password audit" },
      returning: query({ from: user, select: user.passwordHistory, limit: 1 }),
    }),
  ).resolves.toEqualTypeOf<ExecuteResult<PasswordValue[] | null>>();
  // @ts-expect-error: numeric samples retain number elements
  em.execute({ update: stat, set: { decimalSamples: ["1.25"] }, allowAll: true });
  // @ts-expect-error: bigint samples cannot accept potentially imprecise numbers
  em.execute({ update: stat, set: { bigintSamples: [1] }, allowAll: true });
  // @ts-expect-error: custom array elements are PasswordValue objects, not encoded strings
  user.passwordHistory.eq(["encoded"]);
  expectTypeOf<InsertValues<User>["ipAddress"]>().toEqualTypeOf<
    IpAddress | ExprLike<IpAddress | null> | null | undefined
  >();
  expectTypeOf<InsertValues<Book>["author"]>().toEqualTypeOf<Author | AuthorId | ExprLike<AuthorId>>();
  expectTypeOf<UpdateValues<Book>["reviewer"]>().toEqualTypeOf<
    Author | AuthorId | ExprLike<AuthorId | null> | null | undefined
  >();
  expectTypeOf<InsertValues<Author>["numberOfBooks"]>().toEqualTypeOf<number | ExprLike<number>>();
  expectTypeOf<InsertValues<Book>["createdAt"]>().toEqualTypeOf<Date | ExprLike<Date> | undefined>();

  // Given a reusable read POJO selecting every required Book field in domain names
  const sourceRead = {
    from: source,
    where: source.author.eq(authorId),
    select: { title: source.title, author: source.author, notes: source.notes },
    orderBy: { title: "ASC" },
    limit: 2,
    offset: 1,
  } satisfies Query;
  // And the same named columns reordered through a reusable query value
  const sourceValue = query({
    from: source,
    select: { notes: source.notes, title: source.title, author: source.author },
  });
  // And a compound source retaining both branches and their matching output domains
  const compound = { unionAll: [sourceRead, sourceValue], orderBy: { title: "DESC" }, limit: 3 } satisfies SetQuery;
  // And a reusable INSERT SELECT annotation that retains its concrete source type
  const insertSelect = {
    insert: b,
    from: sourceRead,
    returning: { id: b.id, title: b.title },
  } satisfies InsertStatement<Book, { id: typeof b.id; title: typeof b.title }, typeof sourceRead>;
  // When inserting from ordinary reads, reusable read values, or compound reads
  // Then RETURNING describes the target row, independently of the source projection
  expectTypeOf(em.execute(insertSelect)).resolves.toEqualTypeOf<ExecuteResult<{ id: BookId; title: string }>>();
  expectTypeOf(em.execute({ insert: b, from: sourceValue, returning: b.id })).resolves.toEqualTypeOf<
    ExecuteResult<BookId>
  >();
  expectTypeOf(em.execute({ insert: b, from: compound })).resolves.toEqualTypeOf<ExecuteResult<never>>();
  expectTypeOf(em.execute({ insert: b, from: query(compound), returning: b.title })).resolves.toEqualTypeOf<
    ExecuteResult<string>
  >();
  expectTypeOf(
    em.execute({ insert: tag, from: { from: a, select: { name: a.firstName } }, returning: tag.id }),
  ).resolves.toEqualTypeOf<ExecuteResult<TagId>>();
  expectTypeOf(
    em.execute({
      insert: a,
      from: { from: a, select: { firstName: a.firstName, numberOfBooks: a.numberOfBooks, lastName: a.lastName } },
      returning: a.lastName,
    }),
  ).resolves.toEqualTypeOf<ExecuteResult<string | null>>();

  // Given a POJO compound selecting Author IDs from both primary and foreign keys
  const authorIds = query({
    unionAll: [
      { from: a, select: { id: a.id } },
      { from: source, select: { id: source.author } },
    ],
  });
  // And an ordinary scalar wrapper naming the compound's ID column for assignment and membership
  const scalarIds = query({ from: authorIds, select: authorIds.id });
  // When using the compound through its scalar wrapper rather than treating it as an expression
  // Then a required FK needs a fallback, while IN can consume the nullable scalar-query type
  expectTypeOf(
    em.execute({
      update: b,
      set: { author: scalarIds.coalesce(authorId) },
      where: b.author.in(scalarIds),
      returning: b.author,
    }),
  ).resolves.toEqualTypeOf<ExecuteResult<AuthorId>>();

  // Given a reusable scalar-select POJO, not a scalar query() expression
  const scalarRead = { from: a, select: a.age } satisfies Query;
  // And an entity-mode read value whose existing hydration semantics remain valid for reads only
  const entityRead = query({ from: b, select: b });
  // When executing the read inputs supported by em.query through the metadata-bearing API
  // Then selected rows keep their ordinary scalar, POJO, entity, and LEFT join nullability
  expectTypeOf(em.execute({ from: b, select: b.title })).resolves.toEqualTypeOf<ExecuteResult<string>>();
  expectTypeOf(em.execute(scalarRead)).resolves.toEqualTypeOf<ExecuteResult<number | null>>();
  expectTypeOf(em.execute(sourceRead)).resolves.toEqualTypeOf<
    ExecuteResult<{ title: string; author: AuthorId; notes: string }>
  >();
  expectTypeOf(em.execute(sourceValue)).resolves.toEqualTypeOf<
    ExecuteResult<{ notes: string; title: string; author: AuthorId }>
  >();
  expectTypeOf(em.execute(compound)).resolves.toEqualTypeOf<
    ExecuteResult<{ title: string; author: AuthorId; notes: string }>
  >();
  expectTypeOf(em.execute(query(compound))).resolves.toEqualTypeOf<
    ExecuteResult<{ title: string; author: AuthorId; notes: string }>
  >();
  expectTypeOf(em.execute({ from: b, select: b })).resolves.toEqualTypeOf<ExecuteResult<Book>>();
  expectTypeOf(em.execute(entityRead)).resolves.toEqualTypeOf<ExecuteResult<Book>>();
  expectTypeOf(em.execute({ from: a, join: [a.books.left(b)], select: b.title })).resolves.toEqualTypeOf<
    ExecuteResult<string | null>
  >();
  expectTypeOf(
    em.execute({
      from: a,
      join: [a.books.left(b)],
      select: { id: a.id, title: b.title, fallback: b.title.coalesce("None") },
    }),
  ).resolves.toEqualTypeOf<ExecuteResult<{ id: AuthorId; title: string | null; fallback: string }>>();
  expectTypeOf(sourceTitle).toEqualTypeOf<Expr<string | null, never>>();

  // When required SQL inputs are missing, undefined, null, or given the wrong native domain
  // Then configuration defaults, factories, and ORM-derived flags do not relax physical constraints
  // @ts-expect-error: Book.title is SQL-required
  em.execute({ insert: b, values: { author: authorId, notes: "Imported" } });
  // @ts-expect-error: Book.author has only a configuration default
  em.execute({ insert: b, values: { title: "Imported", notes: "Imported" } });
  // @ts-expect-error: Book.notes has only a configuration default
  em.execute({ insert: b, values: { title: "Imported", author: authorId } });
  // @ts-expect-error: persisted derived Author.numberOfBooks is physically NOT NULL without a SQL default
  em.execute({ insert: a, values: { firstName: "Imported" } });
  // @ts-expect-error: every bulk row must supply the required Book fields
  em.execute({ insert: b, values: [values, { title: "Incomplete" }] });
  // @ts-expect-error: an empty row is not the supported empty-array shortcut
  em.execute({ insert: b, values: {} });
  // @ts-expect-error: undefined cannot omit required Book.notes
  em.execute({ insert: b, values: { ...values, notes: undefined } });
  // @ts-expect-error: null cannot replace required Book.author
  em.execute({ insert: b, values: { ...values, author: null } });
  // @ts-expect-error: null cannot replace a required scalar field
  em.execute({ update: b, set: { title: null }, allowAll: true });
  // @ts-expect-error: persisted derived columns retain physical NOT NULL
  em.execute({ update: a, set: { numberOfBooks: null }, allowAll: true });
  // @ts-expect-error: optional server-supplied timestamps are not nullable
  em.execute({ insert: b, values: { ...values, createdAt: null } });
  // @ts-expect-error: Book.order uses numbers, not strings
  em.execute({ update: b, set: { order: "1" }, allowAll: true });
  // @ts-expect-error: expression domains must match assignments
  em.execute({ update: b, set: { order: sql<string>`'1'` }, allowAll: true });
  // @ts-expect-error: zero-row scalar subqueries are nullable until a fallback is supplied
  em.execute({ insert: b, values: { ...values, title: sourceTitle } });
  // @ts-expect-error: Book IDs cannot satisfy an Author FK
  em.execute({ insert: b, values: { ...values, author: bookId } });
  // @ts-expect-error: nullable FKs still retain the Author ID brand
  em.execute({ update: b, set: { reviewer: bookId }, allowAll: true });
  // @ts-expect-error: an explicit INSERT primary key must have the target's ID brand
  em.execute({ insert: b, values: { ...values, id: authorId } });
  // @ts-expect-error: UPDATE cannot write a primary key, even to its current value
  em.execute({ update: b, set: { title: "Revised", id: bookId }, where: b.id.eq(bookId) });
  // @ts-expect-error: UPDATE key exclusion applies before pruning undefined
  em.execute({ update: b, set: { title: "Revised", id: undefined }, allowAll: true });
  // @ts-expect-error: a persisted Author is not a persisted Book reference
  em.execute({ update: b, set: { prequel: author }, allowAll: true });
  // @ts-expect-error: dates remain native Date values
  em.execute({ update: a, set: { graduated: "2026-01-01" }, allowAll: true });
  // @ts-expect-error: bigint inputs must not become numeric database representations
  em.execute({ update: a, set: { numberOfAtoms: 1 }, allowAll: true });
  // @ts-expect-error: arrays check each native element
  em.execute({ update: a, set: { nickNames: [1] }, allowAll: true });
  // @ts-expect-error: enum arrays cannot accept another enum's values
  em.execute({ update: a, set: { favoriteColors: [BookRange.Few] }, allowAll: true });
  // @ts-expect-error: enum scalar inputs are not enum arrays
  em.execute({ update: a, set: { rangeOfBooks: [BookRange.Few] }, allowAll: true });
  // @ts-expect-error: native enums reject arbitrary database strings
  em.execute({ update: a, set: { favoriteShape: "hexagon" }, allowAll: true });
  // @ts-expect-error: JSON domain fields retain their schema shape
  em.execute({ update: a, set: { address: { street: 1 } }, allowAll: true });
  // @ts-expect-error: Zod inputs retain required object properties
  em.execute({ update: a, set: { businessAddress: {} }, allowAll: true });
  // @ts-expect-error: structured arrays retain their element domain
  em.execute({ update: a, set: { quotes: [1] }, allowAll: true });
  // @ts-expect-error: binary values are native byte arrays, not encoded strings
  em.execute({ update: a, set: { certificate: "AQ==" }, allowAll: true });

  // Given assignment objects whose unknown fields survive beyond fresh-literal excess-property checks
  const unknownValues = { ...values, author_id: authorId };
  // And an UPDATE object containing a valid field beside an unsupported column name
  const unknownSet = { title: "Revised", author_id: authorId };
  // And a nonliteral bulk tuple that retains the second row's invalid field
  const unknownBulk = [values, unknownValues] as const;
  // When passing nonliteral assignments or ORM relationship inputs
  // Then only supported persisted domain fields can be written
  // @ts-expect-error: SQL column names are not domain field names
  em.execute({ insert: b, values: unknownValues });
  // @ts-expect-error: unknown fields must also be checked on reusable UPDATE objects
  em.execute({ update: b, set: unknownSet, allowAll: true });
  // @ts-expect-error: nonliteral bulk rows cannot hide unknown fields
  em.execute({ insert: b, values: unknownBulk });
  // @ts-expect-error: ID convenience properties are not physical domain fields
  em.execute({ update: b, set: { title: "Revised", authorId }, allowAll: true });
  // @ts-expect-error: nested creation is not a persisted reference
  em.execute({ insert: b, values: { ...values, author: { firstName: "New" } } });
  // @ts-expect-error: polymorphic references have no supported single-column assignment
  em.execute({ update: c, set: { parent: authorId }, allowAll: true });
  // @ts-expect-error: many-to-many collections cannot be assigned
  em.execute({ insert: b, values: { ...values, tags: [] } });
  // @ts-expect-error: inverse collections require ORM relationship processing
  em.execute({ update: a, set: { books: [] }, allowAll: true });
  // @ts-expect-error: inverse one-to-one references are not owning FKs
  em.execute({ update: b, set: { sequel: bookId }, allowAll: true });

  // Given nonliteral INSERT SELECT projections with missing, extra, nullable, or incompatible fields
  const missingSource = { from: source, select: { title: source.title, author: source.author } } satisfies Query;
  // And an extra key that is not a writable Book field
  const extraSource = { ...sourceRead, select: { ...sourceRead.select, name: source.title } } satisfies Query;
  // And an otherwise complete projection whose Author ID instead comes from Book.id
  const wrongIdSource = { ...sourceRead, select: { ...sourceRead.select, author: source.id } } satisfies Query;
  // And an otherwise complete projection with a physically nullable title
  const nullableSource = {
    ...sourceRead,
    select: { ...sourceRead.select, title: source.acknowledgements },
  } satisfies Query;
  // And required Book columns made nullable by the source's LEFT join
  const leftSource = { from: a, join: [a.books.left(source)], select: sourceRead.select } satisfies Query;
  // And a widened public read operand that no longer carries known output keys
  const widenedSource: NonNullable<SetQuery["union"]>[number] = sourceRead;
  // When validating INSERT SELECT without relying on fresh literal checks or only the first compound row
  // Then requiredness, exact field names, native domains, and every compound operand are checked
  // @ts-expect-error: a source must select every SQL-required target field
  em.execute({ insert: b, from: missingSource });
  // @ts-expect-error: a reusable source value cannot hide missing fields
  em.execute({ insert: b, from: query(missingSource) });
  // @ts-expect-error: named source keys must be writable target fields
  em.execute({ insert: b, from: extraSource });
  // @ts-expect-error: branded reusable read values retain unknown target keys
  em.execute({ insert: b, from: query(extraSource) });
  // @ts-expect-error: Book.id cannot supply an Author FK
  em.execute({ insert: b, from: wrongIdSource });
  // @ts-expect-error: a reusable source value retains its wrong ID domain
  em.execute({ insert: b, from: query(wrongIdSource) });
  // @ts-expect-error: nullable output cannot supply required Book.title
  em.execute({ insert: b, from: nullableSource });
  // @ts-expect-error: LEFT joins affect source nullability even for required fields
  em.execute({ insert: b, from: leftSource });
  // @ts-expect-error: the read value retains its LEFT-joined output nullability
  em.execute({ insert: b, from: query(leftSource) });
  // prettier-ignore
  // @ts-expect-error: source native arrays must match target element types
  em.execute({ insert: a, from: { from: a, select: { firstName: a.firstName, numberOfBooks: a.numberOfBooks, favoriteColors: a.nickNames } } });
  // @ts-expect-error: SQL-required persisted derived fields are also required in sources
  em.execute({ insert: a, from: { from: a, select: { firstName: a.firstName } } });
  // @ts-expect-error: a widened operand cannot prove the target's required keys or column domains
  em.execute({ insert: b, from: widenedSource });
  // @ts-expect-error: scalar sources need a named target key even for a one-required-field target
  em.execute({ insert: tag, from: { from: a, select: a.firstName } });
  // @ts-expect-error: scalar query values are expressions, not named INSERT sources
  em.execute({ insert: tag, from: query({ from: a, select: a.firstName }) });
  // @ts-expect-error: entity-mode SELECT is not a row-shaped INSERT source
  em.execute({ insert: b, from: { from: source, select: source } });
  // @ts-expect-error: entity query values cannot be INSERT sources
  em.execute({ insert: b, from: entityRead });
  // @ts-expect-error: a source alias alone has no selected target fields
  em.execute({ insert: b, from: source });
  // @ts-expect-error: every UNION ALL branch must contain all required keys
  em.execute({ insert: b, from: { unionAll: [sourceRead, missingSource] } });
  // @ts-expect-error: EXCEPT must validate its right branch despite retaining the left row
  em.execute({ insert: b, from: { except: [sourceRead, wrongIdSource] } });
  // @ts-expect-error: nested compounds must validate non-first branches
  em.execute({ insert: b, from: { union: [sourceRead, { intersect: [sourceRead, extraSource] }] } });
  // @ts-expect-error: a later UNION branch makes required title nullable
  em.execute({ insert: b, from: { union: [sourceRead, nullableSource] } });
  // @ts-expect-error: a compound still requires at least two known operands
  em.execute({ insert: b, from: { unionAll: [sourceRead] } });
  // @ts-expect-error: mixed scalar and POJO compound sources are excluded
  em.execute({ insert: b, from: { union: [sourceRead, { from: source, select: source.title }] } });
  // @ts-expect-error: compound source ordering only accepts output keys
  em.execute({ insert: b, from: { ...compound, orderBy: { missing: "ASC" } } });
  // @ts-expect-error: INSERT sources retain ordinary source-scope validation
  em.execute({ insert: b, from: { from: a, select: sourceRead.select } });

  // When expressions refer to rows absent from the mutation's lexical scope
  // Then INSERT VALUES has no target row, and UPDATE/RETURNING do not add implicit joins
  // @ts-expect-error: INSERT VALUES cannot read its target title directly
  em.execute({ insert: b, values: { ...values, title: b.title } });
  // @ts-expect-error: UPDATE SET cannot read an unrelated source alias
  em.execute({ update: b, set: { title: source.title }, allowAll: true });
  // @ts-expect-error: source scope is independent of target RETURNING scope
  em.execute({ insert: b, from: sourceRead, returning: source.id });

  // Given a nonliteral mutation carrying an unknown root clause
  const unknownStatement = { ...insert, typo: true };
  // And a valid read POJO spread together with an INSERT root
  const readMutation = { ...sourceRead, insert: b, values };
  // When mixing operation roots, assignments, read clauses, or future extension syntax
  // Then exactly one supported statement shape is accepted, including nonliteral POJOs
  // @ts-expect-error: unknown roots are not statements
  em.execute({ upsert: b, values });
  // @ts-expect-error: INSERT and UPDATE roots are mutually exclusive
  em.execute({ insert: b, values, update: b, set: { title: "Revised" }, allowAll: true });
  // @ts-expect-error: UPDATE and DELETE roots are mutually exclusive
  em.execute({ update: b, set: { title: "Revised" }, delete: b, allowAll: true });
  // @ts-expect-error: INSERT and DELETE roots are mutually exclusive
  em.execute({ insert: b, values, delete: b });
  // @ts-expect-error: an undefined second operation key is still an excluded root
  em.execute({ insert: b, values, delete: undefined });
  // @ts-expect-error: UNION cannot share a mutation root
  em.execute({ ...insert, union: [sourceRead, sourceRead] });
  // @ts-expect-error: UNION ALL cannot share a mutation root
  em.execute({ ...update, unionAll: [sourceRead, sourceRead] });
  // @ts-expect-error: INTERSECT cannot share a mutation root
  em.execute({ ...deletion, intersect: [sourceRead, sourceRead] });
  // @ts-expect-error: INTERSECT ALL cannot share a mutation root
  em.execute({ ...insert, intersectAll: [sourceRead, sourceRead] });
  // @ts-expect-error: EXCEPT cannot share a mutation root
  em.execute({ ...update, except: [sourceRead, sourceRead] });
  // @ts-expect-error: EXCEPT ALL cannot share a mutation root
  em.execute({ ...deletion, exceptAll: [sourceRead, sourceRead] });
  // @ts-expect-error: INSERT must choose VALUES or SELECT, not both
  em.execute({ insert: b, values, from: sourceRead });
  // @ts-expect-error: an undefined from key does not remove the second INSERT source
  em.execute({ insert: b, values, from: undefined });
  // @ts-expect-error: INSERT requires a source
  em.execute({ insert: b });
  // @ts-expect-error: UPDATE requires SET
  em.execute({ update: b, allowAll: true });
  // @ts-expect-error: DELETE has no assignments
  em.execute({ delete: b, set: { title: "Revised" }, allowAll: true });
  // @ts-expect-error: INSERT has no user target-row predicate
  em.execute({ insert: b, values, where: b.id.eq(bookId) });
  // @ts-expect-error: INSERT has no full-table guard opt-out
  em.execute({ insert: b, values, allowAll: true });
  // @ts-expect-error: INSERT has no target-row soft-delete policy
  em.execute({ insert: b, values, softDeletes: "include" });
  // @ts-expect-error: unknown nonliteral clauses must not escape through inference
  em.execute(unknownStatement);
  // @ts-expect-error: a read root cannot hide a mutation through another execute overload
  em.execute(readMutation);
  // @ts-expect-error: SELECT is not RETURNING
  em.execute({ ...insert, select: { id: b.id } });
  // @ts-expect-error: mutations have no implicit joins
  em.execute({ ...update, join: [b.author.as(a)] });
  // @ts-expect-error: GROUP BY is not a mutation clause
  em.execute({ ...update, groupBy: [b.title] });
  // @ts-expect-error: HAVING is not a mutation guard
  em.execute({ ...update, having: b.id.count().gt(0) });
  // @ts-expect-error: mutation roots cannot order affected rows
  em.execute({ ...deletion, orderBy: { id: "ASC" } });
  // @ts-expect-error: mutation roots cannot limit affected rows
  em.execute({ ...deletion, limit: 1 });
  // @ts-expect-error: mutation roots cannot offset affected rows
  em.execute({ ...deletion, offset: 1 });
  // @ts-expect-error: DISTINCT applies to reads, not mutation roots
  em.execute({ ...insert, distinct: true });
  // @ts-expect-error: mutation roots have no join-pruning policy
  em.execute({ ...update, pruneJoins: false });
  // @ts-expect-error: mutation roots are not named query values
  em.execute({ ...insert, as: "inserted" });
  // @ts-expect-error: conflict handling is excluded until supported explicitly
  em.execute({ ...insert, onConflict: { doNothing: true } });
  // @ts-expect-error: UPDATE FROM is excluded
  em.execute({ ...update, from: source });
  // @ts-expect-error: DELETE USING is excluded
  em.execute({ ...deletion, using: source });
  // @ts-expect-error: read CTE declarations are not implemented in PR2
  em.execute({ ...insert, with: { source: sourceValue } });
  // @ts-expect-error: data-modifying CTE declarations are also excluded
  em.execute({ ...deletion, with: { inserted: insert } });
  // @ts-expect-error: allowAll requires a boolean, not a truthy string
  em.execute({ ...update, allowAll: "true" });
  // @ts-expect-error: soft-delete policies are limited to include and exclude
  em.execute({ ...deletion, softDeletes: "only" });
  // @ts-expect-error: mutation predicates require boolean expressions
  em.execute({ ...update, where: sql<string>`'yes'` });

  // When RETURNING contains entity hydration, table-shaped values, or malformed projections
  // Then only one scalar expression or named expression fields are accepted
  // @ts-expect-error: a managed entity alias cannot be returned
  em.execute({ ...insert, returning: b });
  // @ts-expect-error: managed entity instances are not expressions
  em.execute({ ...insert, returning: author });
  // @ts-expect-error: entity read values cannot be RETURNING projections
  em.execute({ ...update, returning: entityRead });
  // @ts-expect-error: table-shaped POJO read values are not RETURNING projections
  em.execute({ ...deletion, returning: sourceValue });
  // @ts-expect-error: nested entity projections are not expression fields
  em.execute({ ...insert, returning: { book: b } });
  // @ts-expect-error: nested POJO read values are not scalar expressions
  em.execute({ ...insert, returning: { book: sourceValue } });
  // @ts-expect-error: named RETURNING fields cannot be raw domain values
  em.execute({ ...insert, returning: { title: "Imported" } });
  // @ts-expect-error: RETURNING arrays do not name their columns
  em.execute({ ...insert, returning: [b.id, b.title] });
  // @ts-expect-error: a RETURNING projection must contain at least one expression
  em.execute({ ...insert, returning: {} });
  // @ts-expect-error: null is not an omitted projection
  em.execute({ ...insert, returning: null });
  // @ts-expect-error: relation collections are not RETURNING expressions
  em.execute({ ...deletion, returning: { tags: b.tags } });

  // When targets are entities, relationships, read values, or inherited table families
  // Then mutation support is limited to ordinary non-inherited entity aliases
  // @ts-expect-error: an entity constructor is not an alias
  em.execute({ insert: Book, values });
  // @ts-expect-error: an entity instance is not a target alias
  em.execute({ delete: author, allowAll: true });
  // @ts-expect-error: a table-name string is not a target alias
  em.execute({ delete: "books", allowAll: true });
  // @ts-expect-error: a reference expression is not a target alias
  em.execute({ delete: b.author, allowAll: true });
  // @ts-expect-error: a collection join factory is not a target alias
  em.execute({ delete: a.books, allowAll: true });
  // @ts-expect-error: derived read tables are not writable targets
  em.execute({ delete: sourceValue, allowAll: true });
  // @ts-expect-error: entity read values are not writable targets
  em.execute({ delete: entityRead, allowAll: true });
  // @ts-expect-error: CTI bases are excluded even when only base-table fields are assigned
  em.execute({ update: alias(Publisher), set: { name: "Revised" }, allowAll: true });
  // @ts-expect-error: CTI SmallPublisher targets are excluded
  em.execute({ delete: alias(SmallPublisher), allowAll: true });
  // @ts-expect-error: CTI LargePublisher targets are excluded
  em.execute({ delete: alias(LargePublisher), allowAll: true });
  // @ts-expect-error: inherited PublisherGroup roots are excluded
  em.execute({ delete: alias(PublisherGroup), allowAll: true });
  // @ts-expect-error: inherited PublisherGroup subtypes are excluded
  em.execute({ delete: alias(SmallPublisherGroup), allowAll: true });
  // @ts-expect-error: STI base targets are excluded
  em.execute({ delete: alias(Task), allowAll: true });
  // @ts-expect-error: STI TaskNew targets are excluded
  em.execute({ delete: alias(TaskNew), allowAll: true });
  // @ts-expect-error: STI TaskOld targets are excluded
  em.execute({ delete: alias(TaskOld), allowAll: true });
  // @ts-expect-error: User belongs to an inherited table family despite owning custom-codec fields
  em.execute({ update: alias(User), set: { password: PasswordValue.fromPlainText("secret") }, allowAll: true });
  // @ts-expect-error: AdminUser subtype targets are excluded
  em.execute({ delete: alias(AdminUser), allowAll: true });

  // When mutations are passed to read APIs, query composition, or read execution overloads
  // Then neither reusable POJOs nor compound nesting can turn them into read values
  // @ts-expect-error: INSERT is not a query value
  query(insert);
  // @ts-expect-error: UPDATE is not a query value
  query(update);
  // @ts-expect-error: DELETE is not a query value
  query(deletion);
  // @ts-expect-error: em.query cannot execute INSERT
  em.query(insert);
  // @ts-expect-error: em.query cannot execute UPDATE
  em.query(update);
  // @ts-expect-error: em.query cannot execute DELETE
  em.query(deletion);
  // @ts-expect-error: nonliteral read/mutation hybrids are not read query values
  query(readMutation);
  // @ts-expect-error: nonliteral read/mutation hybrids are not executable reads
  em.query(readMutation);
  // @ts-expect-error: a mutation cannot be an ordinary read source
  em.execute({ from: insert, select: { id: b.id } });
  // @ts-expect-error: mutations cannot be INSERT SELECT sources either
  em.execute({ insert: b, from: insert });
  // @ts-expect-error: UNION operands cannot be mutations
  em.execute({ union: [sourceRead, insert] });
  // @ts-expect-error: UNION ALL operands cannot be mutations
  query({ unionAll: [sourceRead, update] });
  // @ts-expect-error: INTERSECT operands cannot be mutations
  em.query({ intersect: [sourceRead, deletion] });
  // @ts-expect-error: INTERSECT ALL operands cannot be mutations
  em.execute({ intersectAll: [sourceRead, insert] });
  // @ts-expect-error: EXCEPT operands cannot be mutations
  query({ except: [sourceRead, update] });
  // @ts-expect-error: EXCEPT ALL operands cannot be mutations
  em.execute({ exceptAll: [sourceRead, deletion] });
  // @ts-expect-error: nested compounds cannot hide mutation operands
  em.execute({ union: [sourceRead, { except: [sourceRead, insert] }] });
  // @ts-expect-error: read roots cannot carry RETURNING even without a mutation operation
  em.execute({ ...sourceRead, returning: b.id });
  // @ts-expect-error: read roots cannot carry VALUES without an INSERT operation
  query({ ...sourceRead, values });
  // @ts-expect-error: read roots cannot carry SET without an UPDATE operation
  em.query({ ...sourceRead, set: { title: "Revised" } });
  // @ts-expect-error: read roots have no mutation guard opt-out
  em.execute({ ...sourceRead, allowAll: true });
  // @ts-expect-error: scalar query() values are expressions, not execution inputs
  em.execute(sourceTitle);
  // @ts-expect-error: coalesce does not make an expression executable
  em.execute(sourceTitle.coalesce("Untitled"));
  // @ts-expect-error: modeled columns are not execution inputs
  em.execute(b.title);
  // @ts-expect-error: aggregate expressions are not execution inputs
  em.execute(b.id.count());
  // @ts-expect-error: arbitrary SQL expressions are not execution inputs
  em.execute(sql<number>`1`);
  // @ts-expect-error: scalar operands remain excluded from compound read execution
  em.execute({ union: [scalarRead, scalarRead] });
  // @ts-expect-error: ordinary read execution retains source-scope checks
  em.execute({ from: a, select: { title: b.title } });
  // @ts-expect-error: ordinary read ordering only addresses selected output keys
  em.execute({ from: a, select: { name: a.firstName }, orderBy: { age: "ASC" } });
  // @ts-expect-error: reads still require SELECT
  em.execute({ from: a });
  // @ts-expect-error: reads still require FROM
  em.execute({ select: { name: a.firstName } });

  // Given a function parameter retaining the full public SetOperand union, without initializer narrowing
  // When an INSERT source has no known target keys or field domains
  // Then execution cannot accept it as an already validated source
  // @ts-expect-error: the full SetOperand parameter cannot prove Book's required output fields
  em.execute({ insert: b, from: broadSource });

  // Given valid Book inputs passed to a function with union-typed parameters
  // When checking its body independently of these arguments
  // Then initializer narrowing cannot remove the invalid union alternatives from the assertions
  unionInputAssertions(sourceRead, values, [values]);

  // Given an otherwise compatible nonliteral source with unsupported CTE declarations
  const sourceWithCte = { ...sourceRead, with: { copied: sourceValue } };
  // And an otherwise compatible source carrying an unknown clause
  const sourceWithNonsense = { ...sourceRead, nonsense: true };
  // When INSERT SELECT validates source clauses beyond fresh-literal excess-property checks
  // Then named output compatibility does not authorize unsupported read syntax
  // @ts-expect-error: CTE declarations remain excluded on reusable INSERT sources
  em.execute({ insert: b, from: sourceWithCte });
  // @ts-expect-error: unknown clauses remain excluded on reusable INSERT sources
  em.execute({ insert: b, from: sourceWithNonsense });

  // Given a branded entity query spread together with a DELETE root
  const entityMutation = { ...entityRead, delete: b, allowAll: true };
  // And a branded entity query carrying an unsupported CTE declaration
  const entityWithCte = { ...entityRead, with: { copied: sourceValue } };
  // When overload resolution encounters a retained entity-query brand on a malformed read value
  // Then neither read execution API can bypass the mutation and extension exclusions
  // @ts-expect-error: an entity-query brand does not make a DELETE hybrid an executable read
  em.query(entityMutation);
  // @ts-expect-error: the entity-query execute overload must not accept a DELETE hybrid
  em.execute(entityMutation);
  // @ts-expect-error: an entity-query brand does not authorize CTE declarations
  em.query(entityWithCte);
  // @ts-expect-error: metadata-bearing entity reads also exclude CTE declarations
  em.execute(entityWithCte);

  // Given an INSERT annotation with an optional, readonly RETURNING projection
  let annotatedInsert: InsertStatement<Book, Readonly<typeof insert.returning>> = insert;
  // And an UPDATE annotation with an optional nullable scalar RETURNING expression
  const annotatedUpdate: UpdateStatement<Book, typeof b.reviewer> = {
    update: b,
    set: { reviewer: null },
    allowAll: true,
    returning: Math.random() > 0.5 ? b.reviewer : undefined,
  };
  // And a DELETE annotation that explicitly has no RETURNING projection
  const annotatedDelete: DeleteStatement<Book, undefined> = { delete: b, allowAll: true };
  // When execution infers results from annotations instead of required literal RETURNING properties
  // Then optional projections retain their row domains without undefined rows or readonly POJO fields
  expectTypeOf(em.execute(annotatedInsert)).resolves.toEqualTypeOf<
    ExecuteResult<{ id: BookId; author: AuthorId; title: string }>
  >();
  expectTypeOf(em.execute(annotatedUpdate)).resolves.toEqualTypeOf<ExecuteResult<AuthorId | null>>();
  expectTypeOf(em.execute(annotatedDelete)).resolves.toEqualTypeOf<ExecuteResult<never>>();

  // Given a nonliteral INSERT carrying an UPDATE/DELETE-only predicate
  const insertWithWhere = { ...insert, where: b.id.eq(bookId) };
  // And a nonliteral INSERT carrying the full-table mutation guard opt-out
  const insertWithAllowAll = { ...insert, allowAll: true };
  // And a nonliteral INSERT carrying a target-row soft-delete policy
  const insertWithSoftDeletes = { ...insert, softDeletes: "include" } as const;
  // When assigning these POJOs to a public InsertStatement annotation without calling execute
  // Then the annotation itself rejects clauses that only apply to existing target rows
  // @ts-expect-error: INSERT annotations exclude WHERE even on nonliteral assignments
  annotatedInsert = insertWithWhere;
  // @ts-expect-error: INSERT annotations exclude allowAll even on nonliteral assignments
  annotatedInsert = insertWithAllowAll;
  // @ts-expect-error: INSERT annotations exclude softDeletes even on nonliteral assignments
  annotatedInsert = insertWithSoftDeletes;

  // Given a one-column Tag source whose remaining columns have server-side providers
  const tagSource = { from: a, select: { name: a.firstName } } satisfies Query;
  // And the same Tag source represented by a reusable query value
  const tagSourceValue = query(tagSource);
  // And a Book INSERT annotation using the default source generic for an ordinary read POJO
  const defaultBookRead: InsertStatement<Book> = { insert: b, from: sourceRead };
  // And a Book INSERT annotation using the default source generic for a reusable query value
  const defaultBookValue: InsertStatement<Book> = { insert: b, from: sourceValue };
  // And a Tag INSERT annotation using the default source generic for its one-key read POJO
  const defaultTagRead: InsertStatement<Tag> = { insert: tag, from: tagSource };
  // And a Tag INSERT annotation using the default source generic for its reusable query value
  const defaultTagValue: InsertStatement<Tag> = { insert: tag, from: tagSourceValue };
  // When executing annotations without an explicit third Q parameter
  // Then ordinary sources do not acquire hypothetical LEFT join nullability from the default Query generic
  em.execute(defaultBookRead);
  em.execute(defaultBookValue);
  em.execute(defaultTagRead);
  em.execute(defaultTagValue);

  // When the same sources use satisfies instead of widening to the default annotation
  // Then source validation preserves the known absence of RETURNING and the never[] envelope
  expectTypeOf(em.execute({ insert: b, from: sourceRead } satisfies InsertStatement<Book>)).resolves.toEqualTypeOf<
    ExecuteResult<never>
  >();
  expectTypeOf(em.execute({ insert: b, from: sourceValue } satisfies InsertStatement<Book>)).resolves.toEqualTypeOf<
    ExecuteResult<never>
  >();
  expectTypeOf(em.execute({ insert: tag, from: tagSource } satisfies InsertStatement<Tag>)).resolves.toEqualTypeOf<
    ExecuteResult<never>
  >();
  expectTypeOf(em.execute({ insert: tag, from: tagSourceValue } satisfies InsertStatement<Tag>)).resolves.toEqualTypeOf<
    ExecuteResult<never>
  >();

  // Given a Book source whose explicit INNER join retains every required Book field
  const joinedSource = { ...sourceRead, join: [source.author.inner(a)] } satisfies Query;
  // And an INSERT annotation retaining that concrete join list through its third Q parameter
  const joinedInsert = {
    insert: b,
    from: joinedSource,
    returning: b.id,
  } satisfies InsertStatement<Book, typeof b.id, typeof joinedSource>;
  // When validating concrete joined sources rather than the default join-free source type
  // Then the INNER join is accepted while the existing LEFT-joined source retains its incompatible NULLs
  expectTypeOf(em.execute(joinedInsert)).resolves.toEqualTypeOf<ExecuteResult<BookId>>();
  // @ts-expect-error: an explicit Q must still reject LEFT-joined outputs for required Book fields
  em.execute({ insert: b, from: leftSource } satisfies InsertStatement<Book, undefined, typeof leftSource>);

  // Given valid target expressions and domain values passed to union-typed scope parameters
  // When the assertion function retains both valid and unrelated-source alternatives
  // Then no valid union member can hide another member's out-of-scope column
  unionScopeAssertions({ title: b.title }, values, b.title, { title: b.title });

  /** Retains every source and row alternative instead of narrowing to the structurally simpler valid input. */
  function unionInputAssertions(
    sourceOrExtra: typeof sourceRead | typeof extraSource,
    valuesOrExtra: typeof values | typeof unknownValues,
    rowsOrExtra: readonly (typeof values | typeof unknownValues)[],
  ) {
    // Given a source parameter that can select either valid Book fields or an extra name field
    // And a VALUES parameter that can contain an unsupported author_id field
    // And readonly bulk rows whose element union retains the unsupported field
    // When validating unions rather than only their shared field names
    // Then every possible source and assignment member must have supported target fields
    // @ts-expect-error: a valid source alternative cannot hide another alternative's extra output key
    em.execute({ insert: b, from: sourceOrExtra });
    // @ts-expect-error: a valid VALUES alternative cannot hide another alternative's unknown field
    em.execute({ insert: b, values: valuesOrExtra });
    // @ts-expect-error: readonly arrays must validate all keys in their row element union
    em.execute({ insert: b, values: rowsOrExtra });
  }

  /** Checks expression sources across every union member without initializer narrowing or casts. */
  function unionScopeAssertions(
    set: { title: typeof b.title } | { title: typeof source.title },
    row: typeof values | (Omit<typeof values, "title"> & { title: typeof b.title }),
    scalarReturning: typeof b.title | typeof source.title,
    pojoReturning: { title: typeof b.title } | { title: typeof source.title },
  ) {
    // Given same-key UPDATE alternatives reading either the target or an unrelated named Book alias
    // And INSERT alternatives supplying either a domain string or an existing target column
    // And scalar RETURNING alternatives reading either the target or the unrelated alias
    // And same-key POJO RETURNING alternatives with those same expression sources
    // When checking the aggregate expression sources instead of accepting any valid union branch
    // Then each mutation rejects the alternative outside its lexical scope
    // @ts-expect-error: a valid target SET expression cannot hide an unrelated source with the same key
    em.execute({ update: b, set, allowAll: true });
    // @ts-expect-error: a domain VALUES alternative cannot hide a target-column read before a row exists
    em.execute({ insert: b, values: row });
    // @ts-expect-error: scalar RETURNING must validate both expression-source alternatives
    em.execute({ delete: b, allowAll: true, returning: scalarReturning });
    // @ts-expect-error: same-key POJO RETURNING must validate both expression-source alternatives
    em.execute({ update: b, set: { title: "Revised" }, allowAll: true, returning: pojoReturning });
  }
}
