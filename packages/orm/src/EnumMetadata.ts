export interface EnumMetadata<C, D> {
  name: string;
  getByCode(code: C): D;
  findByCode(code: C): D | undefined;
  findById(id: number): D | undefined;
  getValues(): ReadonlyArray<C>;
  getDetails(): ReadonlyArray<D>;
}
