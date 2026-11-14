---
title: Plugins
description: Hooking into entity lifecycle events
sidebar:
  order: 15
---

Joist supports a plugin system that allows you to hook into entity lifecycle events and implement cross-cutting concerns across your domain model.

Plugins are useful for implementing features like:

- Auditing and logging entity changes
- Enforcing security policies or access control
- Applying business rules before certain operations
- Integrating with external systems on entity events

## Creating a Plugin

To create a plugin, extend the `Plugin` base class and implement any of the available plugin methods:

```typescript
import { Plugin } from "joist-orm";

export class MyPlugin extends Plugin {
  beforeSetField(entity: Entity, field: string, newValue: any): void {
    // Called before a field value is set on an entity via setField
    console.log(`Setting ${field} to ${newValue} on ${entity}`);
  }

  beforeFind(
    meta: EntityMetadata,
    operation: FindOperation,
    query: ParsedFindQuery,
    settings: { limit?: number; offset?: number },
  ): void {
    // Called before a find operation is executed
    console.log(`Finding ${meta.type} with operation ${operation}`);
  }

  afterFind(meta: EntityMetadata, operation: FindOperation, rows: RowData): void {
    // Called after a find operation with a read-only view of the raw database rows
    console.log(`Found ${rows.rowCount} ${meta.type} rows`);
  }
}
```

## Registering Plugins

Register plugins with your `EntityManager` using the `PluginManager`:

```typescript
const em = new EntityManager(...);
const myPlugin = new MyPlugin();
em.plugins.addPlugin(myPlugin);
```

Once registered, the plugin will automatically receive callbacks for any implemented methods.

## Available Plugin Hooks

### beforeSetField

Called before a field value is set on an entity via `setField`. This is useful for implementing validation, access control, or auditing on field changes.

```typescript
beforeSetField(entity: Entity, field: string, newValue: any): void {
  if (this.isImmutable(entity)) {
    throw new Error(`Cannot modify immutable entity ${entity}`);
  }
}
```

### beforeFind

Called before a find operation is executed. This allows you to inspect or modify query parameters, implement query logging, or enforce security policies.

```typescript
beforeFind(
  meta: EntityMetadata,
  operation: FindOperation,
  query: ParsedFindQuery,
  settings: { limit?: number; offset?: number },
): void {
  // Log all queries for a specific entity type
  if (meta.type === "Author") {
    console.log("Querying authors:", query);
  }
}
```

### beforeQuery

`beforeQuery(query: ParsedReadQuery)` runs once for an entire read statement from `em.query` or
`em.execute`. Like `beforeFind`, it receives a resolved AST before join pruning and SQL rendering.
These reads do not invoke `beforeFind`/`afterFind`.

`ParsedReadQuery` is a `ParsedSelectQuery` or `ParsedSetQuery` (UNION, INTERSECT, or EXCEPT).
Nested queries remain structured nodes in CTEs, sources, and expressions until rendering.
Use `visitQuery` to rewrite the SELECTs in the tree:

```ts
beforeQuery(query: ParsedReadQuery): void {
  visitQuery(query, (select) => {
    for (const table of select.tables) {
      // Inspect referenced fields and append this table's policy conditions.
    }
  });
}
```

The visitor snapshots the original SELECT nodes before invoking callbacks, so injected policy
subqueries are not recursively visited. CTE definitions are visited once; references to a CTE,
including recursive self-references, do not revisit its definition.

`select.tables` lists physical sources with metadata (when available), schema, resolved alias,
join kind, and referenced physical columns. Correlated column references belong to the enclosing
source. Reads are collected before pruning, so this information is conservative and may include
joins, CTEs, or expressions that are subsequently discarded.

Append `ParsedExpressionCondition` values to each table's `conditions` array, using the same column
predicates, AND/OR groups, and EXISTS subqueries as `ParsedFindQuery`. Joist renders these conditions
when assembling the SQL, including their bindings. Conditions go in the primary table's `WHERE` or
the joined table's `ON`, with parentheses to preserve existing boolean expressions. Injections do not
retain otherwise-pruned joins and must reference only aliases already available at that source.

`select.hasRawSql` identifies opaque SQL templates or literal raw conditions. These cannot provide
reliable table/column lineage; an authorization plugin can reject them. Custom expression
implementations are trusted code and must report their reads through `ExprContext`.

