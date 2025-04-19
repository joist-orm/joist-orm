const {
  createEntityTable,
  createUpdatedAtFunction,
  createCreatedAtFunction,
  createUnnest2d1dFunction,
} = require("joist-migration-utils");
exports.up = (b) => {
  createUpdatedAtFunction(b);
  createCreatedAtFunction(b);
  createUnnest2d1dFunction(b);

  createEntityTable(b, "authors", {
    firstName: { type: "varchar(255)", notNull: true },
    lastName: { type: "varchar(255)", notNull: false },
    birthday: { type: "date", notNull: true },
    children_birthdays: { type: "date[]", notNull: true, default: "{}" },
    timestamp: { type: "timestamp", notNull: true, default: "NOW()" },
    timestamps: { type: "timestamp[]", notNull: true, default: "{}" },
    time: { type: "time without time zone", notNull: false, default: "00:00:00" },
    times: { type: "time without time zone[]", notNull: true, default: "{}" },
    time_to_micros: { type: "time(6)", notNull: false, default: "00:00:00" },
  });

  createEntityTable(b, "book", {
    title: { type: "varchar(255)", notNull: true },
    author_id: { type: "int", references: "authors", notNull: true, deferrable: true, deferred: true },
    published_at: { type: "timestamptz", notNull: true },
    timestampTzs: { type: "timestamptz[]", notNull: true, default: "{}" },
  });
};
