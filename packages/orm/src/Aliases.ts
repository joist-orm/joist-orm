import { groupBy } from "joist-utils";
import { Entity } from "./Entity";
import { FieldsOf, IdOf, MaybeAbstractEntityConstructor, TaggedId } from "./EntityManager";
import {
  EntityMetadata,
  Field,
  PolymorphicField,
  PolymorphicFieldComponent,
  getBaseAndSelfMetas,
  getMetadata,
} from "./EntityMetadata";
import { ColumnCondition, ParsedValueFilter, mapToDb, skipCondition } from "./QueryParser";
import { ExpressionFilter, getConstructorFromTaggedId, maybeResolveReferenceToId } from "./index";
import { Column } from "./serde";
import { fail } from "./utils";

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
  [P in keyof FieldsOf<T>]: FieldsOf<T>[P] extends { kind: "primitive" | "enum"; type: infer V; nullable: infer N }
    ? PrimitiveAlias<V, N extends undefined ? null : never>
    : FieldsOf<T>[P] extends { kind: "m2o"; type: infer U }
    ? EntityAlias<U>
    : FieldsOf<T>[P] extends { kind: "poly"; type: infer U extends Entity }
    ? PolyReferenceAlias<U>
    : never;
};

export interface PrimitiveAlias<V, N extends null | never> {
  eq(value: V | N | undefined): ColumnCondition;
  ne(value: V | N | undefined): ColumnCondition;
  in(values: V[] | undefined): ColumnCondition;
  gt(value: V | undefined): ColumnCondition;
  gte(value: V | undefined): ColumnCondition;
  lt(value: V | undefined): ColumnCondition;
  lte(value: V | undefined): ColumnCondition;
  like(value: V | undefined): ColumnCondition;
  ilike(value: V | undefined): ColumnCondition;
  between(v1: V | undefined, v2: V | undefined): ColumnCondition;
}

export interface EntityAlias<T> {
  eq(value: T | IdOf<T> | null | undefined): ColumnCondition;
  ne(value: T | IdOf<T> | null | undefined): ColumnCondition;
  in(value: Array<T | IdOf<T>> | undefined): ColumnCondition;
}

export const aliasMgmt = Symbol("aliasMgmt");

/** Management interface for `QueryParser` to set Alias's canonical alias. */
export interface AliasMgmt {
  tableName: string;
  setAlias(meta: EntityMetadata, alias: string): void;
}

type ConditionAndAlias = { cond: ColumnCondition; field: Field & { aliasSuffix: string } };

