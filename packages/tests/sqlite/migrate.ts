import { readFileSync, rmSync } from "node:fs";

import Database from "better-sqlite3";

// SQLite has no server to migrate, so recreate the database file that `DATABASE_URL=sqlite:./test.db` reads
rmSync("./test.db", { force: true });
const db = new Database("./test.db");
db.exec(readFileSync("./migrations/schema.sql", "utf8"));
db.close();
