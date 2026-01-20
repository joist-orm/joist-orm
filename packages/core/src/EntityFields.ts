/** All the fields for an entity in the `FieldsOf` / `EntityField` format. */
export type EntityFields<T> = {
  [K in keyof T]: EntityField;
};

export type EntityField =
  | { kind: "primitive"; type: unknown; unique: boolean; nullable: never | undefined; derived: boolean }
  | { kind: "enum"; type: unknown; nullable: never | unknown }
  | { kind: "m2o"; type: unknown; nullable: never | unknown; derived: boolean }
  | { kind: "poly"; type: unknown; nullable: never | unknown };

/** The subset of primitive, enum, and m2o fields from the `F` that are settable, i.e. not derived. */
export type SettableFields<F> = {
  [K in keyof F]: F[K] extends { kind: "primitive"; derived: false }
    ? F[K]
    : F[K] extends { kind: "enum" }
      ? F[K]
      : F[K] extends { kind: "m2o"; derived: false }
        ? F[K]
        : never;
};
