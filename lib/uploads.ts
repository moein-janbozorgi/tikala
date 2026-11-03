import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// Uploads live next to the database (data/uploads by default): outside public/, which `next start` only serves as it
// was at build time, and covered by the same backup and .gitignore as the data.
export const UPLOAD_DIR = join(dirname(process.env.DB_PATH ?? "data/shop.db"), "uploads");
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const NAME = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;
export const CONTENT_TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

/** Image type from the file's first bytes, never from its name or the browser's claim. */
export function detectImageType(bytes: Uint8Array): keyof typeof CONTENT_TYPES | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (ascii(1, 4) === "PNG" && bytes[0] === 0x89) return "png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  return null;
}

/** Saves an uploaded product photo and returns its public path. Throws a Persian message if the file isn't acceptable. */
export async function saveUpload(file: File) {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("حجم تصویر باید حداکثر ۵ مگابایت باشد");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) throw new Error("فقط تصویر JPG، PNG یا WEBP قابل بارگذاری است");
  const name = `${randomUUID()}.${type}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(join(UPLOAD_DIR, name), bytes);
  return `/uploads/${name}`;
}

/** Reads a saved upload by its file name; null for anything that isn't one of our generated names. */
export async function readUpload(name: string) {
  const match = NAME.exec(name);
  if (!match) return null;
  try {
    return { bytes: await readFile(join(UPLOAD_DIR, name)), type: CONTENT_TYPES[match[1] as keyof typeof CONTENT_TYPES] };
  } catch {
    return null;
  }
}
