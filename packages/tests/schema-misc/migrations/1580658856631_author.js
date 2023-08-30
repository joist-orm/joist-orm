exports.up = (b) => {
  // Create a table with createAt and updatedAt
  b.createTable("authors", {
    id: { type: "id", primaryKey: true },
    firstName: { type: "varchar(255)", notNull: true },
    lastName: { type: "varchar(255)", notNull: false },
    createdAt: { type: "timestamptz", notNull: true },
    updatedAt: { type: "timestamptz", notNull: true },
  });

  // Create a single table with no created/updated
  b.createTable("book", {
    id: { type: "id", primaryKey: true },
    title: { type: "varchar(255)", notNull: true },
    authorId: { type: "int", references: "authors", notNull: true, deferrable: true, deferred: true },
  });

  // Create tables with camel case column
  b.sql(`
    CREATE TABLE public."artists" (
      id uuid NOT NULL,
      "firstName" varchar(255) NOT NULL,
      "lastName" varchar(255) NOT NULL,
      "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "updatedAt" timestamp(3) without time zone NOT NULL
    );
  `);
  b.sql(`
    CREATE TABLE public."paintings" (
      id uuid NOT NULL,
      "title" varchar(255) NOT NULL,
      "artistId" uuid NOT NULL,
      "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "updatedAt" timestamp(3) without time zone NOT NULL
    );
  `);
  b.sql(`ALTER TABLE ONLY public."artists" ADD CONSTRAINT "artists_pkey" PRIMARY KEY (id);`);
  b.sql(`ALTER TABLE ONLY public."paintings" ADD CONSTRAINT "paintings_pkey" PRIMARY KEY (id);`);
  b.sql(`ALTER TABLE ONLY public."paintings"
    ADD CONSTRAINT "paintings_artistId_fkey" FOREIGN KEY ("artistId")
    REFERENCES public."artists"(id) ON UPDATE CASCADE ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
  `);

  // Create a table with a tag (`do`) that is a SQL keyword
  b.createTable("database_owners", {
    id: { type: "id", primaryKey: true },
    name: { type: "varchar(255)", notNull: true },
  });
};
