const { createEntityTable, createUpdatedAtFunction, createCreatedAtFunction } = require("joist-migration-utils");
exports.up = (b) => {
  createUpdatedAtFunction(b);
  createCreatedAtFunction(b);

  createEntityTable(b, "authors", {
    firstName: { type: "varchar(255)", notNull: true },
    lastName: { type: "varchar(255)", notNull: false },
    birthday: { type: "date", notNull: true },
    children_birthdays: { type: "date[]", notNull: true, default: "{}" },
    timestamp: { type: "timestamp", notNull: true },
    timestamps: { type: "timestamp[]", notNull: true, default: "{}" },
  });

  createEntityTable(b, "book", {
    title: { type: "varchar(255)", notNull: true },
    author_id: { type: "int", references: "authors", notNull: true, deferrable: true, deferred: true },
    published_at: { type: "timestamptz", notNull: true },
    timestampTzs: { type: "timestamptz[]", notNull: true, default: "{}" },
  });
};
