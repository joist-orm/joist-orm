export interface EnumMetadata<C, D, I extends number | string = number | string> {
  /** Returns the enum type's name, i.e. `AuthorStatus`. */
  name: string;

  /** Gets the `code` details, i.e. `Statuses.getByCode(Status.DRAFT)`. */
  getByCode(code: C): D;

  /** Finds a code details for `code`, i.e. `Statuses.findByCode("DRAFT")`, returns `undefined` is not found. */
  findByCode(code: string): D | undefined;

  /** Finds a code details for `id`, i.e. `Statuss.findById(2)`, returns `undefined` is not found. */
  findById(id: I): D | undefined;

  /** Returns all the codes, i.e. `[Status.DRAFT, Status.PUBLISHED]`. */
  getValues(): ReadonlyArray<C>;

  /** Returns all the details. */
  getDetails(): ReadonlyArray<D>;
}
