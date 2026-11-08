// One-off, for moving an existing shop to Vercel: copies the photos in data/uploads to Vercel Blob and points the
// Turso database at their new URLs. Run it once, after importing data/shop.db into Turso (see README → Vercel):
//   node --env-file=.env.vercel scripts/move-uploads.mjs [uploads folder, default data/uploads]
// Safe to run again: a photo already moved no longer starts with /uploads/, so it is skipped.
// Only the Turso database is changed; data/uploads and data/shop.db are only read.
import { createClient } from "@libsql/client";
import { put } from "@vercel/blob";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

for (const name of ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "BLOB_READ_WRITE_TOKEN"]) {
  if (!process.env[name]) throw new Error(`${name} is not set`);
}
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const dir = process.argv[2] ?? "data/uploads";
const NAME = /^[0-9a-f-]{36}\.(jpg|png|webp)$/; // the names lib/uploads.ts generates
const TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const OLD_PATHS = "SELECT image AS path FROM products WHERE image LIKE '/uploads/%' UNION SELECT path FROM product_images WHERE path LIKE '/uploads/%'";

let moved = 0;
for (const { path } of (await db.execute(OLD_PATHS)).rows) {
  const name = String(path).slice("/uploads/".length);
  const match = NAME.exec(name);
  let bytes;
  try {
    if (!match) throw new Error("not an uploaded photo name");
    bytes = await readFile(join(dir, name));
  } catch (e) {
    console.warn(`skipped ${path}: ${e.message}`);
    continue;
  }
  // allowOverwrite: a rerun after a failed database update uploads the same name again.
  const { url } = await put(`products/${name}`, bytes, { access: "public", contentType: TYPES[match[1]], allowOverwrite: true });
  // The database only points at the Blob copy once that copy reads back byte for byte; local files are never changed.
  const stored = Buffer.from(await (await fetch(url, { cache: "no-store" })).arrayBuffer());
  if (!stored.equals(bytes)) {
    console.warn(`skipped ${path}: the copy at ${url} doesn't match the local file`);
    continue;
  }
  await db.batch(
    [
      { sql: "UPDATE products SET image = ? WHERE image = ?", args: [url, path] },
      { sql: "UPDATE product_images SET path = ? WHERE path = ?", args: [url, path] },
    ],
    "write",
  );
  moved++;
}
const left = (await db.execute(OLD_PATHS)).rows.length;
console.log(`${moved} photos moved to Vercel Blob; ${left} /uploads/ paths still in the database${left ? " (see the warnings above)" : ""}.`);
