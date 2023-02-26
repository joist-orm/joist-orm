import { Entity } from "./Entity";
import { FieldsOf, MaybeAbstractEntityConstructor } from "./EntityManager";
import { getMetadata } from "./EntityMetadata";
import { ColumnCondition, ParsedValueFilter } from "./QueryParser";

/** Creates an alias for complex filtering against `T`. */
export function alias<T extends Entity>(cstr: MaybeAbstractEntityConstructor<T>): Alias<T> {
  return newAliasProxy(cstr);
}

/** Creates multiple aliases for complex filtering. */
export function aliases<T1 extends Entity, T2 extends Entity>(
  cstr1: MaybeAbstractEntityConstructor<T1>,
  cstr2: MaybeAbstractEntityConstructor<T2>,
): [Alias<T1>, Alias<T2>] {
  return [newAliasProxy(cstr1), newAliasProxy(cstr2)];
}

export type Alias<T extends Entity> = {
  [P in keyof FieldsOf<T>]: FieldsOf<T>[P] extends infer V ? PrimitiveAlias<V> : never;
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
          return new PrimitiveAliasImpl(conditions, field.serde!.columns[0].columnName);
        default:
          throw new Error(`Unsupported alias field kind ${field.kind}`);
      }
    },
  }) as any;
}

class PrimitiveAliasImpl<V> implements PrimitiveAlias<V> {
  public constructor(private conditions: ColumnCondition[], private columnName: string) {}

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
    const cond: ColumnCondition = { alias: "unset", column: this.columnName, cond: value };
    this.conditions.push(cond);
    return cond;
  }
}
