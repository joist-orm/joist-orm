import { MigrationBuilder } from "node-pg-migrate";

export function up(b: MigrationBuilder): void {
  b.sql(`
  CREATE TABLE public."authors" (
    id uuid NOT NULL,
    "firstName" varchar(255) NOT NULL,
    "lastName" varchar(255) NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
  );
`);
  b.sql(`
    CREATE TABLE public."blogPosts" (
      id uuid NOT NULL,
      "title" varchar(255) NOT NULL,
      "authorId" uuid NOT NULL,
      "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "updatedAt" timestamp(3) without time zone NOT NULL
    );
  `);
  b.sql(`
  ALTER TABLE ONLY public."authors"
    ADD CONSTRAINT "authors_pkey" PRIMARY KEY (id);
  `);
  b.sql(`
  ALTER TABLE ONLY public."blogPosts"
    ADD CONSTRAINT "blogPosts_pkey" PRIMARY KEY (id);
  `);
  b.sql(`
    ALTER TABLE ONLY public."blogPosts"
    ADD CONSTRAINT "blogPosts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES public."authors"(id) ON UPDATE CASCADE ON DELETE SET NULL;
    `);
}
