exports.up = (b) => {
  // Create a table with createAt and updatedAt
  b.createTable("authors", {
    id: { type: "id", primaryKey: true },
    firstName: { type: "varchar(255)", notNull: true },
    lastName: { type: "varchar(255)", notNull: false },
    delete: { type: "boolean", notNull: false },
    createdAt: { type: "timestamptz", notNull: true },
    updatedAt: { type: "timestamptz", notNull: true },
  });

  // Create a single table with no created/updated
  b.createTable("book", {
    id: { type: "id", primaryKey: true },
    title: { type: "varchar(255)", notNull: true },
    authorId: { type: "int", references: "authors", notNull: true, deferrable: true, deferred: true },
  });
};
