import { applySchema } from "./schema.mjs";
import { openDb } from "./db-client.mjs";

const db = openDb();
await applySchema(db);
console.log("✔ database schema ready");
db.close();