`select.selects` is the appendable SELECT list for both entity and projected results.
`select.entityMetadata` is present only for full entity selections; the primary entry in `select.tables`
supplies the entity's SQL alias. Projected values have no entity getters, so authorization plugins must
enforce their field policies during compilation.

### afterQuery

`afterQuery(query: ParsedReadQuery, rows: RowData)` observes the outer read's driver rows once, before
decoding or entity hydration. Both `em.query` and reads through `em.execute` invoke this hook.
Nested SELECTs do not have separate result callbacks, and mutation RETURNING rows do not invoke it.

For a SELECT root, plugins can use `query.entityMetadata` and auxiliary columns added to `query.selects` to cache permission
data before public entity visibility checks. `rows` has the same observation-only interface as `afterFind`.
An `afterQuery` hook works without a `beforeQuery` hook. For a top-level set operation such as UNION,
the root has `kind: "set"` and describes the combined result; its operands own the SELECT clauses.

### beforeExecute

`beforeExecute(query: ParsedExecuteQuery): void` runs once after parsing an immediate INSERT,
UPDATE, or DELETE, before pruning and rendering it. The AST includes the target, assignments,
VALUES or INSERT source, conditions, RETURNING, and nested read queries.

Throw to reject writes that would bypass entity setters, reactions, and flush validation.
Use `visitQuery(query, ...)` to apply policies to reads inside the mutation. Those reads do not
invoke `beforeQuery` separately. A SELECT passed to `em.execute` uses `beforeQuery` instead.

### afterFind

Called after a find operation has been executed with a read-only `RowData` view of the raw
database rows. This is useful for observing results, collecting metrics, or tracing query
behavior.

The view is deliberately lazy-friendly: with `lazyRows` enabled, rows are undecoded wire bytes,
so a hook that only reads `rows.rowCount` costs nothing, `rows.get(rowIndex, columnName)`
decodes just that cell, and `rows.toRows()` materializes classic POJO rows (decoding every cell
of every row — only call it when you actually need the objects). Mutating materialized rows is
unsupported and is not guaranteed to affect entity hydration.

```typescript
afterFind(meta: EntityMetadata, operation: FindOperation, rows: RowData): void {
  // Track query metrics; reading only rowCount never decodes any cells
  this.metrics.recordQuery(meta.type, operation, rows.rowCount);
}
```

## Accessing the EntityManager

Plugins have access to their associated `EntityManager` via the `em` property:

```typescript
export class AuditPlugin extends Plugin {
  beforeSetField(entity: Entity, field: string, newValue: any): void {
    // Create an audit log entry using the plugin's EntityManager
    this.em.create(AuditLog, {
      entity: entity.id,
      field,
      newValue,
      timestamp: new Date(),
    });
  }
}
```

## Example: Immutable Entities Plugin

Here's a complete example of a plugin that joist itself implements that prevents modifications to specific entities:

```typescript
import { Entity, Plugin, fail } from "joist-orm";

export class ImmutableEntitiesPlugin extends Plugin {
  readonly entities: Set<Entity> = new Set();

  beforeSetField(entity: Entity, field: string, newValue: any): void {
    if (this.entities.has(entity)) {
      fail(`Cannot set field ${field} on immutable entity ${entity}`);
    }
  }

  addEntity(entity: Entity) {
    this.entities.add(entity);
  }

  removeEntity(entity: Entity) {
    this.entities.delete(entity);
  }
}
```

Usage:

```typescript
const em = new EntityManager(...);
const immutablePlugin = new ImmutableEntitiesPlugin();
em.plugins.addPlugin(immutablePlugin);

const author = await em.load(Author, "a:1");
immutablePlugin.addEntity(author);

// This will throw an error
author.firstName = "Bob"; // Error: Cannot set field firstName on immutable entity...
```

## Performance Considerations

Joist's plugin system is designed to be zero-cost when plugins are not using specific hooks. The `PluginManager` only creates dispatcher methods for callbacks that have at least one registered plugin, so unused plugin hooks have no runtime overhead.

This means you can safely register plugins that only implement a subset of available hooks without worrying about performance impact from the unused hooks.

## Best Practices

- **Keep plugins focused**: Each plugin should handle a single concern (auditing, security, etc.)
- **Avoid excessive computation**: Each hook is called for every event and thus should be fast
- **Use plugin state carefully**: Remember that plugins are shared across the entire `EntityManager` lifecycle
- **Don't modify entities in beforeSetField**: This hook is for validation and auditing, not for changing values
