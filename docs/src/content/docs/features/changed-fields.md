---
title: Changed Fields
description: Documentation for Changed Fields
---

Each entity tracks which of its fields has changed within the current unit of work/`EntityManager`:

```typescript
const a1 = em.load(Author, "1");

// Nothing has changed at first
expect(a1.changes.firstName.hasChanged).toBe(false);

// Now perform some business logic
a1.firstName = "a2";

// And the field shows up has changed
expect(a1.changes.firstName.hasChanged).toBe(true);
expect(a1.changes.firstName.originalValue).toEqual("a1");
```

The `changes` API has three methods:

- `changes.firstName.hasChanged` - is `true` whenever `firstName` has been set, either on a new entity or an existing entity
- `changes.firstName.hasUpdated` - is `true` only when `firstName` has been changed on an existing entity
- `changes.firstName.originalValue` - is the original value, only for an existing entity

### Audit Trails

Note the `changes` API is only for the current in-memory changes being made to an entity, it's not an audit trail.

That said, Joist entities can be used with 3rd-party audit trail solutions like [CyanAudit](https://pgxn.org/dist/cyanaudit/).
