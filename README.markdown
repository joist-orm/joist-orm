
## ts-joist

An opinionated ORM for TypeScript/node.

### Goals

* Schema-Driven Code Generation (generated classes w/the getter/setter/relation boilerplate)
* Gauranteed N+1 safe (pervasive use of DataLoader)
* Async/Await All Relations (with a synchronous escape hatch) 
* Best-in-class Performance (all select/insert/update operations are bulk)
* Fast Unit Tests (for downstream projects, baseline is 10-20ms/test case)
* Unit of Work
* Small & simple codebase (maintainable by a single engineer if needed)

(See below for more in-depth descriptions of each bullet.)

### Non-Goals

* NoSQL/Mongo/etc. support.
* Anything-but-Postgres support at this point.
* Browser/client-side support

### Todo

* Codegen
* Deleting entities
  * Cascading deletions
  * Removing entity from non-cascaded references/collections
* Delete from one-to-manys
* Delete from many-to-manys
* Constructor opts should match required fields
* `EntityManager.find`
* `EntityManager.populate`

