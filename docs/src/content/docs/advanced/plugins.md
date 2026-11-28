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

### beforeCreate

`beforeCreate(entity: Entity): void` runs synchronously once per new entity, after it is registered with
its `EntityManager` but before caller-supplied fields are applied or defaults run. It covers `em.create`,
`em.createPartial`, and the insert paths of `em.upsert` and `em.findOrCreate`, not hydration or updates
to existing entities.

The hook runs in the context that initiated the creation. Use `isInTrustedContext()` to distinguish
a direct create from one initiated inside a trusted callback such as `config.setDefault`.
The separate `config.beforeCreate` lifecycle hook still runs at flush.

### beforeDelete

`beforeDelete(entity: Entity): void` runs synchronously once per entity when `em.delete` first marks it
deleted, before any cascades or unhooking. Throw to deny the delete; Joist calls the hook for every entity
in an `em.delete([...])` call before marking any of them, so a throw leaves all of them undeleted.

The hook runs in the context that initiated the delete. Cascaded deletes, whether of loaded relations
during `em.delete` or of unloaded relations during `em.flush`, run in a trusted context, so use
`isInTrustedContext()` to distinguish them from direct deletes.
The separate `config.beforeDelete` lifecycle hook still runs at flush.

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

`ParsedReadQuery` is a `ParsedSelectQuery` or `ParsedSetQuery` (UNION, INTERSECT, or EXCEPT).
Nested queries remain structured nodes in CTEs, sources, and expressions.

You can directly mutate the query instance, or use a helper method like `visitQuery`:

```ts
beforeQuery(query: ParsedReadQuery): void {
  visitQuery(query, (select) => {
    for (const source of [select.from, ...select.joins.map((join) => join.source)]) {
      // Inspect sources and modify the AST.
    }
  });
}
```

You can modify the AST directly.

`visitQueryExpressions(query, (node, context) => ...)` visits expressions and predicates across
the read statement. The context provides the enclosing `select`, the expression's `clause`, and
`resolveSource(alias)` for local or correlated FROM/JOIN sources. Nested SELECTs have their own
clause context.

### afterQuery

`afterQuery(query: ParsedReadQuery, rows: RowData)` observes the top-level query's rows after they are
returned, before decoding or entity hydration. Both `em.query` and reads through `em.execute` invoke
this hook.

For the SELECT root, plugins can use `query.entityMetadata` and append auxiliary columns to
`query.selects` in `beforeQuery` if they want to return additional data as a sidecar.

A plugin can implement `afterQuery` to inspect results without implementing `beforeQuery`.

For a top-level set operation such as UNION, the root has `kind: "set"` and describes the combined
result, i.e. a union of SELECT clauses.

### beforeExecute

`beforeExecute(query: ParsedExecuteQuery): void` runs after parsing an `em.execute` INSERT,
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
