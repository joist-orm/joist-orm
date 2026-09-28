# Core implementation

The source root holds the central entity model, EntityManager, metadata, configuration, and field and entity creation APIs. Feature directories group the supporting implementations:

| Directory       | Responsibility                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `loading/`      | Load hints, lenses, loaded-entity APIs, hint trees, and loaded-state caching                     |
| `serde/`        | Scalar codecs, field bindings, physical columns, SQL type compatibility, and Temporal conversion |
| `reactivity/`   | Reactive hints, dependency traversal, and downstream recalculation                               |
| `flush/`        | Pending entity and join-row changes, grouped write work, and flush locking                       |
| `queries/`      | SQL-shaped queries, entity-shaped finds, and shared SQL construction helpers                     |
| `drivers/`      | Driver contracts, driver-facing helpers, entity write generation, and ID assignment              |
| `dataloaders/`  | Find and lens batching and execution adapters                                                    |
| `batchloaders/` | Entity and relation loading batches                                                              |
| `preloading/`   | Planning and hydrating joined/preloaded entity graphs                                            |
| `relations/`    | Relation and derived-property implementations                                                    |
| `plugins/`      | Built-in EntityManager plugins                                                                   |
| `logging/`      | Factory, field, and reaction logging                                                             |

EntityManager coordinates these components. Public exports are declared in `index.ts`; prefer direct imports between implementation modules. Shared hint normalization stays in `normalizeHints.ts`, and the driver-row representation stays in `RowData.ts`.
