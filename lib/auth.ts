import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";

export type User = { id: number; name: string; email: string | null; phone: string | null; has_password: number; is_admin: number };

// The only account allowed into the admin panel: whichever one has this verified mobile number. Owning the number is
// proven by an SMS code (phone login, or linking it in the account page), so no one else can take it over.
const ADMIN_PHONE = process.env.ADMIN_PHONE ?? "09370952694";

const COOKIE = "session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds
// Only the hash is stored, so a leaked database can't be used to log in.
const sha = (token: string) => createHash("sha256").update(token).digest("hex");

export async function startSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
    sha(token),
    userId,
    Date.now() + MAX_AGE * 1000,
  );
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(token));
  store.delete(COOKIE);
}

/** Signs out every other device of this user, e.g. after a password change, so a stolen session stops working. */
export async function endOtherSessions(userId: number) {
  const token = (await cookies()).get(COOKIE)?.value ?? "";
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(userId, sha(token));
}

export async function getUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return undefined;
  return db
    .prepare(
      `SELECT u.id, u.name, u.email, u.phone, u.password_hash IS NOT NULL AS has_password, u.phone IS ? AS is_admin
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(ADMIN_PHONE, sha(token), Date.now()) as User | undefined;
}

export async function requireUser(next: string) {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

export async function requireAdmin() {
  const user = await getUser();
  if (!user?.is_admin) redirect("/login?next=/admin");
  return user;
}
