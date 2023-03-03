import { fail } from "src/utils";
import { Entity } from "./Entity";
import { FieldsOf, IdOf, MaybeAbstractEntityConstructor } from "./EntityManager";
import { getMetadata } from "./EntityMetadata";
import { ColumnCondition, mapToDb, ParsedValueFilter } from "./QueryParser";
import { Column } from "./serde";

/** Creates an alias for complex filtering against `T`. */
export function alias<T extends Entity>(cstr: MaybeAbstractEntityConstructor<T>): Alias<T> {
  return newAliasProxy(cstr);
}

/** Creates multiple aliases for complex filtering. */
export function aliases<T extends readonly MaybeAbstractEntityConstructor<any>[]>(
  ...type: T
): { [P in keyof T]: T[P] extends MaybeAbstractEntityConstructor<infer E extends Entity> ? Alias<E> : never } {
  return type.map((t) => newAliasProxy(t)) as any;
}

export type Alias<T extends Entity> = {
  [P in keyof FieldsOf<T>]: FieldsOf<T>[P] extends { kind: "primitive" | "enum"; type: infer V }
    ? PrimitiveAlias<V>
    : FieldsOf<T>[P] extends { kind: "m2o"; type: infer U }
    ? EntityAlias<U>
    : never;
};

export interface PrimitiveAlias<V> {
  eq(value: V): ColumnCondition;
  ne(value: V): ColumnCondition;
  in(values: V[]): ColumnCondition;
  gt(value: V): ColumnCondition;
  gte(value: V): ColumnCondition;
  lt(value: V): ColumnCondition;
  lte(value: V): ColumnCondition;
  like(value: V): ColumnCondition;
  ilike(value: V): ColumnCondition;
  between(v1: V, v2: V): ColumnCondition;
}

export interface EntityAlias<T> {
  eq(value: T | IdOf<T> | null): ColumnCondition;
  ne(value: T | IdOf<T> | null): ColumnCondition;
  in(value: Array<T | IdOf<T>>): ColumnCondition;
}

export const aliasMgmt = Symbol("aliasMgmt");

/** Management interface for `QueryParser` to set Alias's canonical alias. */
export interface AliasMgmt {
  tableName: string;
  setAlias(alias: string): void;
}

export function newAliasProxy<T extends Entity>(cstr: MaybeAbstractEntityConstructor<T>): Alias<T> {
  const meta = getMetadata(cstr);
  const conditions: ColumnCondition[] = [];
  // Give QueryBuilder a hook to assign our actual alias
  const mgmt: AliasMgmt = {
    tableName: meta.tableName,
    setAlias(newAlias: string) {
      conditions.forEach((c) => (c.alias = newAlias));
    },
  };
  return new Proxy(cstr, {
    /** Create a column alias for the given field. */
    get(target, key: PropertyKey): any {
      if (key === aliasMgmt) {
        return mgmt;
      }
      const field = meta.allFields[key as string] ?? fail(`No field ${String(key)} on ${cstr.name}`);
      switch (field.kind) {
        case "primaryKey":
        case "primitive":
        case "enum":
          return new PrimitiveAliasImpl(conditions, field.serde!.columns[0]);
        case "m2o":
          return new EntityAliasImpl(conditions, field.serde!.columns[0]);
        default:
          throw new Error(`Unsupported alias field kind ${field.kind}`);
      }
    },
  }) as any;
}

export function isAlias(obj: any): obj is Alias<any> & { [aliasMgmt]: AliasMgmt } {
  // Oddly enough `typeof` will be a function b/c we are proxying the constructors
  return obj && typeof obj === "function" && obj[aliasMgmt] !== undefined;
}

class PrimitiveAliasImpl<V> implements PrimitiveAlias<V> {
  public constructor(private conditions: ColumnCondition[], private column: Column) {}

  eq(value: V): ColumnCondition {
    return this.addCondition({ kind: "eq", value });
  }

  ne(value: V): ColumnCondition {
    return this.addCondition({ kind: "ne", value });
  }

  gt(value: V): ColumnCondition {
    return this.addCondition({ kind: "gt", value });
  }

  gte(value: V): ColumnCondition {
    return this.addCondition({ kind: "gte", value });
  }

  lt(value: V): ColumnCondition {
    return this.addCondition({ kind: "lt", value });
  }

  lte(value: V): ColumnCondition {
    return this.addCondition({ kind: "lte", value });
  }

  between(v1: V, v2: V): ColumnCondition {
    return this.addCondition({ kind: "between", value: [v1, v2] });
  }

  like(value: V): ColumnCondition {
    return this.addCondition({ kind: "like", value });
  }

  ilike(value: V): ColumnCondition {
    return this.addCondition({ kind: "ilike", value });
  }

  in(values: V[]): ColumnCondition {
    return this.addCondition({ kind: "in", value: values });
  }

  private addCondition(value: ParsedValueFilter<V>): ColumnCondition {
    const cond: ColumnCondition = {
      alias: "unset",
      column: this.column.columnName,
      cond: mapToDb(this.column, value),
    };
    this.conditions.push(cond);
    return cond;
  }
}

class EntityAliasImpl<T> implements EntityAlias<T> {
  public constructor(private conditions: ColumnCondition[], private column: Column) {}

  eq(value: T | IdOf<T> | null): ColumnCondition {
    if (value === null) {
      return this.addCondition({ kind: "is-null" });
    } else {
      return this.addCondition({ kind: "eq", value });
    }
  }

  ne(value: T | IdOf<T> | null): ColumnCondition {
    if (value === null) {
      return this.addCondition({ kind: "not-null" });
    } else {
      return this.addCondition({ kind: "ne", value });
    }
  }

  in(value: Array<T | IdOf<T>>): ColumnCondition {
    return this.addCondition({ kind: "in", value });
  }

  private addCondition(value: ParsedValueFilter<T | IdOf<T>>): ColumnCondition {
    const cond: ColumnCondition = {
      alias: "unset",
      column: this.column.columnName,
      cond: mapToDb(this.column, value),
    };
    this.conditions.push(cond);
    return cond;
  }
}
