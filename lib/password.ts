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
// Counted per email+IP (so a stranger can't lock someone else out of their account) and per IP (so one visitor can't try
// many emails or passwords). Keys: "<email>\n<ip>" and "ip:<ip>".
const failures = new Map<string, number[]>();
const LOCK_WINDOW = 15 * 60 * 1000;
const MAX_PER_EMAIL_AND_IP = 5;
const MAX_PER_IP = 20;
const pairKey = (email: string, ip: string) => `${email}\n${ip}`;

function recent(key: string, now: number) {
  const times = (failures.get(key) ?? []).filter((t) => now - t < LOCK_WINDOW);
  if (times.length) failures.set(key, times);
  else failures.delete(key);
  return times.length;
}

/** Login throttle: true after 5 failures for this email from this IP, or 20 from this IP, in the last 15 minutes. */
export function loginLocked(email: string, ip: string, now = Date.now()) {
  return recent(pairKey(email, ip), now) >= MAX_PER_EMAIL_AND_IP || recent(`ip:${ip}`, now) >= MAX_PER_IP;
}

export function recordLoginFailure(email: string, ip: string, now = Date.now()) {
  // Drop expired entries now and then, so random emails can't grow the map forever.
  if (failures.size > 10_000) for (const key of [...failures.keys()]) recent(key, now);
  for (const key of [pairKey(email, ip), `ip:${ip}`]) failures.set(key, [...(failures.get(key) ?? []), now]);
}

/** After a successful login or a new password: unlock this email from every IP. */
export function clearLoginFailures(email: string) {
  for (const key of failures.keys()) if (key.startsWith(`${email}\n`)) failures.delete(key);
}
