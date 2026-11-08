import { del, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import sharp from "sharp";

// With BLOB_READ_WRITE_TOKEN (Vercel, whose disk is thrown away), photos go to Vercel Blob and are stored by their URL.
// Without it (development, tests, Docker), they live next to the database (data/uploads by default): outside public/,
// which `next start` only serves as it was at build time, and covered by the same backup and .gitignore as the data.
const blob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const BLOB_URL = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/products\/[0-9a-f-]{36}\.webp$/;
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

/**
 * Saves an uploaded product photo and returns its public path (or Blob URL). Throws a Persian message if the file isn't acceptable.
 * Phone photos are several MB; each is stored as WebP at most 1200×1500 (upright, metadata such as GPS dropped), so
 * product pages stay light on mobile data.
 */
export async function saveUpload(file: File) {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("حجم تصویر باید حداکثر ۵ مگابایت باشد");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!detectImageType(bytes)) throw new Error("فقط تصویر JPG، PNG یا WEBP قابل بارگذاری است");
  let webp: Buffer;
  try {
    webp = await sharp(bytes).autoOrient().resize(1200, 1500, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  } catch {
    throw new Error("فایل تصویر خراب است یا خوانده نمی‌شود");
  }
  const name = `${randomUUID()}.webp`;
  if (blob) return (await put(`products/${name}`, webp, { access: "public", contentType: "image/webp" })).url;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(join(UPLOAD_DIR, name), webp);
  return `/uploads/${name}`;
}

/** Deletes a saved upload by its public path or Blob URL; anything that isn't one of our generated names is ignored. */
export async function deleteUpload(path: string) {
  if (BLOB_URL.test(path)) return del(path);
  const name = path.replace(/^\/uploads\//, "");
  if (path.startsWith("/uploads/") && NAME.test(name)) await rm(join(UPLOAD_DIR, name), { force: true });
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
