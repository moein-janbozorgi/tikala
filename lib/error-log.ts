import { appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// Next to the database (data/errors.log by default), covered by the same backup and .gitignore as the data.
const FILE = join(dirname(process.env.DB_PATH ?? "data/shop.db"), "errors.log");

/**
 * Appends one server error as a tab-separated line: time, method, path, kind, digest, message. Only the path and
 * message are kept, no headers, so no cookies or sessions end up in the file.
 * shortcut: the file is never rotated; add it to logrotate (or empty it) if it grows.
 */
export async function logError(err: unknown, method: string, path: string, kind: string) {
  const message = err instanceof Error ? err.message : String(err);
  const digest = typeof err === "object" && err && "digest" in err ? String(err.digest) : "";
  try {
    await appendFile(FILE, [new Date().toISOString(), method, path, kind, digest, message.replace(/\s+/g, " ")].join("\t") + "\n");
  } catch (e) {
    console.error("Could not write errors.log", e);
  }
}
