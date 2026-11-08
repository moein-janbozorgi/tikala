// One-off, for moving an existing shop to Turso: writes a single-file copy of the database, with the latest changes
// (still in shop.db-wal) included, in the format `turso db create --from-file` needs. The original database is opened
// read-only and never changed. Stop the shop's server first.
//   node scripts/export-for-turso.mjs [database, default data/shop.db] [output, default data/turso-import.db]
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";

const [source = "data/shop.db", target = "data/turso-import.db"] = process.argv.slice(2);
if (existsSync(target)) throw new Error(`${target} already exists; delete it first`);

const original = new DatabaseSync(source, { readOnly: true });
original.prepare("VACUUM INTO ?").run(target); // one consistent snapshot: the file plus everything in its WAL

const copy = new DatabaseSync(target);
copy.exec("PRAGMA journal_mode = WAL"); // Turso's import requires WAL mode

// Same tables with the same rows, and the settings Turso checks.
const tables = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((t) => t.name);
const count = (db, t) => db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n;
const pragma = (db, p) => Object.values(db.prepare(`PRAGMA ${p}`).get())[0];
assert.deepEqual(tables(copy), tables(original), "same tables");
for (const t of tables(original)) assert.equal(count(copy, t), count(original, t), `same number of rows in ${t}`);
assert.equal(pragma(copy, "user_version"), pragma(original, "user_version"), "same schema version");
assert.equal(pragma(copy, "integrity_check"), "ok");
assert.equal(copy.prepare("PRAGMA foreign_key_check").all().length, 0, "no broken references");
assert.equal(pragma(copy, "journal_mode"), "wal");
assert.equal(pragma(copy, "page_size"), 4096);
assert.equal(pragma(copy, "auto_vacuum"), 0);

for (const t of ["users", "orders", "order_items", "products", "variants", "product_images", "coupons"]) console.log(`${t}: ${count(copy, t)}`);
console.log(`schema version ${pragma(copy, "user_version")}; checks passed. Import with: turso db create <name> --from-file ${target}`);
original.close();
copy.close(); // a clean close folds its WAL back in, leaving one file
