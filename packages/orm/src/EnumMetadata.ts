export interface EnumMetadata<C, D, I extends number | string = number | string> {
  name: string;
  getByCode(code: C): D;
  findByCode(code: C): D | undefined;
  findById(id: I): D | undefined;
  getValues(): ReadonlyArray<C>;
  getDetails(): ReadonlyArray<D>;
}
