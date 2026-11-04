import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db } from "./db.ts";

// Async so hashing (~50 ms) doesn't freeze the server for every other visitor.
const scryptAsync = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

/** Rules for a new password; the register form mirrors them in its `pattern`. Returns a Persian error, or null if acceptable. */
export function passwordProblem(password: string, confirm: string) {
  if (password.length < 8 || password.length > 64) return "رمز عبور باید بین ۸ تا ۶۴ کاراکتر باشد";
  // \p{L} and \p{Nd} also accept Persian letters and digits (۰-۹).
  if (!/\p{L}/u.test(password) || !/\p{Nd}/u.test(password)) return "رمز عبور باید حداقل یک حرف و یک عدد داشته باشد";
  if (password !== confirm) return "رمز عبور و تکرار آن یکسان نیستند";
  return null;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await scryptAsync(password, salt, 64)).toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  return timingSafeEqual(await scryptAsync(password, salt, 64), Buffer.from(hash, "hex"));
}

// Failed logins (and register attempts on taken emails), kept in the database so a restart doesn't reset the lock.
// Counted per email+IP (so a stranger can't lock someone else out of their account) and per IP (so one visitor can't try
// many emails or passwords).
const LOCK_WINDOW = 15 * 60 * 1000;
const MAX_PER_EMAIL_AND_IP = 5;
const MAX_PER_IP = 20;
const count = (sql: string, ...args: (string | number)[]) => (db.prepare(`SELECT COUNT(*) AS n FROM login_failures WHERE ${sql}`).get(...args) as { n: number }).n;

/** Login throttle: true after 5 failures for this email from this IP, or 20 from this IP, in the last 15 minutes. */
export function loginLocked(email: string, ip: string, now = Date.now()) {
  const since = now - LOCK_WINDOW;
  return count("email = ? AND ip = ? AND at > ?", email, ip, since) >= MAX_PER_EMAIL_AND_IP || count("ip = ? AND at > ?", ip, since) >= MAX_PER_IP;
}

export function recordLoginFailure(email: string, ip: string, now = Date.now()) {
  // Expired rows are useless, so each new failure clears them; the table stays small.
  db.prepare("DELETE FROM login_failures WHERE at <= ?").run(now - LOCK_WINDOW);
  db.prepare("INSERT INTO login_failures (email, ip, at) VALUES (?, ?, ?)").run(email, ip, now);
}

/** After a successful login or a new password: unlock this email from every IP. */
export function clearLoginFailures(email: string) {
  db.prepare("DELETE FROM login_failures WHERE email = ?").run(email);
}
