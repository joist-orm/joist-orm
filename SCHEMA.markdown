
Joist makes several assumptions about your schema.

Ideally you are developing your database schema greenfield with Joist from day one.

However, if this is not the case, hopefully it would not be too bad to nudge your schema towards what Joist expects.

### Entity tables

Joist expects entity tables to be identifiable by having at least these three columns:

* `id` primary key/serial
* `created_at` timestamptz
* `updated_at` timestamptz

Joist will maintain the `created_at`/`updated_at` columns for you, although you can also use ...these triggers... that will ensure non-Joist clients also have those columns set for them.

### Enum tables

Joist expects tables that you want to show up as enums to have three columns:

* `id` primary key/serial
* `code` i.e. `FOO_BAR`
* `name` i.e. `Foo Bar`

Entities that want to use this enum should have a foreign key that references the appropriate enum table.

### Deferred Foreign Key Constraints