export function newAliasProxy<T extends Entity>(cstr: MaybeAbstractEntityConstructor<T>): Alias<T> {
  const meta = getMetadata(cstr);
  // Keeps a list of conditions we've created for this specific proxy, so that parseFindQuery
  // can tell us, after we've been creating via the `const a = alias(Author)` command, which
  // alias we're actually bound to in the join literal.
  const conditions: ConditionAndAlias[] = [];
  // Give QueryBuilder a hook to assign our actual alias
  const mgmt: AliasMgmt = {
    tableName: meta.tableName,
    setAlias(newMeta: EntityMetadata, newAlias: string) {
      conditions.forEach(({ cond, field }) => {
        // Do we have mismatched `em.find(ChildMeta)` with a `alias(BaseMeta)`? If so, the
        // usual `${field.aliasSuffix}` won't know it should have a suffix, so we need to calc it.
        if (newMeta !== meta) {
          const bases = getBaseAndSelfMetas(newMeta);
          const fieldIsFromBase = bases.includes(newMeta);
          if (fieldIsFromBase) {
            cond.alias = `${newAlias}_b0`;
            return;
          }
        }
        cond.alias = `${newAlias}${field.aliasSuffix}`;
      });
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
          return new PrimitiveAliasImpl(field, conditions, field.serde!.columns[0]);
        case "m2o":
          return new EntityAliasImpl(field, conditions, field.serde!.columns[0]);
        case "poly":
          return new PolyReferenceAlias(conditions, field);
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

class PrimitiveAliasImpl<V, N extends null | never> implements PrimitiveAlias<V, N> {
  public constructor(
    private field: Field & { aliasSuffix: string },
    private conditions: ConditionAndAlias[],
    private column: Column,
  ) {}

  eq(value: V | N | undefined): ColumnCondition {
    if (value === undefined) {
      return skipCondition;
    } else if (value === null) {
      return this.addCondition({ kind: "is-null" });
    } else {
      return this.addCondition({ kind: "eq", value });
    }
  }

  ne(value: V | N | undefined): ColumnCondition {
    if (value === undefined) {
      return skipCondition;
    } else if (value === null) {
      return this.addCondition({ kind: "not-null" });
    } else {
      return this.addCondition({ kind: "ne", value });
    }
  }

  gt(value: V | undefined): ColumnCondition {
    if (value === undefined) return skipCondition;
    return this.addCondition({ kind: "gt", value });
  }

  gte(value: V | undefined): ColumnCondition {
    if (value === undefined) return skipCondition;
    return this.addCondition({ kind: "gte", value });
  }

  lt(value: V | undefined): ColumnCondition {
    if (value === undefined) return skipCondition;
    return this.addCondition({ kind: "lt", value });
  }

  lte(value: V | undefined): ColumnCondition {
    if (value === undefined) return skipCondition;
    return this.addCondition({ kind: "lte", value });
  }

  between(v1: V | undefined, v2: V | undefined): ColumnCondition {
    if (v1 === undefined || v2 === undefined) return skipCondition;
    return this.addCondition({ kind: "between", value: [v1, v2] });
  }

  like(value: V | undefined): ColumnCondition {
    if (value === undefined) return skipCondition;
    return this.addCondition({ kind: "like", value });
  }

  ilike(value: V | undefined): ColumnCondition {
    if (value === undefined) return skipCondition;
    return this.addCondition({ kind: "ilike", value });
  }

  in(values: V[] | undefined): ColumnCondition {
    if (values === undefined) return skipCondition;
    return this.addCondition({ kind: "in", value: values });
  }

  private addCondition(value: ParsedValueFilter<V>): ColumnCondition {
    const cond: ColumnCondition = {
      alias: "unset",
      column: this.column.columnName,
      dbType: this.column.dbType,
      cond: mapToDb(this.column, value),
    };
    this.conditions.push({ cond, field: this.field });
    return cond;
  }
}

class EntityAliasImpl<T> implements EntityAlias<T> {
  public constructor(
    private field: Field & { aliasSuffix: string },
    private conditions: ConditionAndAlias[],
    private column: Column,
  ) {}

  eq(value: T | IdOf<T> | null | undefined): ColumnCondition {
    if (value === undefined) {
      return skipCondition;
    } else if (value === null) {
      return this.addCondition({ kind: "is-null" });
    } else {
      return this.addCondition({ kind: "eq", value });
    }
  }

  ne(value: T | IdOf<T> | null | undefined): ColumnCondition {
    if (value === undefined) {
      return skipCondition;
    } else if (value === null) {
      return this.addCondition({ kind: "not-null" });
    } else {
      return this.addCondition({ kind: "ne", value });
    }
  }

  in(values: Array<T | IdOf<T>> | undefined): ColumnCondition {
    if (values === undefined) return skipCondition;
    return this.addCondition({ kind: "in", value: values });
  }

  private addCondition(value: ParsedValueFilter<T | IdOf<T>>): ColumnCondition {
    const cond: ColumnCondition = {
      alias: "unset",
      column: this.column.columnName,
      dbType: this.column.dbType,
      cond: mapToDb(this.column, value),
    };
    this.conditions.push({ cond, field: this.field });
    return cond;
  }
}

class PolyReferenceAlias<T extends Entity> {
  public constructor(
    private conditions: ConditionAndAlias[],
    private field: PolymorphicField & { aliasSuffix: string },
  ) {}

  eq(value: T | TaggedId | null | undefined): ExpressionFilter | ColumnCondition {
    return this.addEqOrNe("eq", value);
  }

  ne(value: T | TaggedId | null | undefined): ExpressionFilter | ColumnCondition {
    return this.addEqOrNe("ne", value);
  }

  // We required tagged ids for polys
  in(values: Array<T | TaggedId> | undefined): ExpressionFilter | ColumnCondition {
    if (values === undefined) return skipCondition;
    // Split up the ids by constructor
    const idsByConstructor = groupBy(values, (id) => getConstructorFromTaggedId(maybeResolveReferenceToId(id)!).name);
    // Or together `parent_book_id in (1,2,3) OR parent_author_id IN (4,5,6)`
    return {
      or: Object.entries(idsByConstructor).map(([cstrName, ids]) => {
        const comp =
          this.field.components.find((p) => p.otherMetadata().cstr.name === cstrName) ??
          fail(`No component for ${cstrName}`);
        return this.addCondition(comp, { kind: "in", value: ids });
      }),
    };
  }

  private addEqOrNe(kind: "eq" | "ne", value: T | TaggedId | null | undefined): ExpressionFilter | ColumnCondition {
    if (value === undefined) {
      return skipCondition;
    } else if (value === null) {
      // We can AND each of the components as many conditions
      const value = kind === "eq" ? ({ kind: "is-null" } as const) : ({ kind: "not-null" } as const);
      return {
        and: this.field.components.map((p) => this.addCondition(p, value)),
      };
    } else {
      // If we have a value, we can find the component
      const comp =
        this.field.components.find(
          (p) => p.otherMetadata().cstr === getConstructorFromTaggedId(maybeResolveReferenceToId(value) as string),
        ) || fail(`Could not find component for ${value}`);
      return this.addCondition(comp, { kind, value });
    }
  }

  private addCondition(comp: PolymorphicFieldComponent, value: ParsedValueFilter<T | TaggedId>): ColumnCondition {
    const column = this.field.serde.columns.find((c) => c.columnName === comp.columnName) ?? fail("Missing column");
    const cond: ColumnCondition = {
      alias: "unset",
      column: comp.columnName,
      dbType: this.field.serde.columns[0].dbType,
      cond: mapToDb(column, value),
    };
    this.conditions.push({ cond, field: this.field });
    return cond;
  }
}
