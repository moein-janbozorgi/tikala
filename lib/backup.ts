import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "./db.ts";

// Next to the database (data/backups by default), so the same server backup or copy of data/ covers them.
export const BACKUP_DIR = join(dirname(process.env.DB_PATH ?? "data/shop.db"), "backups");
const KEEP = 14;
const NAME = /^shop-\d{4}-\d{2}-\d{2}\.db$/;

/**
 * Today's backup, unless it already exists, then deletes all but the newest 14. VACUUM INTO makes a consistent copy
 * even while orders are being written. Product photos (data/uploads) are files and aren't in it.
 */
export function dailyBackup(dir = BACKUP_DIR, today = new Date().toISOString().slice(0, 10)) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `shop-${today}.db`);
  if (!existsSync(file)) db.prepare("VACUUM INTO ?").run(file);
  // turbopackIgnore: the backup folder is runtime data, not code to bundle.
  for (const old of readdirSync(/*turbopackIgnore: true*/ dir).filter((f) => NAME.test(f)).sort().slice(0, -KEEP)) rmSync(join(dir, old));
  return file;
}

/** A fresh copy of the whole database, for the admin's download button. */
export function backupNow() {
  const file = join(tmpdir(), `tikla-${randomUUID()}.db`);
  db.prepare("VACUUM INTO ?").run(file);
  try {
    return readFileSync(file);
  } finally {
    rmSync(file, { force: true });
  }
}
