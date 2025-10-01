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

  afterFind(meta: EntityMetadata, operation: FindOperation, rows: any[]): void {
    // Called after a find operation with the raw database rows
    console.log(`Found ${rows.length} ${meta.type} rows`);
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

### afterFind

Called after a find operation has been executed with the raw database rows. This is useful for post-processing results or collecting metrics.

```typescript
afterFind(meta: EntityMetadata, operation: FindOperation, rows: any[]): void {
  // Track query metrics
  this.metrics.recordQuery(meta.type, operation, rows.length);
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