import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

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

// shortcut: failed logins are kept in this server's memory, so a restart clears them and several servers wouldn't share
// them; move them to the database if the shop ever runs on more than one server.
const failures = new Map<string, number[]>();
const LOCK_WINDOW = 15 * 60 * 1000;

/** Login throttle: true once an email has 5 failed attempts in the last 15 minutes. */
export function loginLocked(email: string, now = Date.now()) {
  const recent = (failures.get(email) ?? []).filter((t) => now - t < LOCK_WINDOW);
  if (recent.length) failures.set(email, recent);
  else failures.delete(email);
  return recent.length >= 5;
}

export function recordLoginFailure(email: string, now = Date.now()) {
  failures.set(email, [...(failures.get(email) ?? []), now]);
}

export function clearLoginFailures(email: string) {
  failures.delete(email);
}
